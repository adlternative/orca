import { useEffect, useState } from 'react'
import type { CloudAgentSessionRow } from '../../../../shared/cloud-agent-provider'
import { cloudAgentApi } from '../../lib/cloud-agent-api'

/**
 * Reads one session straight from the provider.
 *
 * Why: sessions that left the feed (archived, or terminated while the drawer was open) had no row,
 * so the drawer fell back to "Untitled session" and treated the session as live — the composer
 * invited a follow-up the provider would reject. `enabled` keeps the extra IPC off the common path
 * where the feed already carries the row.
 */
export function useCloudSessionDetail(
  sessionId: string | null,
  enabled: boolean,
  provider?: string | null
): CloudAgentSessionRow | null {
  const [detail, setDetail] = useState<CloudAgentSessionRow | null>(null)

  useEffect(() => {
    if (!enabled || sessionId === null) {
      setDetail(null)
      return
    }
    let active = true
    void cloudAgentApi(provider)
      .getSession(sessionId)
      .then((result) => {
        // Why: a slow reply for the previous session must not paint over the current one.
        if (
          active &&
          result.ok &&
          result.session.id === sessionId &&
          (!provider || result.session.provider === provider)
        ) {
          setDetail(result.session)
        }
      })
    return () => {
      active = false
    }
  }, [enabled, sessionId, provider])

  return enabled && detail?.id === sessionId && (!provider || detail.provider === provider)
    ? detail
    : null
}
