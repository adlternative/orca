import { useCallback, useEffect, useState } from 'react'
import type { CloudAgentModel } from '../../../../shared/cloud-agent-model'
import type { CloudAgentRequestFailure } from '../../../../shared/cloud-agent-provider'
import { cloudAgentApi } from '../../lib/cloud-agent-api'

export type CloudSessionModelsState = {
  models: CloudAgentModel[]
  failure: CloudAgentRequestFailure | null
  loading: boolean
  reload: () => void
}

// Why module scope: models change per account, not per session, and the picker is opened for
// every session — refetching 14 rows on each open would flicker and spend rate limit.
let cachedModels: CloudAgentModel[] | null = null
let inflight: Promise<{ ok: true; models: CloudAgentModel[] } | CloudAgentRequestFailure> | null =
  null

async function loadModels(): Promise<
  { ok: true; models: CloudAgentModel[] } | CloudAgentRequestFailure
> {
  // Why: the picker also renders where the cloud bridge is absent (unit tests, hosts without
  // the integration) — a missing bridge is a configuration answer, not a crash.
  if (!window.api?.qoderCloud?.listModels) {
    return {
      ok: false,
      reason: 'not-configured',
      message: 'Qoder Cloud is not connected.'
    }
  }
  inflight ??= cloudAgentApi()
    .listModels()
    .finally(() => {
      inflight = null
    })
  return inflight
}

/** The account's pickable models, fetched once and cached for the app's lifetime. */
export function useCloudSessionModels(enabled: boolean): CloudSessionModelsState {
  const [models, setModels] = useState<CloudAgentModel[]>(cachedModels ?? [])
  const [failure, setFailure] = useState<CloudAgentRequestFailure | null>(null)
  const [loading, setLoading] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (!enabled || (cachedModels && reloadToken === 0)) {
      return
    }
    let cancelled = false
    setLoading(true)
    void (async () => {
      const result = await loadModels()
      if (cancelled) {
        return
      }
      setLoading(false)
      if (result.ok) {
        cachedModels = result.models
        setModels(result.models)
        setFailure(null)
        return
      }
      setFailure(result)
    })()
    return () => {
      cancelled = true
    }
  }, [enabled, reloadToken])

  const reload = useCallback(() => {
    cachedModels = null
    setReloadToken((token) => token + 1)
  }, [])

  return { models, failure, loading, reload }
}
