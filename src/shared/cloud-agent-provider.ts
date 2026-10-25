import type { NativeChatMessage } from './native-chat-types'
import type { CloudAgentEventPage } from './cloud-agent-events'
import type { CloudAgentLaunchRequirements } from './cloud-agent-create'

/**
 * Provider-neutral contract for agents that run in a vendor's cloud and are reached
 * over an API rather than a process on an execution host. Design:
 * docs/reference/cloud-agent-sessions.md. Qoder Cloud Agents is the first adapter.
 */

export type CloudAgentProviderId = 'qoder-cloud' | (string & {})

/** Fixed vocabulary; `blocked` is the state that asks the human for something. */
export type CloudAgentSessionState = 'working' | 'blocked' | 'idle' | 'ended' | 'unverifiable'

export type CloudSessionResourceKind = 'git-repository' | 'file' | 'memory-store' | 'secret-vault'

/**
 * What a provider can do. The UI renders only declared capabilities, so a vendor that
 * cannot approve tool calls never shows an Approve button it cannot honor.
 */
export type CloudAgentProviderCapabilities = {
  readTranscript: boolean
  liveTail: boolean
  createSession: boolean
  sendMessage: boolean
  approveToolCall: boolean
  cancelTurn: boolean
  /** Retire a session so it stops accepting work. */
  archiveSession: boolean
  /** Switch the model mid-session; not every vendor allows it after the turn starts. */
  modelSelection: boolean
  sessionResources: readonly CloudSessionResourceKind[]
  outcomes: boolean
  schedules: boolean
}

export type CloudAgentProviderDescriptor = {
  id: CloudAgentProviderId
  label: string
  /** Short form for dense tables where the full label truncates. */
  shortLabel: string
  /** Vendor console a human can open when Orca has no control to offer. */
  consoleUrl: string
  capabilities: CloudAgentProviderCapabilities
  /** Omitted flags retain the original template/environment/token launch contract. */
  launchRequirements?: CloudAgentLaunchRequirements
}

export type CloudAgentSessionRow = {
  provider: CloudAgentProviderId
  id: string
  title: string | null
  state: CloudAgentSessionState
  /** Vendor's own status word, for tooltips and debugging; never branched on by the UI. */
  vendorStatus: string
  archived: boolean
  agentId: string | null
  agentVersion: number | null
  /** Model the vendor reports on the session's embedded agent, e.g. `ultimate`. */
  model: string | null
  environmentId: string | null
  createdAt: string | null
  updatedAt: string | null
  /** Console URL a human can open. */
  url: string
  totalCredits: number | null
  /** Set when `state` came from evidence beyond the vendor status field. */
  blockedReason?: string
  /** Latest acceptance-criteria verdict the vendor reports on the session object, if any. */
  outcome?: CloudAgentOutcomeSummary
}

/** Vendor-neutral summary of graded acceptance criteria (Qoder: `outcome_evaluations[]`). */
export type CloudAgentOutcomeSummary = {
  id: string
  description: string
  result: string
  iteration: number
  explanation: string | null
  completedAt: string | null
}

export type CloudAgentSessionPage = {
  sessions: CloudAgentSessionRow[]
  nextPage: string | null
}

/** IPC result envelopes; a neutral adapter answers with these, not with a vendor's own type. */
export type CloudAgentListSessionsResult =
  | { ok: true; page: CloudAgentSessionPage }
  | CloudAgentRequestFailure
export type CloudAgentListEventsResult =
  | { ok: true; page: CloudAgentEventPage }
  | CloudAgentRequestFailure
export type CloudAgentGetSessionResult =
  | { ok: true; session: CloudAgentSessionRow }
  | CloudAgentRequestFailure

/**
 * `rejected` is the credential's fault; `unreachable` is the network's or the server's;
 * `unsupported` means the host this client is paired with has no such IPC handler — a
 * mixed-version pairing, which is normal and must read as a capability gap, never as an error.
 */
export type CloudAgentRequestFailure = {
  ok: false
  reason: 'rejected' | 'unreachable' | 'not-found' | 'not-configured' | 'malformed' | 'unsupported'
  message: string
}

