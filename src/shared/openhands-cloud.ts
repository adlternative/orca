import type { CloudAgentProviderDescriptor } from './cloud-agent-provider'

export const OPENHANDS_CLOUD_PROVIDER_ID = 'openhands-cloud' as const

/**
 * OpenHands Cloud: an open-source agent whose API is REST + WebSocket (app.all-hands.dev).
 *
 * Capabilities are deliberately narrower than Qoder's, and that is the point: this provider is the
 * proof that the UI renders what a vendor declares instead of assuming every panel applies.
 */
export const OPENHANDS_CLOUD_PROVIDER: CloudAgentProviderDescriptor = {
  id: OPENHANDS_CLOUD_PROVIDER_ID,
  label: 'OpenHands Cloud',
  shortLabel: 'OpenHands',
  consoleUrl: 'https://app.all-hands.dev/conversations',
  launchRequirements: { template: false, environment: false, repositoryToken: false },
  capabilities: {
    readTranscript: true,
    // The event stream is a websocket on the conversation's sandbox; polling the REST event search
    // is the supported fallback, so the drawer refreshes on open rather than streaming.
    liveTail: false,
    createSession: true,
    sendMessage: true,
    // Confirmations live on the sandbox agent-server, not on the Cloud V1 API.
    approveToolCall: false,
    cancelTurn: false,
    archiveSession: false,
    modelSelection: false,
    sessionResources: ['git-repository'],
    outcomes: false,
    schedules: false
  }
}

export const OPENHANDS_CLOUD_DEFAULT_API_BASE_URL = 'https://app.all-hands.dev'
