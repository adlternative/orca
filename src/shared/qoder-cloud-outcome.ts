import type { CloudOutcome } from './cloud-agent-outcome'
import { isTerminalOutcomeResult, type QoderCloudEvent } from './qoder-cloud-events'

/**
 * Qoder's event log folded into the neutral outcome view.
 *
 * Why vendor-side: this reads Qoder event types. It used to sit in `cloud-agent-outcome.ts`,
 * which made the neutral layer import a vendor schema — the arrow a second provider would trip on.
 */
function epochMs(iso: string): number | null {
  const value = Date.parse(iso)
  return Number.isFinite(value) ? value : null
}

/**
 * Fold the ascending event log into outcomes keyed by id. Why from events rather than the
 * session object's `outcome_evaluations[]`: the events carry every iteration and the open
 * evaluation span, which is what lets the drawer show "grading… iteration 2 of 3" live; the
 * session object only carries the latest summary.
 */
export function projectCloudOutcomes(eventsAscending: readonly QoderCloudEvent[]): CloudOutcome[] {
  const byId = new Map<string, CloudOutcome>()
  const openIteration = new Map<string, { iteration: number; startedAt: number | null }>()

  for (const event of eventsAscending) {
    switch (event.type) {
      case 'user.define_outcome': {
        byId.set(event.outcome_id, {
          id: event.outcome_id,
          description: event.description,
          rubric: event.rubric,
          maxIterations: event.max_iterations,
          definedAt: epochMs(event.processed_at),
          result: 'running',
          terminal: false,
          iterations: [],
          explanation: null,
          evaluating: false,
          completedAt: null
        })
        break
      }
      case 'span.outcome_evaluation_start': {
        const outcome = byId.get(event.outcome_id)
        if (!outcome) {
          break
        }
        openIteration.set(event.outcome_id, {
          iteration: event.iteration,
          startedAt: epochMs(event.processed_at)
        })
        outcome.result = 'evaluating'
        outcome.evaluating = true
        break
      }
      case 'span.outcome_evaluation_ongoing': {
        const outcome = byId.get(event.outcome_id)
        if (outcome && !outcome.terminal) {
          outcome.result = 'evaluating'
          outcome.evaluating = true
        }
        break
      }
      case 'span.outcome_evaluation_end': {
        const outcome = byId.get(event.outcome_id)
        if (!outcome) {
          break
        }
        const open = openIteration.get(event.outcome_id)
        openIteration.delete(event.outcome_id)
        const endedAt = epochMs(event.processed_at)
        outcome.iterations.push({
          iteration: event.iteration,
          result: event.result,
          explanation: event.explanation,
          credits: event.credits,
          startedAt: open?.startedAt ?? null,
          endedAt
        })
        outcome.result = event.result
        outcome.explanation = event.explanation
        outcome.evaluating = false
        if (isTerminalOutcomeResult(event.result)) {
          outcome.terminal = true
          outcome.completedAt = endedAt
        } else {
          // needs_revision: the agent gets another turn, then grading resumes.
          outcome.result = 'running'
        }
        break
      }
      case 'user.message':
      case 'agent.message':
      case 'agent.thinking':
      case 'agent.tool_use':
      case 'agent.tool_result':
      case 'agent.artifact_delivered':
      case 'session.status_running':
      case 'session.status_idle':
      case 'session.thread_status_running':
      case 'session.thread_status_idle':
      case 'session.usage':
      case 'span.model_request_start':
      case 'span.model_request_end':
      case 'session.error':
      case 'agent.thread_context_compacted':
      case 'session.updated':
      case 'agent.custom_tool_use':
      case 'user.custom_tool_result':
      case 'session.status_rescheduled':
      case 'session.thread_status_rescheduled':
      case 'other':
        break
    }
  }
  return [...byId.values()]
}

/** The outcome the session is currently working toward, if any. */
