import { useCallback, useEffect, useRef, useState } from 'react'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import type { QoderCloudEvent } from '../../../../shared/qoder-cloud-events'
import { verdictFromEventTail } from '../../../../shared/qoder-cloud-events'
import {
  decodeQoderCloudTranscript,
  deliveredArtifacts,
  unresolvedToolCallIds,
  type CloudDeliveredArtifact
} from '../../../../shared/qoder-cloud-transcript'
import type { QoderCloudRequestFailure } from '../../../../shared/qoder-cloud-types'
import { activeCloudOutcome, type CloudOutcome } from '../../../../shared/cloud-agent-outcome'
import { projectCloudOutcomes } from '../../../../shared/qoder-cloud-outcome'
import { cloudAgentIpcFailure } from './cloud-agent-ipc-failure'
import { cloudAgentFailureIsTransient } from './cloud-agent-failure-copy'
import { cloudAgentApi } from '../../lib/cloud-agent-api'

const PAGE_LIMIT = 100
const TAIL_POLL_MS = 5_000

type ListEventsArgs = Parameters<ReturnType<typeof cloudAgentApi>['listEvents']>[0]

// Why: an IPC throw (host without this handler, bridge torn down) must surface as a
// failure the view can render, not as a promise that never settles.
async function listEventsSafe(
  args: ListEventsArgs,
  provider: string | null | undefined
): Promise<Awaited<ReturnType<ReturnType<typeof cloudAgentApi>['listEvents']>>> {
  try {
    return await cloudAgentApi(provider).listEvents(args)
  } catch (error) {
    return cloudAgentIpcFailure(error)
  }
}

export type CloudSessionTranscript = {
  messages: NativeChatMessage[]
  /** Live tail transport; `open` means events arrive by push, otherwise the tail is polled. */
  streamState: 'connecting' | 'open' | 'reconnecting' | 'closed' | 'off'
  /** Oldest page may still exist on the vendor side. */
  hasMore: boolean
  loadingEarlier: boolean
  loadEarlier: () => void
  /** Re-reads the newest page now; the composer calls it after a send so the echo is not a poll away. */
  refreshTail: () => Promise<void>
  phase: 'loading' | 'ready' | 'error'
  failure: QoderCloudRequestFailure | null
  /** Re-reads the newest page; the only way out of `phase: 'error'` without closing. */
  retry: () => void
  /** From the newest event: what the session is doing right now. */
  state: 'working' | 'blocked' | 'idle' | 'unknown'
  /** Tool calls still waiting on a human; the blocked view names them. */
  pendingToolCallIds: string[]
  /** Every acceptance goal defined on the session, oldest first. */
  outcomes: CloudOutcome[]
  /** The goal still being worked toward or graded, if any. */
  activeOutcome: CloudOutcome | null
  /** Files the agent delivered, oldest first. */
  artifacts: CloudDeliveredArtifact[]
}

/**
 * Loads a cloud session's event log newest-first, pages older history on demand,
 * and polls the tail so a working session keeps growing. Decoding happens on the
 * full ascending log each time: the log is small (hundreds of events) and the
 * decoder is pure, so a cache would buy nothing and could drift.
 */
