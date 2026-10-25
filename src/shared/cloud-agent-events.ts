/**
 * The event vocabulary every cloud agent provider translates into.
 *
 * Why canonical and not per-vendor: the transcript, artifacts, outcomes and state pill are rendered
 * once from these events, so a vendor's job is to translate its wire format into this schema
 * (`src/main/qoder-cloud/` does it for Qoder). A second provider then never reaches the renderer's
 * decode path with shapes it does not know.
 */
import type { CloudAgentOutcomeResult, CloudAgentRubric } from './cloud-agent-outcome-vocabulary'
import { CLOUD_AGENT_OUTCOME_RESULTS } from './cloud-agent-outcome-vocabulary'

export type { CloudAgentOutcomeResult, CloudAgentRubric } from './cloud-agent-outcome-vocabulary'
export { CLOUD_AGENT_OUTCOME_RESULTS } from './cloud-agent-outcome-vocabulary'

export type CloudAgentContentBlock = { type: 'text'; text: string } | { type: string }

export type CloudAgentStopReason = {
  type: string
  event_ids?: string[]
}

type Base = { id: string; processed_at: string }

const OUTCOME_RESULT_SET: ReadonlySet<string> = new Set(CLOUD_AGENT_OUTCOME_RESULTS)

export function isCloudAgentOutcomeResult(value: unknown): value is CloudAgentOutcomeResult {
  return typeof value === 'string' && OUTCOME_RESULT_SET.has(value)
}

/** Terminal verdicts: the evaluation thread will not grade again. */
export function isTerminalOutcomeResult(result: CloudAgentOutcomeResult): boolean {
  return (
    result === 'satisfied' ||
    result === 'max_iterations_reached' ||
    result === 'failed' ||
    result === 'interrupted'
  )
}

export type CloudAgentEvent =
  | (Base & { type: 'user.message'; content: CloudAgentContentBlock[] })
  | (Base & { type: 'agent.message'; content: CloudAgentContentBlock[] })
  | (Base & { type: 'agent.thinking' })
  | (Base & {
      type: 'agent.tool_use'
      name: string
      input: unknown
      evaluated_permission: string | null
    })
  | (Base & {
      type: 'agent.tool_result'
      tool_use_id: string
      content: CloudAgentContentBlock[]
      is_error: boolean
    })
  | (Base & { type: 'session.status_running' })
  | (Base & {
      type: 'session.status_idle'
      stop_reason: CloudAgentStopReason | null
    })
  | (Base & {
      type: 'session.thread_status_running'
      agent_name: string | null
    })
  | (Base & {
      type: 'session.thread_status_idle'
      agent_name: string | null
      stop_reason: CloudAgentStopReason | null
    })
  | (Base & { type: 'span.model_request_start' })
  | (Base & {
      type: 'span.model_request_end'
      is_error: boolean
      credits: number | null
    })
  | (Base & {
      type: 'user.define_outcome'
      outcome_id: string
      description: string
      rubric: CloudAgentRubric | null
      max_iterations: number | null
    })
  | (Base & {
      type: 'span.outcome_evaluation_start'
      outcome_id: string
      iteration: number
    })
  | (Base & {
      type: 'span.outcome_evaluation_ongoing'
      outcome_id: string
      iteration: number
    })
  | (Base & {
      type: 'span.outcome_evaluation_end'
      outcome_id: string
      iteration: number
      result: CloudAgentOutcomeResult
      explanation: string | null
      credits: number | null
    })
  | (Base & {
      type: 'agent.artifact_delivered'
      file_id: string
      original_filename: string | null
      content_type: string | null
      size: number | null
    })
  | (Base & { type: 'session.usage'; total_credits: number | null })
  | (Base & {
      type: 'session.error'
      error_type: string
      message: string
      /** MCP server name when the failure came from one. */
      server: string | null
      /** `exhausted` means the vendor will not retry on its own. */
      retry: string | null
    })
  | (Base & { type: 'agent.thread_context_compacted'; credits: number | null })
  | (Base & {
      type: 'session.updated'
      agent_name: string | null
      model: string | null
      tool_count: number | null
    })
  /** The agent asked the *client* to run a tool it registered (not the sandbox). */
  | (Base & {
      type: 'agent.custom_tool_use'
      name: string
      input: unknown
      title: string | null
    })
  | (Base & {
      type: 'user.custom_tool_result'
      tool_use_id: string
      content: CloudAgentContentBlock[]
    })
  | (Base & { type: 'session.status_rescheduled' })
  | (Base & { type: 'session.thread_status_rescheduled' })
  | (Base & { type: 'other'; rawType: string })

export type CloudAgentEventPage = {
  events: CloudAgentEvent[]
  nextPage: string | null
}

/** What the newest event says the session is doing; `null` when the tail is uninformative. */
export type CloudAgentTailVerdict =
  | { state: 'blocked'; stopReasonType: string; eventIds: string[] }
  | { state: 'idle'; stopReasonType: string | null }
  | { state: 'working' }

/**
 * Why: the vendor's `status` field can stay `running` for weeks while the event log
 * ends in `session.status_idle` + `requires_action` (a tool call waiting for a human).
 * The tail, not the status, is the truth about whether a human is needed.
 */
export function verdictFromEventTail(
  newestFirst: readonly CloudAgentEvent[]
): CloudAgentTailVerdict | null {
  // Why scan instead of reading the newest event: metadata patches (`session.updated` from a
  // model or title change), usage rows and span boundaries land after the turn ends — reading
  // only index 0 reported those idle sessions as "working" and disabled the composer.
  for (const event of newestFirst) {
    if (event.type === 'session.status_idle' || event.type === 'session.thread_status_idle') {
      const reason = event.stop_reason
      if (reason?.type === 'requires_action') {
        return {
          state: 'blocked',
          stopReasonType: reason.type,
          eventIds: reason.event_ids ?? []
        }
      }
      return { state: 'idle', stopReasonType: reason?.type ?? null }
    }
    if (event.type === 'session.status_running' || event.type === 'session.thread_status_running') {
      return { state: 'working' }
    }
  }
  return null
}
