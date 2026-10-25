import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { cloudAgentIpcFailure } from '@/components/cloud-sessions/cloud-agent-ipc-failure'
import type {
  CloudAgentSessionRow,
  QoderCloudRequestFailure
} from '../../../../shared/qoder-cloud-types'
import { cloudAgentApi } from '../../lib/cloud-agent-api'
import { listCloudAgentProviders } from '../../../../shared/cloud-agent-provider-registry'
import { cloudSessionKey } from '../cloud-sessions/cloud-session-context'

const POLL_INTERVAL_MS = 15_000

// Why: the transcript drawer lives outside the sidebar tree but needs the same rows for its
// header; a module-level snapshot avoids a second poller and avoids prop-drilling through root.
let latestSessions: readonly CloudAgentSessionRow[] = []
// Why: a row opened from a search result is not in the feed page, and the drawer read its
// title from the snapshot — so it rendered "Untitled session" over a row that had a name.
const rememberedRows = new Map<string, CloudAgentSessionRow>()
const sessionListeners = new Set<() => void>()
function publishSessions(rows: readonly CloudAgentSessionRow[]): void {
  const listed = new Set(rows.map((row) => cloudSessionKey(row.provider, row.id)))
  for (const id of listed) {
    // The vendor page is authoritative once it lists the row again.
    rememberedRows.delete(id)
  }
  let droppedTitle = false
  for (const row of rows) {
    // A real vendor title outranks the prompt-derived one, so stop carrying the stand-in.
    if (row.title && provisionalTitles.delete(cloudSessionKey(row.provider, row.id))) {
      droppedTitle = true
    }
  }
  if (droppedTitle) {
    persistProvisionalTitles()
  }
  latestSessions = [...rows, ...rememberedRows.values()].sort(
    (a, b) => sessionTime(b) - sessionTime(a)
  )
  for (const listener of sessionListeners) {
    listener()
  }
}

/** Keep a row the user opened visible to the drawer even when the feed page omits it. */
export function rememberCloudSessionRow(row: CloudAgentSessionRow): void {
  if (
    latestSessions.some((session) => session.id === row.id && session.provider === row.provider)
  ) {
    return
  }
  rememberedRows.set(cloudSessionKey(row.provider, row.id), row)
  publishSessions(latestSessions)
}

// Why: a session created from a prompt has no vendor title until the vendor names it, so the
// drawer announced "Untitled session" right after the user typed theirs. Titles only — a
// half-known row would hide the composer while its capabilities are still unknown.
const PROVISIONAL_TITLE_STORAGE_KEY = 'orca.cloudSessions.provisionalTitles'
// Why: the vendor leaves most drafts unnamed, so the prompt-derived label is the only thing that
// makes those rows scannable — losing it on every reload would put "Untitled session · gtf0" back.
function loadProvisionalTitles(): [string, string][] {
  if (typeof window === 'undefined') {
    return []
  }
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(PROVISIONAL_TITLE_STORAGE_KEY) ?? '[]'
    )
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed
      .filter(
        (entry): entry is [string, string] =>
          Array.isArray(entry) &&
          typeof entry[0] === 'string' &&
          typeof entry[1] === 'string' &&
          entry[1].length > 0
      )
      .map(([key, title]): [string, string] => [
        key.startsWith('[') ? key : cloudSessionKey('qoder-cloud', key),
        title
      ])
  } catch {
    return []
  }
}

const PROVISIONAL_TITLE_LIMIT = 200
const provisionalTitles = new Map<string, string>(loadProvisionalTitles())

