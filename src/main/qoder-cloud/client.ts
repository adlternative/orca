import { cancelUnreadResponseBody } from '../lib/unread-response-body'
import {
  cloudAgentSessionStateFromVendor,
  isQoderCloudSessionStatus,
  QODER_CLOUD_PROVIDER_ID,
  qoderCloudSessionUrl,
  type CloudAgentSessionPage,
  type CloudAgentSessionRow,
  type QoderCloudGetSessionResult,
  type QoderCloudListSessionsArgs,
  type QoderCloudListEventsArgs,
  type QoderCloudListEventsResult,
  type QoderCloudListSessionsResult,
  type QoderCloudRequestFailure
} from '../../shared/qoder-cloud-types'
import { verdictFromEventTail } from '../../shared/qoder-cloud-events'
import { parseQoderCloudEventPage } from '../../shared/qoder-cloud-event-parser'
import type { QoderCloudAuthConfig } from './credential-store'
import { failureFromThrow, failureReasonForStatus, vendorErrorMessage } from './request-failures'

// Why 20s: a session page is ~235 KB, and 8s flagged healthy-but-slow reads as 'unreachable'.
const REQUEST_TIMEOUT_MS = 20_000
const MAX_PAGE_LIMIT = 100

type JsonRecord = Record<string, unknown>

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

export function optionalNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function latestOutcomeSummary(value: unknown): CloudAgentSessionRow['outcome'] | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined
  }
  // Why: the vendor appends; the last entry is the one the session is currently judged by.
  const last = value.at(-1)
  if (!isRecord(last)) {
    return undefined
  }
  const id = optionalString(last.outcome_id)
  const result = optionalString(last.result)
  if (!id || !result) {
    return undefined
  }
  return {
    id,
    description: optionalString(last.description) ?? '',
    result,
    iteration: optionalNumber(last.iteration) ?? 0,
    explanation: optionalString(last.explanation),
    completedAt: optionalString(last.completed_at)
  }
}

/** Narrow a vendor Session object; returns null rather than trusting any field. */
export function parseQoderCloudSession(
  value: unknown,
  apiBaseUrl?: string
): CloudAgentSessionRow | null {
  if (!isRecord(value)) {
    return null
  }
  const id = optionalString(value.id)
  if (!id || !isQoderCloudSessionStatus(value.status)) {
    return null
  }
  const agent = isRecord(value.agent) ? value.agent : null
  const usage = isRecord(value.usage) ? value.usage : null
  const archived = optionalString(value.archived_at) !== null
  const outcome = latestOutcomeSummary(value.outcome_evaluations)
  return {
    provider: QODER_CLOUD_PROVIDER_ID,
    id,
    title: optionalString(value.title),
    vendorStatus: value.status,
    state: cloudAgentSessionStateFromVendor(value.status, archived),
    archived,
    agentId: optionalString(agent?.id),
    agentVersion: optionalNumber(agent?.version),
    model: agentModelId(agent?.model),
    environmentId: optionalString(value.environment_id),
    createdAt: optionalString(value.created_at),
    updatedAt: optionalString(value.updated_at),
    url: qoderCloudSessionUrl(id, apiBaseUrl),
    totalCredits: optionalNumber(usage?.total_credits),
    ...(outcome ? { outcome } : {})
  }
}

export function parseQoderCloudSessionPage(
  value: unknown,
  apiBaseUrl?: string
): CloudAgentSessionPage | null {
  if (!isRecord(value) || !Array.isArray(value.data)) {
    return null
  }
  const sessions: CloudAgentSessionRow[] = []
  for (const item of value.data) {
    const session = parseQoderCloudSession(item, apiBaseUrl)
    // Why: one malformed row must not hide the rest of the page.
    if (session) {
      sessions.push(session)
    }
  }
  return { sessions, nextPage: optionalString(value.next_page) }
}

/** `agent.model` is a bare id or a tuning object; the picker needs the id either way. */
function agentModelId(value: unknown): string | null {
  return typeof value === 'string'
    ? value || null
    : isRecord(value)
      ? optionalString(value.id)
      : null
}

export type RawFailure = QoderCloudRequestFailure
type RawResult = { ok: true; body: unknown } | RawFailure

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'DELETE'
  body?: unknown
  /** Lets a caller read a status the generic mapping would flatten (e.g. 409 = busy). */
  classify?: (status: number, body: unknown) => RawFailure | null
  /** Extra request headers, e.g. the vendor's beta flags. */
  headers?: Record<string, string>
}

