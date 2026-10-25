import { useEffect, useRef, useState } from 'react'
import type { CloudAgentSessionRow } from '../../../../shared/cloud-agent-provider'
import { cloudAgentIpcFailure } from './cloud-agent-ipc-failure'
import { cloudAgentApi } from '../../lib/cloud-agent-api'

/** Pages fetched when a query is active: enough to cover a normal account without fanning out. */
const SEARCH_PAGE_SIZE = 100
const SEARCH_MAX_PAGES = 3
const SEARCH_DEBOUNCE_MS = 250
const SEARCH_MIN_QUERY = 2

type SearchState = {
  rows: CloudAgentSessionRow[]
  loading: boolean
  /** True when the scan stopped at SEARCH_MAX_PAGES with more pages behind it. */
  truncated: boolean
  /** Set when the query is too short; the caller falls back to its own list. */
  inactive: boolean
}

const INACTIVE: SearchState = { rows: [], loading: false, truncated: false, inactive: true }

/**
 * The vendor exposes no working search endpoint (`/sessions/search` 404s and query params are
 * ignored), so a query is resolved here: page through the newest sessions once per query and
 * filter by title or id. Bounded at three pages, and it says so when that bound was hit.
 */
export function useCloudSessionSearch(query: string, enabled: boolean): SearchState {
  const [state, setState] = useState<SearchState>(INACTIVE)
  const generationRef = useRef(0)
  const trimmed = query.trim().toLowerCase()

  useEffect(() => {
    if (!enabled || trimmed.length < SEARCH_MIN_QUERY) {
      setState(INACTIVE)
      return
    }
    const generation = ++generationRef.current
    setState((current) => ({ ...current, loading: true, inactive: false }))
    const timer = setTimeout(() => {
      void (async () => {
        const matches: CloudAgentSessionRow[] = []
        let page: string | null = null
        let truncated = false
        for (let index = 0; index < SEARCH_MAX_PAGES; index += 1) {
          let result: Awaited<ReturnType<ReturnType<typeof cloudAgentApi>['listSessions']>>
          try {
            result = await cloudAgentApi().listSessions({
              limit: SEARCH_PAGE_SIZE,
              ...(page ? { page } : {})
            })
          } catch (error) {
            result = cloudAgentIpcFailure(error)
          }
          if (generation !== generationRef.current) {
            return
          }
          if (!result.ok) {
            setState({ rows: matches, loading: false, truncated, inactive: false })
            return
          }
          for (const session of result.page.sessions) {
            if (
              (session.title ?? '').toLowerCase().includes(trimmed) ||
              session.id.toLowerCase().includes(trimmed)
            ) {
              matches.push(session)
            }
          }
          page = result.page.nextPage
          // Why: the scan can reach three pages, so waiting for all of them kept the pane on
          // "Searching…" for seconds while a first page of matches was already in hand.
          setState({ rows: [...matches], loading: page !== null, truncated, inactive: false })
          if (!page) {
            break
          }
          truncated = index === SEARCH_MAX_PAGES - 1
        }
        if (generation === generationRef.current) {
          setState({ rows: matches, loading: false, truncated, inactive: false })
        }
      })()
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [enabled, trimmed])

  return state
}
