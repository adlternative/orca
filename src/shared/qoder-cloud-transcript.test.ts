import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseQoderCloudEventPage } from './qoder-cloud-event-parser'
import { decodeQoderCloudTranscript, unresolvedToolCallIds } from './qoder-cloud-transcript'

function fixture(name: string) {
  const page = parseQoderCloudEventPage(
    JSON.parse(readFileSync(join(__dirname, '__fixtures__', 'qoder-cloud', name), 'utf-8'))
  )
  if (!page) {
    throw new Error('fixture did not parse')
  }
  return page.events
}

describe('decodeQoderCloudTranscript', () => {
  it('renders a full turn as user → assistant → unresolved tool call', () => {
    const messages = decodeQoderCloudTranscript(fixture('events-full-turn.json'))
    expect(messages.map((m) => [m.role, m.blocks[0]?.type])).toEqual([
      ['user', 'text'],
      ['assistant', 'text'],
      ['assistant', 'tool-call']
    ])
    const call = messages[2].blocks[0]
    expect(call.type === 'tool-call' && call.state).toBe('running')
    expect(call.type === 'tool-call' && call.name).toBe('Bash')
    // Why: every message in the turn shares the user message id so the view groups them.
    expect(new Set(messages.map((m) => m.turnId)).size).toBe(1)
    expect(messages[0].timestamp).toBe(Date.parse('2026-09-15T12:58:48.354143998Z'))
  })

  it('names the tool call a blocked session is waiting on', () => {
    expect(unresolvedToolCallIds(fixture('events-full-turn.json'))).toEqual(['evt_fixture000007'])
  })

  it('settles a tool call when its result arrives and marks errors', () => {
    const events = fixture('events-tail-working.json')
    const messages = decodeQoderCloudTranscript(events)
    const calls = messages.filter((m) => m.blocks[0]?.type === 'tool-call')
    const results = messages.filter((m) => m.role === 'tool')
    expect(results.length).toBeGreaterThan(0)
    for (const result of results) {
      expect(result.blocks[0].type).toBe('tool-result')
    }
    // A result whose call lies before the fixture window still renders as a tool row.
    expect(calls.length + results.length).toBe(messages.length)
  })

  it('emits nothing for status and span bookkeeping', () => {
    const messages = decodeQoderCloudTranscript(
      fixture('events-full-turn.json').filter(
        (e) => e.type.startsWith('session.') || e.type.startsWith('span.')
      )
    )
    expect(messages).toEqual([])
  })
})
