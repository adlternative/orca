import type { CloudAgentProviderId } from './cloud-agent-provider'

/**
 * One channel pair for every vendor's live tail.
 *
 * Why not one channel per vendor: the renderer would have to know which vendors exist to listen
 * for them. Payloads carry `provider`, so a single listener can route pushes to the right session.
 */
export const CLOUD_AGENT_STREAM_EVENT_CHANNEL = 'cloudAgent:streamEvent'
export const CLOUD_AGENT_STREAM_STATE_CHANNEL = 'cloudAgent:streamState'

export type CloudAgentStreamPush<Pushed = unknown> = {
  provider: CloudAgentProviderId
  sessionId: string
  events: Pushed[]
}

export type CloudAgentStreamState = {
  provider: CloudAgentProviderId
  sessionId: string
  state: 'connecting' | 'open' | 'reconnecting' | 'closed'
  /** Reason for the last drop, kept short for the UI. */
  detail?: string
}
