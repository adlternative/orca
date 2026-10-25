import { CLAUDE_MANAGED_BETA_HEADER, CLAUDE_MANAGED_PROVIDER_ID } from '../../shared/claude-managed'
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
import type { CloudAgentAdapter } from './adapter'
import { loadClaudeLaunchCatalog, createClaudeSession } from './claude-managed-launch'
import {
  clearStoredCloudAgentCredential,
  getEnvCloudAgentAuthConfig,
  getStoredCloudAgentCredentialError,
  getStoredCloudAgentMetadata,
  getVendorCliAuthConfig,
  resolveCloudAgentAuthConfig,
  saveCloudAgentCredential
} from './credentials'
import {
  claudeBaseUrl,
  eventOf,
  isRecord,
  itemsOf,
  nextPageOf,
  rowOf
} from './claude-managed-mapping'

const PROVIDER: CloudAgentProviderId = CLAUDE_MANAGED_PROVIDER_ID
const REQUEST_TIMEOUT_MS = 20_000
/** The API rejects a page larger than this. */
const MAX_EVENTS_PER_PAGE = 100

function auth(): { accessToken: string; baseUrl: string } | null {
  return resolveCloudAgentAuthConfig(PROVIDER)
}

function effectiveBaseUrl(): string {
  return auth()?.baseUrl ?? claudeBaseUrl()
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
    return failure(
      'not-configured',
      'Add a Claude API key or OAuth token to read its managed agent sessions.'
    )
  }
  try {
    const response = await fetch(`${credentials.baseUrl}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        ...authHeaders(credentials.accessToken),
        'anthropic-version': '2023-06-01',
        'anthropic-beta': CLAUDE_MANAGED_BETA_HEADER,
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
      const detail =
        isRecord(body) && isRecord(body.error) && typeof body.error.message === 'string'
          ? body.error.message
          : ''
      return failure(reason, detail || `Claude answered ${response.status}.`)
    }
    return { ok: true, body }
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError'
    return failure(
      'unreachable',
      timedOut
        ? `Claude did not answer within ${REQUEST_TIMEOUT_MS / 1000}s.`
        : 'Claude is unreachable.'
    )
  }
}

/**
 * Why one header only: sending both is rejected. `ant auth` issues an OAuth token
 * (`sk-ant-oat…`) that only authenticates as a bearer credential, and an API key sent as a bearer
 * credential is refused, so the prefix decides — not a user-facing setting nobody understands.
 */
function authHeaders(token: string): Record<string, string> {
  return token.startsWith('sk-ant-oat')
    ? { Authorization: `Bearer ${token}` }
    : { 'x-api-key': token }
}

const unsupported = (what: string): CloudAgentRequestFailure =>
  failure('unsupported', `Claude Managed Agents does not expose ${what} here.`)

/** Every action on this platform is an event on the session's event log. */
async function sendEvent(
  sessionId: string,
  event: Record<string, unknown>
): Promise<CloudAgentActionResult> {
  const reply = await request(`/v1/sessions/${encodeURIComponent(sessionId)}/events`, {
    method: 'POST',
    body: { events: [event] }
  })
  return reply.ok ? { ok: true } : reply
}

export const claudeManagedAdapter: CloudAgentAdapter = {
  provider: PROVIDER,

  status: async () => {
    const fromEnv = getEnvCloudAgentAuthConfig(PROVIDER) !== null
    const stored = getStoredCloudAgentMetadata(PROVIDER) !== null
    const fromCli = !fromEnv && !stored && getVendorCliAuthConfig(PROVIDER) !== null
    return {
      configured: fromEnv || stored || fromCli,
      source: fromEnv
        ? ('environment' as const)
        : stored
          ? ('stored' as const)
          : fromCli
            ? ('ant-cli' as const)
            : ('none' as const),
      baseUrl: effectiveBaseUrl(),
      credentialError: getStoredCloudAgentCredentialError(PROVIDER)
    }
  },

  connect: async (input) => {
    const record = isRecord(input) ? input : {}
    const token = typeof record.accessToken === 'string' ? record.accessToken.trim() : ''
    if (!token) {
      return { ok: false, error: 'A Claude API key or OAuth token is required.' }
    }
    saveCloudAgentCredential(PROVIDER, {
      accessToken: token,
      baseUrl:
        typeof record.baseUrl === 'string' && record.baseUrl.trim().length > 0
          ? record.baseUrl.trim().replace(/\/+$/, '')
          : claudeBaseUrl()
    })
    // Why a probe: saving a token proves nothing — only the vendor can say it is valid.
    const probe = await request('/v1/sessions?limit=1')
    if (!probe.ok) {
      clearStoredCloudAgentCredential(PROVIDER)
      return { ok: false, error: probe.message }
    }
    return { ok: true }
  },

  disconnect: async () => {
    clearStoredCloudAgentCredential(PROVIDER)
  },

  catalog: () => loadClaudeLaunchCatalog(request),

  listSessions: async (input): Promise<CloudAgentListSessionsResult> => {
    const args = (isRecord(input) ? input : {}) as CloudAgentListSessionsArgs
    const limit = typeof args.limit === 'number' ? Math.min(args.limit, 100) : 30
    const page =
      typeof args.page === 'string' && args.page.length > 0
        ? `&page=${encodeURIComponent(args.page)}`
        : ''
    const reply = await request(`/v1/sessions?limit=${limit}&order=desc${page}`)
    if (!reply.ok) {
      return reply
    }
    const sessions = itemsOf(reply.body)
      .map(rowOf)
      .filter((row): row is CloudAgentSessionRow => row !== null)
    return { ok: true, page: { sessions, nextPage: nextPageOf(reply.body) } }
  },

  getSession: async (sessionId) => {
    if (typeof sessionId !== 'string' || sessionId.length === 0) {
      return failure('malformed', 'A session id is required.')
    }
    const reply = await request(`/v1/sessions/${encodeURIComponent(sessionId)}`)
    if (!reply.ok) {
      return reply
    }
    const row = isRecord(reply.body) ? rowOf(reply.body) : null
    return row ? { ok: true, session: row } : failure('not-found', 'That session is gone.')
  },

  listEvents: async (input): Promise<CloudAgentListEventsResult> => {
    const args = (isRecord(input) ? input : {}) as CloudAgentListEventsArgs
    if (typeof args.sessionId !== 'string' || args.sessionId.length === 0) {
      return failure('malformed', 'A session id is required.')
    }
    const limit = MAX_EVENTS_PER_PAGE
    const page =
      typeof args.page === 'string' && args.page.length > 0
        ? `&page=${encodeURIComponent(args.page)}`
        : ''
    // Why desc: the transcript prepends each page, and the first page is the recent tail.
    const reply = await request(
      `/v1/sessions/${encodeURIComponent(args.sessionId)}/events?limit=${limit}&order=desc${page}`
    )
    if (!reply.ok) {
      return reply
    }
    return {
      ok: true,
      page: { events: itemsOf(reply.body).map(eventOf), nextPage: nextPageOf(reply.body) }
    }
  },

  listModels: async () => unsupported('a model list — the model belongs to the agent'),
  setSessionModel: async () => unsupported('switching the model mid-session'),

  createSession: (input) => createClaudeSession(request, input),

  sessionAction: async (input): Promise<CloudAgentActionResult> => {
    const args = isRecord(input) ? input : {}
    const sessionId = typeof args.sessionId === 'string' ? args.sessionId : ''
    const action = isRecord(args.action) ? args.action : {}
    if (!sessionId) {
      return { ok: false, reason: 'malformed', message: 'A session id is required.' }
    }
    if (action.kind === 'send-message' && typeof action.text === 'string') {
      return sendEvent(sessionId, {
        type: 'user.message',
        content: [{ type: 'text', text: action.text }]
      })
    }
    if (action.kind === 'confirm-tool') {
      const toolUseId = typeof action.toolUseId === 'string' ? action.toolUseId : ''
      const result = action.decision === 'deny' ? 'deny' : 'allow'
      return sendEvent(sessionId, {
        type: 'user.tool_confirmation',
        tool_use_id: toolUseId,
        result
      })
    }
    if (action.kind === 'cancel-turn') {
      return sendEvent(sessionId, { type: 'user.interrupt' })
    }
    return {
      ok: false,
      reason: 'unsupported',
      message: `Claude Managed Agents does not expose ${String(action.kind ?? 'that action')}.`
    }
  },

  listSchedules: async () => unsupported('schedules'),
  listScheduleRuns: async () => unsupported('schedules'),
  fileLink: async () => unsupported('file downloads'),

  // Why no-ops: the drawer polls `listEvents`; SSE (`/events/stream`) is the next slice.
  streamSubscribe: async () => undefined,
  streamUnsubscribe: async () => undefined
}
