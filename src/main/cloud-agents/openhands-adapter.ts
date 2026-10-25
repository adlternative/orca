import { OPENHANDS_CLOUD_PROVIDER_ID } from '../../shared/openhands-cloud'
import type {
  CloudAgentActionResult,
  CloudAgentListEventsArgs,
  CloudAgentListEventsResult,
  CloudAgentListSessionsArgs,
  CloudAgentListSessionsResult,
  CloudAgentProviderId,
  CloudAgentRequestFailure,
  CloudAgentSessionRow
} from '../../shared/cloud-agent-provider'
import { createOpenHandsSession } from './openhands-launch'
import type { CloudAgentAdapter } from './adapter'
import {
  clearStoredCloudAgentCredential,
  getEnvCloudAgentAuthConfig,
  resolveCloudAgentAuthConfig,
  getStoredCloudAgentCredentialError,
  getStoredCloudAgentMetadata,
  saveCloudAgentCredential
} from './credentials'
import { eventOf, isRecord, itemsOf, openhandsBaseUrl, rowOf } from './openhands-mapping'

const PROVIDER: CloudAgentProviderId = OPENHANDS_CLOUD_PROVIDER_ID
const REQUEST_TIMEOUT_MS = 20_000

/** Env wins, then the credential saved in settings — same precedence as Qoder. */
function auth(): { accessToken: string; baseUrl: string } | null {
  return resolveCloudAgentAuthConfig(PROVIDER)
}

/** The base URL a request goes to: saved in settings, else the env/default the card shows. */
function effectiveBaseUrl(): string {
  return auth()?.baseUrl ?? openhandsBaseUrl()
}

function failure(
  reason: CloudAgentRequestFailure['reason'],
  message: string
): CloudAgentRequestFailure {
  return { ok: false, reason, message }
}

