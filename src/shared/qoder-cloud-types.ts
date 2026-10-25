import type { QoderCloudEvent, QoderCloudEventPage } from './qoder-cloud-events'
import type { CloudAgentStreamPush, CloudAgentStreamState } from './cloud-agent-stream'
import type {
  CloudAgentProviderDescriptor,
  CloudAgentRequestFailure,
  CloudAgentSessionPage,
  CloudAgentSessionRow,
  CloudAgentSessionState
} from './cloud-agent-provider'
import type { CloudAgentConnectionStatus, CloudAgentCredentialSource } from './cloud-agent-provider'

// Qoder Cloud Agents adapter contract. Vendor-shaped only at the HTTP edge
// (`src/main/qoder-cloud/`); everything the renderer sees is the provider-neutral
// shape from `cloud-agent-provider.ts`. Design: docs/reference/cloud-agent-sessions.md.

export const QODER_CLOUD_PROVIDER_ID = 'qoder-cloud' as const

/** Observe is shipped; the rest is declared false until each lands behind a live test. */
export const QODER_CLOUD_PROVIDER: CloudAgentProviderDescriptor = {
  id: QODER_CLOUD_PROVIDER_ID,
  label: 'Qoder Cloud Agents',
  shortLabel: 'Qoder',
  consoleUrl: 'https://qoder.com/cloud/sessions',
  capabilities: {
    readTranscript: true,
    liveTail: true,
    createSession: true,
    sendMessage: true,
    approveToolCall: true,
    cancelTurn: true,
    archiveSession: true,
    modelSelection: true,
    sessionResources: ['git-repository', 'file', 'memory-store', 'secret-vault'],
    outcomes: true,
    schedules: true
  }
}

export const QODER_CLOUD_DEFAULT_API_BASE_URL = 'https://api.qoder.com/api/v1/cloud'
/** Qoder CN is a separate product with separate tokens; verified host, not `api.qoder.cn`. */
export const QODER_CLOUD_CN_API_BASE_URL = 'https://api.qoder.com.cn/api/v1/cloud'
export const QODER_CLOUD_CONSOLE_URL = 'https://qoder.com/cloud/sessions'
export const QODER_CLOUD_CN_CONSOLE_URL = 'https://qoder.com.cn/cloud/sessions'

/** Vendor status machine, verbatim from the Sessions docs. */
export const QODER_CLOUD_SESSION_STATUSES = [
  'idle',
  'running',
  'rescheduling',
  'terminated'
] as const
export type QoderCloudSessionStatus = (typeof QODER_CLOUD_SESSION_STATUSES)[number]

const QODER_CLOUD_SESSION_STATUS_SET: ReadonlySet<string> = new Set(QODER_CLOUD_SESSION_STATUSES)

export function isQoderCloudSessionStatus(value: unknown): value is QoderCloudSessionStatus {
  return typeof value === 'string' && QODER_CLOUD_SESSION_STATUS_SET.has(value)
}

export type { CloudAgentSessionPage, CloudAgentSessionRow, CloudAgentSessionState }

export type QoderCloudCredentialSource = CloudAgentCredentialSource

/** Never carries the token: it does not cross IPC back to the renderer. */
export type QoderCloudConnectionStatus = CloudAgentConnectionStatus

export type QoderCloudConnectArgs = {
  accessToken?: string | null
  baseUrl?: string | null
}

export type QoderCloudConnectResult = { ok: true } | { ok: false; error: string }

export type QoderCloudListSessionsArgs = {
  page?: string | null
  limit?: number | null
  statuses?: QoderCloudSessionStatus[] | null
}

export type QoderCloudRequestFailure = CloudAgentRequestFailure

export type QoderCloudListSessionsResult =
  | { ok: true; page: CloudAgentSessionPage }
  | QoderCloudRequestFailure

export type QoderCloudGetSessionResult =
  | { ok: true; session: CloudAgentSessionRow }
  | QoderCloudRequestFailure

export type QoderCloudListEventsArgs = {
  sessionId: string
  page?: string | null
  limit?: number | null
  order?: 'asc' | 'desc' | null
}

export type QoderCloudListEventsResult =
  | { ok: true; page: QoderCloudEventPage }
  | QoderCloudRequestFailure

export function cloudAgentSessionStateFromVendor(
  status: QoderCloudSessionStatus,
  archived: boolean
): CloudAgentSessionState {
  if (archived || status === 'terminated') {
    return 'ended'
  }
  // `rescheduling` is still the active turn (vendor retries a model request).
  return status === 'idle' ? 'idle' : 'working'
}

/** Console URL for a session; CN tokens live in the CN console, matched by the API host. */
export function qoderCloudSessionUrl(sessionId: string, apiBaseUrl?: string): string {
  const console = apiBaseUrl?.includes('qoder.com.cn')
    ? QODER_CLOUD_CN_CONSOLE_URL
    : QODER_CLOUD_CONSOLE_URL
  return `${console}/${encodeURIComponent(sessionId)}`
}

/** Main → renderer: live SSE tail state for one session. */
export type QoderCloudStreamState = CloudAgentStreamState

/** Main → renderer: decoded events from the live tail. */
/** Qoder's event payload on the shared stream channels. */
export type QoderCloudStreamPush = CloudAgentStreamPush<QoderCloudEvent>
