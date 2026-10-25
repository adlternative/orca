/**
 * One model the account may run cloud sessions with.
 *
 * Why a local shape: the vendor's `/models` payload is verbose and versioned; the UI only ever
 * needs what a human picks on, so the main process trims it once.
 */
export type CloudAgentModel = {
  id: string
  displayName: string
  /** Credits multiplier relative to the baseline model, when the vendor publishes one. */
  priceFactor: number | null
  vision: boolean
  /** Reasoning effort levels this model advertises, in vendor order. Empty when it has none. */
  efforts: string[]
  defaultEffort: string | null
  /** Context windows this model accepts, in vendor order. */
  contextWindows: number[]
}

export type SetCloudAgentModelInput = {
  sessionId: string
  modelId: string
  /** Omit unless the model advertises efforts. */
  effort?: string | null
  /** Omit unless the caller needs a specific window. */
  contextWindow?: number | null
}