export async function request(
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<{ ok: true; body: unknown } | CloudAgentRequestFailure> {
  const credentials = auth()
  if (!credentials) {
    return failure('not-configured', 'Add an OpenHands Cloud API key to read its sessions.')
  }
  try {
    const response = await fetch(`${credentials.baseUrl}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json'
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
    const body: unknown = await response.json().catch(() => null)
    if (!response.ok) {
      const reason =
        response.status === 401 || response.status === 403
          ? 'rejected'
          : response.status === 404
            ? 'not-found'
            : 'unreachable'
      const detail = isRecord(body) && typeof body.detail === 'string' ? body.detail : ''
      return failure(reason, detail || `OpenHands Cloud answered ${response.status}.`)
    }
    return { ok: true, body }
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError'
    return failure(
      'unreachable',
      timedOut
        ? `OpenHands Cloud did not answer within ${REQUEST_TIMEOUT_MS / 1000}s.`
        : 'OpenHands Cloud is unreachable.'
    )
  }
}

async function sendMessage(sessionId: string, text: string): Promise<CloudAgentActionResult> {
  const reply = await request(
    `/api/v1/app-conversations/${encodeURIComponent(sessionId)}/send-message`,
    { method: 'POST', body: { message: text } }
  )
  return reply.ok ? { ok: true } : reply
}

const unsupported = (what: string): CloudAgentRequestFailure =>
  failure('unsupported', `OpenHands Cloud does not expose ${what}.`)

export const openhandsCloudAdapter: CloudAgentAdapter = {
  provider: PROVIDER,

  status: async () => {
    const fromEnv = getEnvCloudAgentAuthConfig(PROVIDER) !== null
    const stored = getStoredCloudAgentMetadata(PROVIDER) !== null
    return {
      configured: fromEnv || stored,
      source: fromEnv ? ('environment' as const) : stored ? ('stored' as const) : ('none' as const),
      baseUrl: effectiveBaseUrl(),
      credentialError: getStoredCloudAgentCredentialError(PROVIDER)
    }
  },

  // Why a probe request: saving a key is not proof — the vendor is the only one who can say so.
  connect: async (input) => {
    const record = isRecord(input) ? input : {}
    const token = typeof record.accessToken === 'string' ? record.accessToken.trim() : ''
    if (!token) {
      return { ok: false, error: 'An OpenHands Cloud API key is required.' }
    }
    saveCloudAgentCredential(PROVIDER, {
      accessToken: token,
      baseUrl:
        isRecord(input) && typeof input.baseUrl === 'string' && input.baseUrl.trim()
          ? input.baseUrl.trim().replace(/\/+$/, '')
          : openhandsBaseUrl()
    })
    const probe = await request('/api/v1/app-conversations/search?limit=1')
    if (!probe.ok) {
      clearStoredCloudAgentCredential(PROVIDER)
      return { ok: false, error: probe.message }
    }
    return { ok: true }
  },

  disconnect: async () => {
    clearStoredCloudAgentCredential(PROVIDER)
  },

  catalog: async () => ({
    ok: true,
    catalog: { provider: PROVIDER, templates: [], environments: [], memoryStores: [], vaults: [] }
  }),

  listSessions: async (input): Promise<CloudAgentListSessionsResult> => {
    const args = (isRecord(input) ? input : {}) as CloudAgentListSessionsArgs
    const limit = typeof args.limit === 'number' ? args.limit : 30
    const reply = await request(`/api/v1/app-conversations/search?limit=${limit}`)
    if (!reply.ok) {
      return reply
    }
    const sessions = itemsOf(reply.body)
      .map(rowOf)
      .filter((row): row is CloudAgentSessionRow => row !== null)
    return { ok: true, page: { sessions, nextPage: null } }
  },

  getSession: async (sessionId) => {
    if (typeof sessionId !== 'string' || sessionId.length === 0) {
      return failure('malformed', 'A session id is required.')
    }
    const reply = await request(`/api/v1/app-conversations?ids=${encodeURIComponent(sessionId)}`)
    if (!reply.ok) {
      return reply
    }
    const row =
      itemsOf(reply.body)
        .map(rowOf)
        .find((entry) => entry !== null) ?? null
    return row ? { ok: true, session: row } : failure('not-found', 'That conversation is gone.')
  },

  listEvents: async (input): Promise<CloudAgentListEventsResult> => {
    const args = (isRecord(input) ? input : {}) as CloudAgentListEventsArgs
    if (typeof args.sessionId !== 'string' || args.sessionId.length === 0) {
      return failure('malformed', 'A session id is required.')
    }
    const page = args.page ? `?page_id=${encodeURIComponent(args.page)}` : ''
    const reply = await request(
      `/api/v1/conversation/${encodeURIComponent(args.sessionId)}/events/search${page}`
    )
    if (!reply.ok) {
      return reply
    }
    const nextPage =
      isRecord(reply.body) && typeof reply.body.next_page_id === 'string'
        ? reply.body.next_page_id
        : null
    return { ok: true, page: { events: itemsOf(reply.body).map(eventOf), nextPage } }
  },

  listModels: async () => unsupported('a model list'),
  setSessionModel: async () => unsupported('switching the model mid-conversation'),

  createSession: (input) => createOpenHandsSession(request, input),

  sessionAction: async (input): Promise<CloudAgentActionResult> => {
    const args = isRecord(input) ? input : {}
    const sessionId = typeof args.sessionId === 'string' ? args.sessionId : ''
    const action = isRecord(args.action) ? args.action : {}
    if (!sessionId) {
      return { ok: false, reason: 'malformed', message: 'A session id is required.' }
    }
    if (action.kind === 'send-message' && typeof action.text === 'string') {
      return sendMessage(sessionId, action.text)
    }
    return {
      ok: false,
      reason: 'unsupported',
      message: `OpenHands Cloud does not expose ${String(action.kind ?? 'that action')}.`
    }
  },

  listSchedules: async () => unsupported('scheduled conversations'),
  listScheduleRuns: async () => unsupported('scheduled conversations'),
  fileLink: async () => unsupported('file downloads'),

  // Why no-ops: without a live tail the drawer polls `listEvents`, so there is nothing to keep open.
  streamSubscribe: async () => undefined,
  streamUnsubscribe: async () => undefined
}
