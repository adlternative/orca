import { useCallback, useState } from 'react'
import type {
  CloudAgentActionFailure,
  CloudAgentSessionAction
} from '../../../../shared/cloud-agent-provider'
import { cloudAgentIpcFailure } from './cloud-agent-ipc-failure'
import { cloudAgentApi } from '../../lib/cloud-agent-api'

export type SessionActionState = {
  pending: CloudAgentSessionAction['kind'] | null
  failure: CloudAgentActionFailure | null
  /** Set after a successful send so the composer can clear itself. */
  lastSentAt: number | null
  run: (action: CloudAgentSessionAction) => Promise<boolean>
  dismissFailure: () => void
}

/** One in-flight write at a time; a second click while busy is ignored by the button. */
export function useCloudSessionAction(
  sessionId: string | null,
  provider?: string | null
): SessionActionState {
  const [pending, setPending] = useState<CloudAgentSessionAction['kind'] | null>(null)
  const [failure, setFailure] = useState<CloudAgentActionFailure | null>(null)
  const [lastSentAt, setLastSentAt] = useState<number | null>(null)

  const run = useCallback(
    async (action: CloudAgentSessionAction): Promise<boolean> => {
      if (!sessionId || pending !== null) {
        return false
      }
      setPending(action.kind)
      setFailure(null)
      let result: Awaited<ReturnType<ReturnType<typeof cloudAgentApi>['sessionAction']>>
      try {
        result = await cloudAgentApi(provider).sessionAction({ sessionId, action })
      } catch (error) {
        result = cloudAgentIpcFailure(error)
      }
      setPending(null)
      if (!result.ok) {
        setFailure(result)
        return false
      }
      setLastSentAt(Date.now())
      return true
    },
    [sessionId, pending, provider]
  )

  return {
    pending,
    failure,
    lastSentAt,
    run,
    dismissFailure: () => setFailure(null)
  }
}