/** A decoded transcript slice plus what the newest event says the session is doing. */
export type CloudAgentTranscriptPage = {
  messages: NativeChatMessage[]
  nextPage: string | null
  /** Opaque newest event id, for live-tail resumption. */
  newestEventId: string | null
}

export type CloudAgentStreamState = {
  provider: CloudAgentProviderId
  sessionId: string
  state: 'connecting' | 'open' | 'reconnecting' | 'closed'
  detail?: string
}

/** A vendor-hosted file the agent produced, reachable by a short-lived URL. */
export type CloudAgentFileLink = {
  fileId: string
  url: string
  /** Epoch ms after which `url` stops working; callers re-resolve before then. */
  expiresAt: number
  filename: string | null
  mimeType: string | null
  sizeBytes: number | null
}

export type CloudAgentFileLinkResult =
  | { ok: true; link: CloudAgentFileLink }
  | CloudAgentRequestFailure

/** A vendor-owned schedule that spawns sessions (Qoder: Deployment). Read-only in Orca. */
export type CloudAgentSchedule = {
  provider: CloudAgentProviderId
  id: string
  name: string
  description: string | null
  status: 'active' | 'paused' | 'archived' | 'unknown'
  pausedReason: string | null
  cronExpression: string | null
  timezone: string | null
  lastRunAt: string | null
  upcomingRunsAt: string[]
  agentId: string | null
  agentVersion: number | null
  environmentId: string | null
  /** Resolved for the list: the vendor returns an id, the column shows a name. */
  environmentName: string | null
  /** The first prompt the run starts with, for the row preview. */
  promptPreview: string | null
  /** The same prompt in full, for the expanded detail. */
  prompt: string | null
  url: string
}

export type CloudAgentScheduleRun = {
  id: string
  scheduleId: string
  sessionId: string | null
  scheduledAt: string | null
  createdAt: string | null
  error: string | null
}

export type CloudAgentSchedulePage = {
  schedules: CloudAgentSchedule[]
  nextPage: string | null
}
export type CloudAgentScheduleRunPage = {
  runs: CloudAgentScheduleRun[]
  nextPage: string | null
}
export type CloudAgentListSchedulesResult =
  | { ok: true; page: CloudAgentSchedulePage }
  | CloudAgentRequestFailure
export type CloudAgentListScheduleRunsResult =
  | { ok: true; page: CloudAgentScheduleRunPage }
  | CloudAgentRequestFailure

/** A write Orca can perform on a running session. Each is gated by a capability. */
export type CloudAgentSessionAction =
  | { kind: 'send-message'; text: string }
  | { kind: 'confirm-tool'; toolUseId: string; decision: 'allow' | 'deny' }
  | { kind: 'cancel-turn' }
  | { kind: 'archive' }

/**
 * Both refusals arrive as HTTP 409 on Qoder, so they are told apart by what the vendor says,
 * not the status: `busy` = a turn is active (retry later), `closed` = the session can never
 * accept this again (archived/terminated). Neither is a broken credential.
 */
export type CloudAgentActionFailure = {
  ok: false
  reason:
    | 'rejected'
    | 'unreachable'
    | 'not-found'
    | 'not-configured'
    | 'malformed'
    | 'busy'
    | 'closed'
    | 'unsupported'
  message: string
}

export type CloudAgentActionResult = { ok: true } | CloudAgentActionFailure

/** Where the credential came from, so settings can explain why it cannot be edited here. */
export type CloudAgentCredentialSource =
  | 'environment'
  | 'stored'
  /** Reused from the vendor's own CLI login (`ant auth login`) instead of a pasted key. */
  | 'ant-cli'
  | 'none'

export type CloudAgentConnectionStatus = {
  configured: boolean
  source: CloudAgentCredentialSource
  baseUrl: string | null
  credentialError: string | null
}

/** Query for a provider's session list; every adapter maps the fields it supports. */
export type CloudAgentListSessionsArgs = {
  limit?: number
  page?: string | null
  statuses?: string[]
}

/** Query for a transcript slice. `page` is the vendor's own cursor. */
export type CloudAgentListEventsArgs = {
  sessionId: string
  page?: string | null
  since?: string | null
}
