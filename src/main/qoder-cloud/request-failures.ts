/**
 * Translating a failed request into something the UI can name.
 *
 * Why its own module: `client.ts` sits at the file-length cap, and these two answers have nothing
 * to do with building requests — they only describe why one failed.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Distinguishes a slow host from a dead one, so the copy can say which. */
export function failureFromThrow(
  error: unknown,
  timeoutMs: number
): { reason: 'unreachable'; message: string } {
  const timedOut = error instanceof Error && error.name === 'TimeoutError'
  return {
    reason: 'unreachable',
    message: timedOut
      ? `Qoder Cloud did not answer within ${timeoutMs / 1000}s.`
      : 'Qoder Cloud is unreachable.'
  }
}

/**
 * Only 401/403 blame the credential. 404 means the row is stale (the session was deleted), so a
 * retry cannot help and the copy has to say so instead of "try again".
 */
export function failureReasonForStatus(status: number): 'rejected' | 'not-found' | 'unreachable' {
  if (status === 401 || status === 403) {
    return 'rejected'
  }
  return status === 404 ? 'not-found' : 'unreachable'
}

/** The best sentence the vendor offers, falling back to the status line. */
export function vendorErrorMessage(body: unknown, status: number): string {
  if (isRecord(body)) {
    // Documented envelope: { type: 'error', error: { message } }.
    if (isRecord(body.error) && typeof body.error.message === 'string') {
      return body.error.message
    }
    // Observed on 401 from the auth gateway: { code, message }.
    if (typeof body.message === 'string' && body.message.length > 0) {
      return body.message
    }
    if (typeof body.detail === 'string' && body.detail.length > 0) {
      return body.detail
    }
  }
  return `Qoder Cloud request failed with HTTP ${status}.`
}
