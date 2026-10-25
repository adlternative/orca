import type { CloudAgentProviderDescriptor } from './cloud-agent-provider'

export const CLAUDE_MANAGED_PROVIDER_ID = 'claude-managed' as const

/** The beta flag every Managed Agents request must carry. */
export const CLAUDE_MANAGED_BETA_HEADER = 'managed-agents-2026-04-01'

export const CLAUDE_MANAGED_DEFAULT_API_BASE_URL = 'https://api.anthropic.com'

/**
 * Claude Managed Agents (Anthropic beta `managed-agents-2026-04-01`).
 *
 * Why this provider matters for the seam: unlike OpenHands, the vendor's event vocabulary is almost
 * a superset of the canonical one (`user.message`, `agent.tool_use`, `agent.tool_result`,
 * `session.status_running/idle` with `stop_reason`), so approvals and interrupts come for free —
 * they are just more events on the same channel.
 *
 * `isConfigured` reads credentials; the model belongs to the *agent*, not the session, so there is
 * nothing to switch mid-conversation and the picker stays hidden.
 */
export const CLAUDE_MANAGED_PROVIDER: CloudAgentProviderDescriptor = {
  id: CLAUDE_MANAGED_PROVIDER_ID,
  label: 'Claude Managed Agents',
  shortLabel: 'Claude',
  consoleUrl: 'https://platform.claude.com',
  launchRequirements: { template: true, environment: true, repositoryToken: true },
  capabilities: {
    readTranscript: true,
    // SSE on `/v1/sessions/{id}/events/stream`; the drawer polls until that is wired.
    liveTail: false,
    createSession: true,
    sendMessage: true,
    // `user.tool_confirmation` with result allow/deny.
    approveToolCall: true,
    // `user.interrupt`.
    cancelTurn: true,
    archiveSession: false,
    modelSelection: false,
    sessionResources: ['git-repository'],
    // The API has `outcome_evaluations`; projecting them is a separate slice.
    outcomes: false,
    schedules: false
  }
}
