/**
 * Fixed vocabulary for a graded acceptance goal, owned by nobody.
 *
 * Why its own module: both the provider-neutral outcome view and the first vendor's event schema
 * need these words. Keeping them here is what stops the neutral layer from importing a vendor —
 * and a vendor from importing the neutral layer back.
 */
export const CLOUD_AGENT_OUTCOME_RESULTS = [
  'pending',
  'running',
  'evaluating',
  'needs_revision',
  'satisfied',
  'max_iterations_reached',
  'failed',
  'interrupted'
] as const

export type CloudAgentOutcomeResult = (typeof CLOUD_AGENT_OUTCOME_RESULTS)[number]

/** How "done" is judged: free text, or a file the vendor stores. */
export type CloudAgentRubric = { type: 'text'; content: string } | { type: 'file'; fileId: string }