export async function requestJson(
  config: QoderCloudAuthConfig,
  path: string,
  query?: URLSearchParams,
  options: RequestOptions = {}
): Promise<RawResult> {
  const base = config.baseUrl.replace(/\/+$/, '')
  const suffix = query && [...query.keys()].length > 0 ? `?${query.toString()}` : ''
  let response: Response
  try {
    response = await fetch(`${base}${path}${suffix}`, {
      method: options.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${config.accessToken}`,
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...options.headers
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
  } catch (error) {
    return { ok: false, ...failureFromThrow(error, REQUEST_TIMEOUT_MS) }
  }
  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    await cancelUnreadResponseBody(response)
    if (response.ok) {
      return {
        ok: false,
        reason: 'malformed',
        message: 'Qoder Cloud returned an unreadable body.'
      }
    }
  }
  if (!response.ok) {
    const classified = options.classify?.(response.status, body)
    if (classified) {
      return classified
    }
    return {
      ok: false,
      reason: failureReasonForStatus(response.status),
      message: vendorErrorMessage(body, response.status)
    }
  }
  return { ok: true, body }
}

export async function listQoderCloudSessions(
  config: QoderCloudAuthConfig,
  args: QoderCloudListSessionsArgs = {}
): Promise<QoderCloudListSessionsResult> {
  const query = new URLSearchParams()
  const limit = args.limit ?? null
  if (limit !== null) {
    query.set('limit', String(Math.min(Math.max(Math.trunc(limit), 1), MAX_PAGE_LIMIT)))
  }
  if (args.page) {
    query.set('page', args.page)
  }
  for (const status of args.statuses ?? []) {
    query.append('statuses', status)
  }
  const result = await requestJson(config, '/sessions', query)
  if (!result.ok) {
    return result
  }
  const page = parseQoderCloudSessionPage(result.body, config.baseUrl)
  if (!page) {
    return {
      ok: false,
      reason: 'malformed',
      message: 'Qoder Cloud returned an unexpected page.'
    }
  }
  return { ok: true, page }
}

export async function getQoderCloudSession(
  config: QoderCloudAuthConfig,
  sessionId: string
): Promise<QoderCloudGetSessionResult> {
  const result = await requestJson(config, `/sessions/${encodeURIComponent(sessionId)}`)
  if (!result.ok) {
    return result
  }
  const session = parseQoderCloudSession(result.body, config.baseUrl)
  if (!session) {
    return {
      ok: false,
      reason: 'malformed',
      message: 'Qoder Cloud returned an unexpected session.'
    }
  }
  return { ok: true, session }
}

export async function listQoderCloudEvents(
  config: QoderCloudAuthConfig,
  args: QoderCloudListEventsArgs
): Promise<QoderCloudListEventsResult> {
  const query = new URLSearchParams()
  if (args.limit !== null && args.limit !== undefined) {
    query.set('limit', String(Math.min(Math.max(Math.trunc(args.limit), 1), MAX_PAGE_LIMIT)))
  }
  if (args.page) {
    query.set('page', args.page)
  }
  if (args.order) {
    query.set('order', args.order)
  }
  const result = await requestJson(
    config,
    `/sessions/${encodeURIComponent(args.sessionId)}/events`,
    query
  )
  if (!result.ok) {
    return result
  }
  const page = parseQoderCloudEventPage(result.body)
  if (!page) {
    return {
      ok: false,
      reason: 'malformed',
      message: 'Qoder Cloud returned an unexpected event page.'
    }
  }
  return { ok: true, page }
}

const TAIL_PROBE_CONCURRENCY = 6

/**
 * Why: `status=running` lies for sessions parked on a tool approval. Re-read each running
 * session's newest events and let the tail decide between working and blocked. Bounded
 * concurrency keeps a 20-session refresh from opening 20 sockets at once.
 */
export async function refineRunningSessionsByTail(
  config: QoderCloudAuthConfig,
  sessions: CloudAgentSessionRow[]
): Promise<CloudAgentSessionRow[]> {
  const out = sessions.slice()
  const targets = out
    .map((session, index) => ({ session, index }))
    .filter(({ session }) => session.state === 'working')
  let cursor = 0
  const worker = async (): Promise<void> => {
    while (cursor < targets.length) {
      const { session, index } = targets[cursor++]
      const tail = await listQoderCloudEvents(config, {
        sessionId: session.id,
        limit: 3,
        order: 'desc'
      })
      if (!tail.ok) {
        continue // Why: an unreadable tail leaves the vendor status in place rather than guessing.
      }
      const verdict = verdictFromEventTail(tail.page.events)
      if (verdict?.state === 'blocked') {
        out[index] = {
          ...session,
          state: 'blocked',
          blockedReason: verdict.stopReasonType
        }
      } else if (verdict?.state === 'idle') {
        out[index] = { ...session, state: 'idle' }
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(TAIL_PROBE_CONCURRENCY, targets.length) }, worker)
  )
  return out
}

/** Connect-time proof: the cheapest authenticated call the API offers. */
export async function verifyQoderCloudCredential(
  config: QoderCloudAuthConfig
): Promise<{ ok: true } | QoderCloudRequestFailure> {
  const query = new URLSearchParams({ limit: '1' })
  const result = await requestJson(config, '/agents', query)
  return result.ok ? { ok: true } : result
}
