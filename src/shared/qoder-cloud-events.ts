/**
 * Qoder's names for the canonical cloud-agent event schema.
 *
 * Why aliases: Qoder was the first provider, so its parser and its tests spell these types with a
 * vendor prefix. The schema itself lives in `cloud-agent-events.ts` and is what the renderer reads.
 */
export type {
  CloudAgentContentBlock as QoderCloudContentBlock,
  CloudAgentStopReason as QoderCloudStopReason,
  CloudAgentEvent as QoderCloudEvent,
  CloudAgentEventPage as QoderCloudEventPage,
  CloudAgentTailVerdict as QoderCloudTailVerdict,
  CloudAgentOutcomeResult as QoderCloudOutcomeResult,
  CloudAgentRubric as QoderCloudRubric
} from './cloud-agent-events'
export {
  CLOUD_AGENT_OUTCOME_RESULTS as QODER_CLOUD_OUTCOME_RESULTS,
  isCloudAgentOutcomeResult as isQoderCloudOutcomeResult,
  isTerminalOutcomeResult,
  verdictFromEventTail
} from './cloud-agent-events'