export function useCloudSessionTranscript(
  sessionId: string | null,
  /** The vendor that owns this session; a row always knows. */
  provider?: string | null
): CloudSessionTranscript {
  const [events, setEvents] = useState<QoderCloudEvent[]>([])
  const [olderCursor, setOlderCursor] = useState<string | null>(null)
  const [phase, setPhase] = useState<CloudSessionTranscript['phase']>('loading')
  const [failure, setFailure] = useState<QoderCloudRequestFailure | null>(null)
  const [loadingEarlier, setLoadingEarlier] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const [streamState, setStreamState] = useState<CloudSessionTranscript['streamState']>('off')
  const generationRef = useRef(0)
  const newestEventIdRef = useRef<string | null>(null)
  newestEventIdRef.current = events.at(-1)?.id ?? null
  // Why a ref: the load effect must know whether a failed refresh would blank a readable
  // transcript, and reading `events` there would re-run the effect on every streamed event.
  const eventCountRef = useRef(0)
  eventCountRef.current = events.length
  const autoRetriesRef = useRef(0)

  const appendUnseen = useCallback((fresh: readonly QoderCloudEvent[]) => {
    setEvents((current) => {
      const known = new Set(current.map((event) => event.id))
      const appended = fresh.filter((event) => !known.has(event.id))
      return appended.length === 0 ? current : [...current, ...appended]
    })
  }, [])

  // Fetch the newest page on open, and re-fetch on retry without discarding what is on screen.
  useEffect(() => {
    const generation = ++generationRef.current
    const hadEvents = eventCountRef.current > 0
    setFailure(null)
    if (!hadEvents) {
      // Why: reloading a readable transcript must not blank it — a dropped page used to leave
      // the drawer empty behind "Qoder Cloud is unreachable." with the history gone.
      setEvents([])
      setOlderCursor(null)
      setPhase('loading')
    }
    if (!sessionId) {
      return
    }
    void (async () => {
      const result = await listEventsSafe(
        {
          sessionId,
          limit: PAGE_LIMIT,
          order: 'desc'
        },
        provider
      )
      if (generation !== generationRef.current) {
        return
      }
      if (!result.ok) {
        setFailure(result)
        // Why: with history on screen a failed refresh is a banner, not a blank page.
        setPhase(hadEvents ? 'ready' : 'error')
        return
      }
      autoRetriesRef.current = 0
      setEvents(result.page.events.toReversed())
      setOlderCursor(result.page.nextPage)
      setPhase('ready')
    })()
  }, [sessionId, reloadToken, provider])

  // Why: a dropped connection is worth another try on its own; nobody wants to babysit a retry
  // button for a Wi-Fi blip. Bounded, so a real outage still surfaces to the human.
  useEffect(() => {
    if (!sessionId || !failure || !cloudAgentFailureIsTransient(failure)) {
      return
    }
    if (autoRetriesRef.current >= 3) {
      return
    }
    const delay = 1_500 * 2 ** autoRetriesRef.current
    const timer = setTimeout(() => {
      autoRetriesRef.current += 1
      setReloadToken((token) => token + 1)
    }, delay)
    return () => clearTimeout(timer)
  }, [failure, sessionId])

  // Live tail over SSE, resuming from the newest known event so a reconnect replays gaps.
  useEffect(() => {
    if (!sessionId || phase !== 'ready') {
      setStreamState('off')
      return
    }
    const generation = generationRef.current
    const offEvent = cloudAgentApi(provider).onStreamEvent((push) => {
      if (push.sessionId === sessionId && generation === generationRef.current) {
        appendUnseen(push.events)
      }
    })
    const offState = cloudAgentApi(provider).onStreamState((state) => {
      if (state.sessionId === sessionId && generation === generationRef.current) {
        setStreamState(state.state)
      }
    })
    setStreamState('connecting')
    void cloudAgentApi(provider)
      .streamSubscribe({ sessionId, lastEventId: newestEventIdRef.current })
      .catch(() => setStreamState('closed'))
    return () => {
      offEvent()
      offState()
      void cloudAgentApi(provider)
        .streamUnsubscribe(sessionId)
        .catch(() => undefined)
    }
  }, [sessionId, phase, appendUnseen, provider])

  const refreshTail = useCallback(async (): Promise<void> => {
    if (!sessionId) {
      return
    }
    const generation = generationRef.current
    const result = await listEventsSafe(
      {
        sessionId,
        limit: 20,
        order: 'desc'
      },
      provider
    )
    if (generation === generationRef.current && result.ok) {
      appendUnseen(result.page.events.toReversed())
    }
  }, [sessionId, appendUnseen, provider])

  // Why: the stream can be closed (fatal HTTP, old host without the handler); polling keeps
  // the view honest at a slower cadence until it is open again.
  useEffect(() => {
    if (!sessionId || phase !== 'ready' || streamState === 'open') {
      return
    }
    const tick = (): void => {
      if (document.visibilityState !== 'visible') {
        return
      }
      void refreshTail()
    }
    const timer = setInterval(tick, TAIL_POLL_MS)
    return () => clearInterval(timer)
  }, [sessionId, phase, streamState, refreshTail])

  const loadEarlier = useCallback(() => {
    if (!sessionId || !olderCursor || loadingEarlier) {
      return
    }
    const generation = generationRef.current
    const cursor = olderCursor
    setLoadingEarlier(true)
    void (async () => {
      const result = await listEventsSafe(
        {
          sessionId,
          limit: PAGE_LIMIT,
          order: 'desc',
          page: cursor
        },
        provider
      )
      if (generation !== generationRef.current) {
        return
      }
      setLoadingEarlier(false)
      if (!result.ok) {
        return
      }
      const older = result.page.events.toReversed()
      setEvents((current) => [...older, ...current])
      setOlderCursor(result.page.nextPage)
    })()
  }, [sessionId, olderCursor, loadingEarlier, provider])

  const verdict = verdictFromEventTail(events.toReversed())
  const outcomes = projectCloudOutcomes(events)
  return {
    outcomes,
    activeOutcome: activeCloudOutcome(outcomes),
    artifacts: deliveredArtifacts(events),
    messages: decodeQoderCloudTranscript(events),
    streamState,
    hasMore: olderCursor !== null,
    loadingEarlier,
    refreshTail,
    loadEarlier,
    phase,
    failure,
    retry: () => {
      autoRetriesRef.current = 0
      setReloadToken((token) => token + 1)
    },
    state: verdict?.state ?? 'unknown',
    pendingToolCallIds: unresolvedToolCallIds(events)
  }
}
