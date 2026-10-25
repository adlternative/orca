import { outcomeResultLabel } from './CloudOutcomeBanner'
import { translate } from '@/i18n/i18n'

/**
 * Header status word for the cloud session drawer.
 *
 * Order matters: a blocked turn outranks a finished outcome, which outranks the busy/idle tail.
 */
export function cloudSessionStatusWord(args: {
  blocked: boolean
  ended: boolean
  hasOutcome: boolean
  outcomeResult: Parameters<typeof outcomeResultLabel>[0] | null
  working: boolean
  state: 'working' | 'blocked' | 'idle' | 'unknown' | 'ended'
}): string | null {
  if (args.blocked) {
    return translate('auto.components.cloud.sessions.drawer.blocked', 'Waiting for approval')
  }
  if (args.ended) {
    return translate('auto.components.cloud.sessions.drawer.ended', 'Ended')
  }
  if (args.hasOutcome && args.outcomeResult) {
    return outcomeResultLabel(args.outcomeResult)
  }
  if (args.working) {
    return translate('auto.components.cloud.sessions.drawer.working', 'Working')
  }
  return args.state === 'idle'
    ? translate('auto.components.cloud.sessions.drawer.idle', 'Idle')
    : null
}
