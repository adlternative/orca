import type { CloudAgentOutcomeResult, CloudAgentRubric } from './cloud-agent-outcome-vocabulary'

// Re-exported so callers keep one import for "the neutral outcome model".
export type { CloudAgentOutcomeResult, CloudAgentRubric } from './cloud-agent-outcome-vocabulary'
export { CLOUD_AGENT_OUTCOME_RESULTS } from './cloud-agent-outcome-vocabulary'

/** One graded iteration, as the evaluation thread reported it. */
export type CloudOutcomeIteration = {
  iteration: number
  result: CloudAgentOutcomeResult
  explanation: string | null
  credits: number | null
  startedAt: number | null
  endedAt: number | null
}

/**
 * Provider-neutral view of an acceptance goal: what was asked, how it is judged, and how
 * the grading has gone so far. Qoder calls this an Outcome; the shape is kept generic so
 * a vendor with a different name for "graded acceptance criteria" fits the same UI.
 */
export type CloudOutcome = {
  id: string
  description: string
  rubric: CloudAgentRubric | null
  maxIterations: number | null
  definedAt: number | null
  /** Latest known result; `pending` until the agent starts, `evaluating` while graded. */
  result: CloudAgentOutcomeResult
  /** Terminal verdicts never change; the drawer can stop treating the session as judged-in-progress. */
  terminal: boolean
  iterations: CloudOutcomeIteration[]
  /** Explanation from the newest completed iteration. */
  explanation: string | null
  /** True while an evaluation span is open with no matching end. */
  evaluating: boolean
  completedAt: number | null
}

export function activeCloudOutcome(outcomes: readonly CloudOutcome[]): CloudOutcome | null {
  return outcomes.find((outcome) => !outcome.terminal) ?? null
}
