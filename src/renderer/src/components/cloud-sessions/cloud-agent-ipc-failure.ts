import type { CloudAgentRequestFailure } from '../../../../shared/cloud-agent-provider'
import { translate } from '@/i18n/i18n'

/**
 * Classify a thrown IPC call. A host that predates a handler answers
 * "No handler registered for '…'", which is a capability gap rather than a failure: the
 * desktop and a remote runtime are updated independently, so this is a normal pairing.
 * Without this, Electron's internals string reaches the user verbatim.
 */
export function cloudAgentIpcFailure(error: unknown): CloudAgentRequestFailure {
  const message = error instanceof Error ? error.message : String(error)
  if (/no handler registered/i.test(message)) {
    return {
      ok: false,
      reason: 'unsupported',
      message: translate(
        'auto.components.cloud.sessions.unsupportedHost',
        'This host does not support cloud agent sessions yet.'
      )
    }
  }
  return { ok: false, reason: 'unreachable', message }
}

export function isCloudAgentUnsupported(
  failure: CloudAgentRequestFailure | null | undefined
): boolean {
  return failure?.reason === 'unsupported'
}