function persistProvisionalTitles(): void {
  if (typeof window === 'undefined') {
    return
  }
  try {
    const entries = [...provisionalTitles.entries()].slice(-PROVISIONAL_TITLE_LIMIT)
    window.localStorage.setItem(PROVISIONAL_TITLE_STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // A full or blocked storage costs labels, never correctness.
  }
}

export function rememberCloudSessionTitle(
  sessionId: string,
  title: string,
  provider: string
): void {
  const trimmed = title.trim()
  if (trimmed) {
    provisionalTitles.set(cloudSessionKey(provider, sessionId), trimmed.split('\n')[0].slice(0, 80))
    persistProvisionalTitles()
  }
}

export function cloudSessionTitle(sessionId: string, provider: string): string | undefined {
  return provisionalTitles.get(cloudSessionKey(provider, sessionId))
}
// Why: a session created in the drawer is not in the feed until the next poll; the creator
// asks for an immediate reload so its own row (and thus its capabilities) exists at once.
let latestRefresh: (() => void) | null = null

export function requestCloudSessionsRefresh(): void {
  latestRefresh?.()
}

export function useLatestCloudSessions(): readonly CloudAgentSessionRow[] {
  return useSyncExternalStore(
    (listener) => {
      sessionListeners.add(listener)
      return () => sessionListeners.delete(listener)
    },
    () => latestSessions,
    () => latestSessions
  )
}
const PAGE_LIMIT = 20

// Why: newest activity first, from the vendor's own timestamps. Ranking by state instead
// made a row jump under the cursor the moment a different session started working.
function sessionTime(row: CloudAgentSessionRow): number {
  return Date.parse(row.updatedAt ?? row.createdAt ?? '') || 0
}

export type CloudSessionsFeed = {
  /** null until the first status read settles. */
  configured: boolean | null
  /** Includes connected providers with no sessions yet. */
  configuredProviders: string[]
  sessions: CloudAgentSessionRow[]
  /** The vendor had more than one page; the count shown must say so. */
  hasMore: boolean
  /** Last request failure, kept so a transient outage does not blank the list. */
  failure: QoderCloudRequestFailure | null
  /** Which vendor that failure belongs to, so the copy names the right one. */
  failureProvider: string | null
  /** Sessions were fetched at least once; the list is a projection of that moment, not live. */
  lastFetchedAt: number | null
  refresh: () => void
}

/**
 * Polls Qoder Cloud for the active + idle sessions. Why polling and not the SSE
 * stream in v1: the stream is per session, and the list is what the sidebar needs.
 * Pausing while the window is hidden keeps a background Orca from spending quota.
 */
export function useCloudSessionsFeed(enabled: boolean): CloudSessionsFeed {
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [configuredProviderIds, setConfiguredProviderIds] = useState<string[]>([])
  const [sessions, setSessions] = useState<CloudAgentSessionRow[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [failure, setFailure] = useState<QoderCloudRequestFailure | null>(null)
  const [failureProvider, setFailureProvider] = useState<string | null>(null)
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null)
  const generationRef = useRef(0)

  const load = useCallback(async () => {
    const generation = ++generationRef.current
    // Why the fan-out: every configured vendor is a column of the same list. A provider whose
    // status says "not configured" is skipped instead of failing the whole page.
    const statuses = await Promise.all(
      listCloudAgentProviders().map(async (provider) => {
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
    setConfiguredProviderIds(configuredProviders)
    if (configuredProviders.length === 0) {
      setSessions([])
      setHasMore(false)
      setFailure(null)
      return
    }
    // Why: the list is newest-first and a busy account has hundreds of idle sessions, so a
    // single page would bury the ones actually working. Fetch active first, then recent idle.
    const results = await Promise.all(
      configuredProviders.map(async (provider) => {
        const [active, recent] = await Promise.all([
          cloudAgentApi(provider)
            .listSessions({ limit: PAGE_LIMIT, statuses: ['running', 'rescheduling'] })
            .catch((error: unknown) => cloudAgentIpcFailure(error)),
          cloudAgentApi(provider)
            .listSessions({ limit: PAGE_LIMIT })
            .catch((error: unknown) => cloudAgentIpcFailure(error))
        ])
        return { provider, pages: [active, recent] }
      })
    )
    if (generation !== generationRef.current) {
      return
    }
    // Why per-provider: one vendor being down must not blank the others' rows — with several
    // providers in one list, an all-or-nothing failure turns a partial outage into an empty panel.
    const seen = new Set<string>()
    const merged: CloudAgentSessionRow[] = []
    let failed: { provider: string; failure: QoderCloudRequestFailure } | null = null
    let hasMore = false
    for (const result of results) {
      for (const page of result.pages) {
        if (!page.ok) {
          failed ??= { provider: result.provider, failure: page }
          continue
        }
        if (page.page.nextPage !== null) {
          hasMore = true
        }
        for (const row of page.page.sessions) {
          // Why provider + id: two vendors can hand out the same id shape.
          const key = `${row.provider}:${row.id}`
          if (!seen.has(key)) {
            seen.add(key)
            merged.push(row)
          }
        }
      }
    }
    merged.sort((a, b) => sessionTime(b) - sessionTime(a) || a.id.localeCompare(b.id))
    if (merged.length === 0 && failed) {
      setFailure(failed.failure)
      setFailureProvider(failed.provider)
      return
    }
    setSessions(merged)
    publishSessions(merged)
    setHasMore(hasMore)
    setFailure(failed?.failure ?? null)
    setFailureProvider(failed?.provider ?? null)
    setLastFetchedAt(Date.now())
  }, [])

  useEffect(() => {
    if (!enabled) {
      return
    }
    // Why: a hidden window skips the tick rather than tearing the timer down, so the
    // effect owns exactly one interval and one listener for its whole lifetime.
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

  useEffect(() => {
    latestRefresh = () => void load()
    return () => {
      latestRefresh = null
    }
  }, [load])

  return {
    configured,
    configuredProviders: configuredProviderIds,
    sessions,
    hasMore,
    failure,
    failureProvider,
    lastFetchedAt,
    refresh: () => void load()
  }
}
