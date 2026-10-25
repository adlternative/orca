import { useCallback, useEffect, useRef, useState } from 'react'
import { cloudAgentIpcFailure } from '@/components/cloud-sessions/cloud-agent-ipc-failure'
import type {
  CloudAgentRequestFailure,
  CloudAgentSchedule,
  CloudAgentScheduleRun
} from '../../../../shared/cloud-agent-provider'
import { cloudAgentApi } from '../../lib/cloud-agent-api'
import { listCloudAgentProviders } from '../../../../shared/cloud-agent-provider-registry'

const POLL_INTERVAL_MS = 60_000
const PAGE_LIMIT = 50

export type CloudSchedulesFeed = {
  configured: boolean | null
  schedules: CloudAgentSchedule[]
  failure: CloudAgentRequestFailure | null
  refresh: () => void
}

/** Vendor-owned schedules (Qoder Deployments). One minute is plenty: a cron edit is rare. */
export function useCloudSchedulesFeed(enabled: boolean): CloudSchedulesFeed {
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [schedules, setSchedules] = useState<CloudAgentSchedule[]>([])
  const [failure, setFailure] = useState<CloudAgentRequestFailure | null>(null)
  const generationRef = useRef(0)

  const load = useCallback(async () => {
    const generation = ++generationRef.current
    // Why filter by capability: a vendor without scheduled sessions would answer with an error
    // or an empty page, and either way the automation list would be lying about this account.
    const candidates = listCloudAgentProviders().filter(
      (provider) => provider.capabilities.schedules
    )
    const statuses = await Promise.all(
      candidates.map(async (provider) => {
        try {
          return { provider, status: await cloudAgentApi(provider.id).status() }
        } catch {
          return null
        }
      })
    )
    if (generation !== generationRef.current) {
      return
    }
    const configuredProviders = statuses
      .filter(
        (entry): entry is NonNullable<typeof entry> => entry !== null && entry.status.configured
      )
      .map((entry) => entry.provider.id)
    setConfigured(configuredProviders.length > 0)
    if (configuredProviders.length === 0) {
      setSchedules([])
      setFailure(null)
      return
    }
    const results = await Promise.all(
      configuredProviders.map(async (provider) => {
        try {
          return await cloudAgentApi(provider).listSchedules({ limit: PAGE_LIMIT })
        } catch (error) {
          return cloudAgentIpcFailure(error)
        }
      })
    )
    if (generation !== generationRef.current) {
      return
    }
    const failed = results.find((result) => !result.ok)
    if (failed) {
      setFailure(failed)
      return
    }
    setSchedules(results.flatMap((result) => (result.ok ? result.page.schedules : [])))
    setFailure(null)
  }, [])

  useEffect(() => {
    if (!enabled) {
      return
    }
    const tick = (): void => {
      if (document.visibilityState === 'visible') {
        void load()
      }
    }
    tick()
    const timer = setInterval(tick, POLL_INTERVAL_MS)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [enabled, load])

  return { configured, schedules, failure, refresh: () => void load() }
}

export type CloudScheduleRuns = {
  runs: CloudAgentScheduleRun[]
  loading: boolean
  failure: CloudAgentRequestFailure | null
}

/** The most recent runs for one schedule; fetched when a row is expanded. */
export function useCloudScheduleRuns(scheduleId: string | null): CloudScheduleRuns {
  const [state, setState] = useState<CloudScheduleRuns>({ runs: [], loading: false, failure: null })
  useEffect(() => {
    if (!scheduleId) {
      setState({ runs: [], loading: false, failure: null })
      return
    }
    let cancelled = false
    setState({ runs: [], loading: true, failure: null })
    void (async () => {
      let result
      try {
        result = await cloudAgentApi().listScheduleRuns({ scheduleId, limit: 10 })
      } catch (error) {
        result = cloudAgentIpcFailure(error)
      }
      if (cancelled) {
        return
      }
      setState(
        result.ok
          ? { runs: result.page.runs, loading: false, failure: null }
          : { runs: [], loading: false, failure: result }
      )
    })()
    return () => {
      cancelled = true
    }
  }, [scheduleId])
  return state
}
