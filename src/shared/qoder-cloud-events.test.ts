import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { QoderCloudEvent } from './qoder-cloud-events'
import { verdictFromEventTail } from './qoder-cloud-events'
import { parseQoderCloudEvent, parseQoderCloudEventPage } from './qoder-cloud-event-parser'

const FIXTURES = join(__dirname, '__fixtures__', 'qoder-cloud')

function page(name: string) {
  const parsed = parseQoderCloudEventPage(JSON.parse(readFileSync(join(FIXTURES, name), 'utf-8')))
  if (!parsed) {
    throw new Error(`fixture ${name} did not parse`)
  }
  return parsed
}

describe('parseQoderCloudEvent (live captures)', () => {
  it('decodes every event type in a full turn without dropping any', () => {
    const { events } = page('events-full-turn.json')
    expect(events).toHaveLength(10)
    expect(events.map((event) => event.type)).toEqual([
      'session.status_running',
      'session.thread_status_running',
      'user.message',
      'span.model_request_start',
      'agent.thinking',
      'agent.message',
      'agent.tool_use',
      'span.model_request_end',
      'session.thread_status_idle',
      'session.status_idle'
    ])
  })

  it('reads text content, tool input, permission, and credits', () => {
    const { events } = page('events-full-turn.json')
    const user = events.find((event) => event.type === 'user.message')
    const tool = events.find((event) => event.type === 'agent.tool_use')
    const end = events.find((event) => event.type === 'span.model_request_end')
    expect(user && user.type === 'user.message' && user.content).toHaveLength(1)
    const firstBlock = user && user.type === 'user.message' ? user.content[0] : null
    expect(firstBlock?.type).toBe('text')
    const text = firstBlock && 'text' in firstBlock ? firstBlock.text : null
    expect(typeof text === 'string' && text.length > 0).toBe(true)
    expect(tool && tool.type === 'agent.tool_use' && tool.name).toBe('Bash')
    expect(tool && tool.type === 'agent.tool_use' && tool.evaluated_permission).toBe('ask')
    expect(end && end.type === 'span.model_request_end' && end.credits).toBe(1.95)
  })

  it('keeps unknown event types as other instead of dropping them', () => {
    const event = parseQoderCloudEvent({
      id: 'evt_1',
      processed_at: 'now',
      type: 'future.thing'
    })
    expect(event).toEqual({
      id: 'evt_1',
      processed_at: 'now',
      type: 'other',
      rawType: 'future.thing'
    })
  })

  it('refuses events without identity', () => {
    expect(parseQoderCloudEvent({ type: 'agent.message' })).toBeNull()
    expect(parseQoderCloudEvent('x')).toBeNull()
  })
})

describe('verdictFromEventTail', () => {
  it('reads a parked tool approval as blocked even though the vendor says running', () => {
    const { events } = page('events-tail-requires-action.json')
    const verdict = verdictFromEventTail(events.toReversed())
    expect(verdict).toMatchObject({
      state: 'blocked',
      stopReasonType: 'requires_action'
    })
    // Why: the ids name the tool_use awaiting approval; the fixture must carry exactly one.
    expect(verdict?.state === 'blocked' ? verdict.eventIds : []).toHaveLength(1)
  })

  it('keeps an idle session idle when a metadata patch lands after the turn', () => {
    // Why: `session.updated` (model or title patches) and usage rows arrive after the idle
    // markers, and reading only the newest event reported the session as working — which
    // disabled the composer for a session nobody was running.
    const idle = {
      id: 'evt-idle',
      processed_at: '2026-09-15T12:58:50.579402Z',
      type: 'session.status_idle' as const,
      stop_reason: null
    }
    const chatter = [
      {
        id: 'evt-updated',
        processed_at: idle.processed_at,
        type: 'session.updated',
        agent_name: null,
        model: 'auto',
        tool_count: null
      },
      {
        id: 'evt-usage',
        processed_at: idle.processed_at,
        type: 'session.usage',
        credits: 1
      }
    ] as QoderCloudEvent[]
    expect(verdictFromEventTail([idle, ...chatter].toReversed())).toMatchObject({ state: 'idle' })
  })

  it('reads a tail that ends mid-turn as working', () => {
    const { events } = page('events-tail-working.json')
    expect(verdictFromEventTail(events.toReversed())).toEqual({
      state: 'working'
    })
  })

  it('reads an ordinary end_turn idle as idle', () => {
    const verdict = verdictFromEventTail([
      {
        id: 'e',
        processed_at: 'now',
        type: 'session.status_idle',
        stop_reason: { type: 'end_turn' }
      }
    ])
    expect(verdict).toEqual({ state: 'idle', stopReasonType: 'end_turn' })
  })

  it('has no opinion on an empty tail', () => {
    expect(verdictFromEventTail([])).toBeNull()
  })
})
