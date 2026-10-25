import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cancelQoderCloudTurn, sendQoderCloudEvents } from './session-actions'

const config = { baseUrl: 'https://api.qoder.com/api/v1/cloud', accessToken: 'pat_test' }
const fetchMock = vi.fn<typeof fetch>()

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function sentBody(callIndex = 0): unknown {
  const call = fetchMock.mock.calls.at(callIndex)
  const init = call?.[1]
  const body = typeof init === 'object' && init !== null ? init.body : undefined
  return typeof body === 'string' ? JSON.parse(body) : null
}

describe('sendQoderCloudEvents', () => {
  it('posts a user.message with the documented envelope', async () => {
    fetchMock.mockResolvedValue(json(200, { data: [] }))
    const result = await sendQoderCloudEvents(config, 'sess_1', [
      { type: 'user.message', content: [{ type: 'text', text: 'keep going' }] }
    ])
    expect(result).toEqual({ ok: true })
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(String(url)).toBe('https://api.qoder.com/api/v1/cloud/sessions/sess_1/events')
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json')
    expect(sentBody()).toEqual({
      events: [{ type: 'user.message', content: [{ type: 'text', text: 'keep going' }] }]
    })
  })

  it('posts a tool confirmation with the tool_use id', async () => {
    fetchMock.mockResolvedValue(json(200, { data: [] }))
    await sendQoderCloudEvents(config, 'sess_1', [
      { type: 'user.tool_confirmation', tool_use_id: 'evt_tool', result: 'allow' }
    ])
    expect(sentBody()).toEqual({
      events: [{ type: 'user.tool_confirmation', tool_use_id: 'evt_tool', result: 'allow' }]
    })
  })

  it('reports a 409 as busy instead of a broken credential', async () => {
    fetchMock.mockResolvedValue(
      json(409, {
        type: 'error',
        error: { type: 'invalid_request_error', message: 'Session is currently processing a turn.' }
      })
    )
    const result = await sendQoderCloudEvents(config, 'sess_1', [
      { type: 'user.message', content: [{ type: 'text', text: 'hi' }] }
    ])
    expect(result).toEqual({
      ok: false,
      reason: 'busy',
      message: 'Session is currently processing a turn.'
    })
  })

  it('tells an archived-session 409 apart from a busy one', async () => {
    fetchMock.mockResolvedValue(
      json(409, {
        type: 'error',
        error: { type: 'invalid_request_error', message: 'Session is archived.' }
      })
    )
    expect(
      await sendQoderCloudEvents(config, 'sess_1', [
        { type: 'user.message', content: [{ type: 'text', text: 'hi' }] }
      ])
    ).toEqual({ ok: false, reason: 'closed', message: 'Session is archived.' })
  })

  it('keeps 401 as a rejection and a network error as unreachable', async () => {
    fetchMock.mockResolvedValueOnce(
      json(401, { code: 'TOKEN_INVALID', message: 'invalid pt-token' })
    )
    expect(await sendQoderCloudEvents(config, 's', [])).toMatchObject({
      ok: false,
      reason: 'rejected'
    })
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))
    expect(await sendQoderCloudEvents(config, 's', [])).toMatchObject({
      ok: false,
      reason: 'unreachable'
    })
  })

  it('encodes the session id into the path', async () => {
    fetchMock.mockResolvedValue(json(200, {}))
    await sendQoderCloudEvents(config, 'sess/../evil', [])
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://api.qoder.com/api/v1/cloud/sessions/sess%2F..%2Fevil/events'
    )
  })
})

describe('cancelQoderCloudTurn', () => {
  it('posts to /cancel with no body and treats an already-idle 200 as success', async () => {
    fetchMock.mockResolvedValue(json(200, { id: 'sess_1', type: 'session', status: 'idle' }))
    expect(await cancelQoderCloudTurn(config, 'sess_1')).toEqual({ ok: true })
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(String(url)).toBe('https://api.qoder.com/api/v1/cloud/sessions/sess_1/cancel')
    expect(init?.method).toBe('POST')
    expect(init?.body).toBeUndefined()
  })

  it('accepts the 202 canceling response', async () => {
    fetchMock.mockResolvedValue(json(202, { status: 'canceling' }))
    expect(await cancelQoderCloudTurn(config, 'sess_1')).toEqual({ ok: true })
  })
})
