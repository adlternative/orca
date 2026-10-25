import { BrowserWindow } from 'electron'
import { parseQoderCloudEvent } from '../../shared/qoder-cloud-event-parser'
import { SseFrameParser } from '../../shared/sse-frame-parser'
import {
  CLOUD_AGENT_STREAM_EVENT_CHANNEL,
  CLOUD_AGENT_STREAM_STATE_CHANNEL,
  type CloudAgentStreamPush,
  type CloudAgentStreamState
} from '../../shared/cloud-agent-stream'
import type { QoderCloudEvent } from '../../shared/qoder-cloud-events'
import type { QoderCloudAuthConfig } from './credential-store'

/** Qoder's stream shares the generic channels; the provider tag keeps vendors apart. */
const PROVIDER = 'qoder-cloud'

const RECONNECT_BASE_MS = 1_000
const RECONNECT_MAX_MS = 30_000
/** Stop reconnecting forever on a credential rejection; the user has to act. */
const FATAL_STATUSES = new Set([401, 403, 404])

type Stream = {
  sessionId: string
  lastEventId: string | null
  controller: AbortController
  attempt: number
  closed: boolean
}

function broadcast(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, payload)
    }
  }
}

/**
 * One live SSE tail per session, shared by every renderer subscriber. Reconnects with
 * `Last-Event-ID` so a dropped connection replays what was missed instead of losing it;
 * the vendor confirmed replay works from an arbitrary older id.
 */
export class QoderCloudStreamManager {
  private readonly streams = new Map<string, Stream>()

  constructor(private readonly resolveConfig: () => QoderCloudAuthConfig | null) {}

  subscribe(sessionId: string, lastEventId: string | null): void {
    if (this.streams.has(sessionId)) {
      return
    }
    const stream: Stream = {
      sessionId,
      lastEventId,
      controller: new AbortController(),
      attempt: 0,
      closed: false
    }
    this.streams.set(sessionId, stream)
    void this.run(stream)
  }

  unsubscribe(sessionId: string): void {
    const stream = this.streams.get(sessionId)
    if (!stream) {
      return
    }
    stream.closed = true
    stream.controller.abort()
    this.streams.delete(sessionId)
    broadcast(CLOUD_AGENT_STREAM_STATE_CHANNEL, {
      provider: PROVIDER,
      sessionId,
      state: 'closed'
    } satisfies CloudAgentStreamState)
  }

  closeAll(): void {
    for (const sessionId of Array.from(this.streams.keys())) {
      this.unsubscribe(sessionId)
    }
  }

  private async run(stream: Stream): Promise<void> {
    while (!stream.closed) {
      const config = this.resolveConfig()
      if (!config) {
        this.state(stream, 'closed', 'not-configured')
        this.streams.delete(stream.sessionId)
        return
      }
      this.state(stream, stream.attempt === 0 ? 'connecting' : 'reconnecting')
      const outcome = await this.connectOnce(stream, config)
      if (stream.closed) {
        return
      }
      if (outcome.fatal) {
        this.state(stream, 'closed', outcome.detail)
        this.streams.delete(stream.sessionId)
        return
      }
      stream.attempt += 1
      const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** Math.min(stream.attempt, 5))
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  private async connectOnce(
    stream: Stream,
    config: QoderCloudAuthConfig
  ): Promise<{ fatal: boolean; detail?: string }> {
    const base = config.baseUrl.replace(/\/+$/, '')
    const url = `${base}/sessions/${encodeURIComponent(stream.sessionId)}/events/stream`
    let response: Response
    try {
      response = await fetch(url, {
        headers: {
          Accept: 'text/event-stream',
          Authorization: `Bearer ${config.accessToken}`,
          ...(stream.lastEventId ? { 'Last-Event-ID': stream.lastEventId } : {})
        },
        signal: stream.controller.signal
      })
    } catch (error) {
      return { fatal: false, detail: error instanceof Error ? error.message : 'fetch failed' }
    }
    if (!response.ok || !response.body) {
      try {
        await response.body?.cancel()
      } catch {
        // nothing to release
      }
      return { fatal: FATAL_STATUSES.has(response.status), detail: `HTTP ${response.status}` }
    }
    stream.attempt = 0
    this.state(stream, 'open')
    const parser = new SseFrameParser()
    const decoder = new TextDecoder()
    const reader = response.body.getReader()
    try {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) {
          return { fatal: false, detail: 'stream ended' }
        }
        const events: QoderCloudEvent[] = []
        for (const frame of parser.push(decoder.decode(value, { stream: true }))) {
          if (frame.id) {
            stream.lastEventId = frame.id
          }
          let body: unknown
          try {
            body = JSON.parse(frame.data)
          } catch {
            continue
          }
          const event = parseQoderCloudEvent(body)
          if (event) {
            events.push(event)
          }
        }
        if (events.length > 0) {
          broadcast(CLOUD_AGENT_STREAM_EVENT_CHANNEL, {
            provider: PROVIDER,
            sessionId: stream.sessionId,
            events
          } satisfies CloudAgentStreamPush<QoderCloudEvent>)
        }
      }
    } catch (error) {
      if (stream.closed) {
        return { fatal: true }
      }
      return { fatal: false, detail: error instanceof Error ? error.message : 'read failed' }
    } finally {
      reader.releaseLock()
    }
  }

  private state(stream: Stream, state: CloudAgentStreamState['state'], detail?: string): void {
    broadcast(CLOUD_AGENT_STREAM_STATE_CHANNEL, {
      provider: PROVIDER,
      sessionId: stream.sessionId,
      state,
      ...(detail ? { detail } : {})
    } satisfies CloudAgentStreamState)
  }
}
