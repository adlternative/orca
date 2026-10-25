import { useEffect, useRef, useState } from 'react'
import type { CloudAgentFileLink } from '../../../../shared/cloud-agent-provider'
import { cloudAgentApi } from '../../lib/cloud-agent-api'

type LinkState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'ready'; link: CloudAgentFileLink }
  | { phase: 'error'; message: string }

const MIN_REFRESH_MS = 10_000
const REFRESH_LEAD_MS = 60_000

/**
 * Resolve a vendor file id to a short-lived URL when `active`. A long-open drawer must
 * never show a dead image, so a ready link schedules its own re-resolution a minute
 * before expiry. The renderer only ever sees the signed URL, never the credential.
 */
export function useCloudAgentFileLink(fileId: string | null, active: boolean): LinkState {
  const [state, setState] = useState<LinkState>({ phase: 'idle' })
  // Why: bumping this re-runs the resolve effect; the timer that bumps it lives in its own
  // effect so each effect owns exactly one allocation and its cleanup.
  const [refreshTick, setRefreshTick] = useState(0)
  const generationRef = useRef(0)

  useEffect(() => {
    if (!fileId || !active) {
      return
    }
    const generation = ++generationRef.current
    setState((current) => (current.phase === 'ready' ? current : { phase: 'loading' }))
    void (async () => {
      let result: Awaited<ReturnType<ReturnType<typeof cloudAgentApi>['fileLink']>>
      try {
        result = await cloudAgentApi().fileLink(fileId)
      } catch (error) {
        result = {
          ok: false,
          reason: 'unreachable',
          message: error instanceof Error ? error.message : String(error)
        }
      }
      if (generation !== generationRef.current) {
        return
      }
      setState(
        result.ok
          ? { phase: 'ready', link: result.link }
          : { phase: 'error', message: result.message }
      )
    })()
  }, [fileId, active, refreshTick])

  const expiresAt = state.phase === 'ready' ? state.link.expiresAt : null
  useEffect(() => {
    if (expiresAt === null || !active) {
      return
    }
    const timer = setTimeout(
      () => setRefreshTick((tick) => tick + 1),
      Math.max(MIN_REFRESH_MS, expiresAt - Date.now() - REFRESH_LEAD_MS)
    )
    return () => clearTimeout(timer)
  }, [expiresAt, active])

  return state
}
