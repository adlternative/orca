import { translate } from '@/i18n/i18n'
import { getCloudAgentProvider } from '../../../../shared/cloud-agent-provider-registry'

/**
 * What a failure means and what a human can do about it.
 *
 * Why not the vendor message: the main process passes vendor and network text through verbatim,
 * which put English strings like "Qoder Cloud is unreachable." inside a Chinese UI. Every reason
 * is answered here, so a new one cannot leak raw text by omission.
 */
type CloudFailureLike = { reason: string; message: string }

/**
 * Every message names the vendor that actually failed.
 *
 * Why a parameter: with more than one cloud agent provider, "Qoder Cloud is unreachable" over an
 * OpenHands outage sends people to the wrong settings card.
 */
export function cloudAgentFailureCopy(failure: CloudFailureLike, providerLabel: string): string {
  switch (failure.reason) {
    case 'rejected':
      return translate(
        'auto.components.sidebar.cloud.sessions.failure.rejected',
        '{{provider}} rejected the saved credential. Update it in Settings → Integrations.',
        { provider: providerLabel }
      )
    case 'unreachable':
      return translate(
        'auto.components.sidebar.cloud.sessions.failure.unreachable',
        '{{provider}} is unreachable. Check the network, then try again.',
        { provider: providerLabel }
      )
    case 'not-found':
      return translate(
        'auto.components.sidebar.cloud.sessions.failure.notFound',
        'This session no longer exists on {{provider}} — it was most likely deleted there.',
        { provider: providerLabel }
      )
    case 'not-configured':
      return translate(
        'auto.components.sidebar.cloud.sessions.failure.notConfigured',
        'Connect {{provider}} in Settings → Integrations.',
        { provider: providerLabel }
      )
    case 'malformed':
      return translate(
        'auto.components.sidebar.cloud.sessions.failure.malformed',
        '{{provider}} returned an unexpected response.',
        { provider: providerLabel }
      )
    case 'unsupported':
      return translate(
        'auto.components.sidebar.cloud.sessions.failure.unsupported',
        'This host does not support cloud agent sessions yet.'
      )
    case 'busy':
      return translate(
        'auto.components.cloud.sessions.controls.busy',
        'The session is processing a turn. Wait for it to finish or cancel it.'
      )
    case 'closed':
      return translate(
        'auto.components.cloud.sessions.controls.closed',
        'This session no longer accepts messages.'
      )
    default:
      return translate(
        'auto.components.cloud.sessions.failure.generic',
        '{{provider}} could not be reached. Try again.',
        { provider: providerLabel }
      )
  }
}

/** True when repeating the identical request can plausibly succeed. */
export function cloudAgentFailureIsTransient(failure: CloudFailureLike): boolean {
  return failure.reason === 'unreachable'
}

/** A provider id is not a name; the settings card and this message must agree. */
export function providerLabel(providerId: string | null | undefined): string {
  if (!providerId) {
    return 'The cloud agent'
  }
  return getCloudAgentProvider(providerId)?.label ?? providerId
}
