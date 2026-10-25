import type { CloudAgentActionResult } from '../../shared/cloud-agent-provider'
import { isRecord, requestJson, type RawFailure } from './client'
import type { QoderCloudAuthConfig } from './credential-store'

// Writes into a running session. Qoder models every action as an event POST except
// cancel, which has its own endpoint and returns 202 when a turn was actually aborted.

export type QoderCloudClientEvent =
  | { type: 'user.message'; content: { type: 'text'; text: string }[] }
  | { type: 'user.tool_confirmation'; tool_use_id: string; result: 'allow' | 'deny' }
  | {
      type: 'user.define_outcome'
      description: string
      rubric: { type: 'text'; content: string }
      max_iterations: number
    }
  | { type: 'user.interrupt' }

/**
 * A 409 carries two different refusals and the UI must not confuse them, so it is thrown
 * rather than returned (the read path's failure vocabulary has no equivalent): the action
 * path widens it here, once.
 */
class SessionRefusedError extends Error {
  constructor(
    readonly reason: 'busy' | 'closed',
    message: string
  ) {
    super(message)
    this.name = 'SessionRefusedError'
  }
}

function classify(status: number, body: unknown): RawFailure | null {
  if (status !== 409) {
    return null
  }
  const message =
    isRecord(body) && isRecord(body.error) && typeof body.error.message === 'string'
      ? body.error.message
      : ''
  // Why: observed live — an archived/terminated session answers 409 too, so the status alone
  // would report "processing a turn" for a session that will never run again.
  const closed = /archived|terminated|not active|ended/i.test(message)
  throw new SessionRefusedError(
    closed ? 'closed' : 'busy',
    message ||
      (closed
        ? 'This session no longer accepts messages.'
        : 'The session is processing a turn. Wait for it to finish or cancel it.')
  )
}

async function post(
  config: QoderCloudAuthConfig,
  path: string,
  payload: unknown
): Promise<CloudAgentActionResult> {
  try {
    const result = await requestJson(config, path, undefined, {
      method: 'POST',
      ...(payload === undefined ? {} : { body: payload }),
      classify
    })
    return result.ok ? { ok: true } : result
  } catch (error) {
    if (error instanceof SessionRefusedError) {
      return { ok: false, reason: error.reason, message: error.message }
    }
    throw error
  }
}

export async function sendQoderCloudEvents(
  config: QoderCloudAuthConfig,
  sessionId: string,
  events: readonly QoderCloudClientEvent[]
): Promise<CloudAgentActionResult> {
  return post(config, `/sessions/${encodeURIComponent(sessionId)}/events`, { events })
}

/** Archiving is terminal for the session: the vendor then rejects new events. */
export async function archiveQoderCloudSession(
  config: QoderCloudAuthConfig,
  sessionId: string
): Promise<CloudAgentActionResult> {
  return post(config, `/sessions/${encodeURIComponent(sessionId)}/archive`, undefined)
}

export async function cancelQoderCloudTurn(
  config: QoderCloudAuthConfig,
  sessionId: string
): Promise<CloudAgentActionResult> {
  // Why: 200 means the session was already idle, which is the desired end state either way.
  return post(config, `/sessions/${encodeURIComponent(sessionId)}/cancel`, undefined)
}
