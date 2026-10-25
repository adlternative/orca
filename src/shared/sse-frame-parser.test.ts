import { describe, expect, it } from 'vitest'
import { SseFrameParser, type SseFrame } from './sse-frame-parser'

const CAPTURED =
  'id: evt_1\nevent: user.message\ndata: {"id":"evt_1","type":"user.message"}\n\n' +
  'id: evt_2\nevent: agent.message\ndata: {"id":"evt_2",\ndata: "type":"agent.message"}\n\n'

describe('SseFrameParser', () => {
  it('parses frames as captured from the Qoder stream', () => {
    const frames = new SseFrameParser().push(CAPTURED)
    expect(frames).toEqual([
      { id: 'evt_1', event: 'user.message', data: '{"id":"evt_1","type":"user.message"}' },
      // Why: multi-line data joins with \n per spec.
      { id: 'evt_2', event: 'agent.message', data: '{"id":"evt_2",\n"type":"agent.message"}' }
    ])
  })

  it('reassembles frames split across arbitrary chunk boundaries', () => {
    const parser = new SseFrameParser()
    const frames: SseFrame[] = []
    for (let i = 0; i < CAPTURED.length; i += 7) {
      frames.push(...parser.push(CAPTURED.slice(i, i + 7)))
    }
    expect(frames).toHaveLength(2)
    expect(frames[1].id).toBe('evt_2')
  })

  it('ignores comments and keep-alives, tolerates CRLF', () => {
    const frames = new SseFrameParser().push(': ping\r\n\r\nid: a\r\ndata: x\r\n\r\n')
    expect(frames).toEqual([{ id: 'a', event: null, data: 'x' }])
  })

  it('carries the last id forward when a frame omits one', () => {
    const frames = new SseFrameParser().push('id: a\ndata: 1\n\ndata: 2\n\n')
    expect(frames.map((f) => f.id)).toEqual(['a', 'a'])
  })
})
