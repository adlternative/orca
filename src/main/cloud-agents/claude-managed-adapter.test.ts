import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _resetCloudAgentCredentialCaches, saveCloudAgentCredential } from './credentials'
import { claudeManagedAdapter } from './claude-managed-adapter'

const SESSION = {
  id: 'sesn_test_1',
  type: 'session',
  status: 'idle',
  title: 'Weekly digest',
  created_at: '2026-10-23T01:07:48.332521Z',
  updated_at: '2026-10-23T01:08:41.109059Z',
  archived_at: null,
  environment_id: 'env_1',
  agent: { id: 'agent_1', name: 'Field monitor', version: 3, model: { id: 'claude-opus-5-5' } }
}

let server: Server
let baseUrl = ''
const requests: { method: string; url: string; body: string }[] = []
const requestHeaders: Record<string, string>[] = []
let lastStatus = 200

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => {
      body += String(chunk)
    })
    req.on('end', () => {
      requests.push({ method: req.method ?? 'GET', url: req.url ?? '', body })
      requestHeaders.push(
        Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, String(v)]))
      )
      const send = (status: number, payload: unknown): void => {
        res.writeHead(status, { 'content-type': 'application/json' })
        res.end(JSON.stringify(payload))
      }
      if (lastStatus !== 200) {
        send(lastStatus, {
          type: 'error',
          error: { type: 'authentication_error', message: 'bad token' }
        })
        return
      }
      if (req.url?.startsWith('/v1/sessions?')) {
        send(200, { data: [SESSION], next_page: null })
        return
      }
      if (req.url === '/v1/sessions/sesn_test_1') {
        send(200, SESSION)
        return
      }
      if (req.url?.includes('/v1/sessions/sesn_test_1/events') && req.method === 'GET') {
        send(200, {
          data: [
            {
              id: 'sevt_1',
              type: 'user.message',
              processed_at: '2026-10-23T01:07:49.191714Z',
              content: [{ type: 'text', text: 'write the digest' }]
            },
            {
              id: 'sevt_2',
              type: 'agent.tool_use',
              processed_at: '2026-10-23T01:07:53.815388Z',
              name: 'web_search',
              input: { query: 'inference-time scaling' }
            },
            {
              id: 'sevt_3',
              type: 'session.status_idle',
              processed_at: '2026-10-23T01:08:41.039687Z',
              stop_reason: { type: 'requires_action', event_ids: ['sevt_2'] }
            }
          ],
          next_page: 'page_2'
        })
        return
      }
      if (req.url?.includes('/v1/sessions/sesn_test_1/events') && req.method === 'POST') {
        send(200, { data: [{ id: 'sevt_new', type: 'user.message' }] })
        return
      }
      send(404, { type: 'error', error: { type: 'not_found_error', message: 'nope' } })
    })
  })
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      baseUrl = typeof address === 'object' && address ? `http://127.0.0.1:${address.port}` : ''
      resolve()
    })
  })
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

let tempHome = ''
const originalHome = process.env.HOME

beforeEach(() => {
  tempHome = mkdtempSync(join(tmpdir(), 'orca-claude-managed-'))
  process.env.HOME = tempHome
  delete process.env.ORCA_CLAUDE_MANAGED_API_KEY
  _resetCloudAgentCredentialCaches()
  requests.length = 0
  lastStatus = 200
  saveCloudAgentCredential('claude-managed', { accessToken: 'test-token', baseUrl })
})

afterEach(() => {
  rmSync(tempHome, { recursive: true, force: true })
  process.env.HOME = originalHome
  _resetCloudAgentCredentialCaches()
})

describe('claude managed adapter', () => {
  it('authenticates an OAuth token with a bearer header and an API key with x-api-key', async () => {
    const seen: string[][] = []
    await claudeManagedAdapter.connect({ accessToken: 'sk-ant-oat01-abc', baseUrl, at: 'probe' })
    seen.push(Object.keys(requestHeaders.at(-1) ?? {}))
    await claudeManagedAdapter.connect({ accessToken: 'sk-ant-api03-abc', baseUrl })
    seen.push(Object.keys(requestHeaders.at(-1) ?? {}))
    expect(seen[0]).toContain('authorization')
    expect(seen[0]).not.toContain('x-api-key')
    expect(seen[1]).toContain('x-api-key')
    expect(seen[1]).not.toContain('authorization')
  })

  it('lists sessions with the beta header and maps them to rows', async () => {
    const result = await claudeManagedAdapter.listSessions({ limit: 5 })
    expect(result).toMatchObject({ ok: true })
    const page = (result as { page: { sessions: { id: string; title: string; model: string }[] } })
      .page
    expect(page.sessions).toHaveLength(1)
    expect(page.sessions[0]).toMatchObject({
      id: 'sesn_test_1',
      title: 'Weekly digest',
      model: 'claude-opus-5-5'
    })
    expect(requests[0]?.url).toContain('/v1/sessions?limit=5&order=desc')
  })

  it('translates the vendor event vocabulary and keeps the page cursor', async () => {
    const result = await claudeManagedAdapter.listEvents({ sessionId: 'sesn_test_1' })
    const page = (result as { page: { events: { type: string }[]; nextPage: string | null } }).page
    expect(page.events.map((event) => event.type)).toEqual([
      'user.message',
      'agent.tool_use',
      'session.status_idle'
    ])
    expect(page.nextPage).toBe('page_2')
    // requires_action is what makes the composer wait for a human.
    expect(page.events[2]).toMatchObject({
      type: 'session.status_idle',
      stop_reason: { type: 'requires_action', event_ids: ['sevt_2'] }
    })
  })

  it('sends messages, approvals and interrupts as session events', async () => {
    expect(
      await claudeManagedAdapter.sessionAction({
        sessionId: 'sesn_test_1',
        action: { kind: 'send-message', text: 'hello' }
      })
    ).toEqual({ ok: true })
    expect(JSON.parse(requests.at(-1)?.body ?? '{}')).toEqual({
      events: [{ type: 'user.message', content: [{ type: 'text', text: 'hello' }] }]
    })

    expect(
      await claudeManagedAdapter.sessionAction({
        sessionId: 'sesn_test_1',
        action: { kind: 'confirm-tool', toolUseId: 'sevt_2', decision: 'deny' }
      })
    ).toEqual({ ok: true })
    expect(JSON.parse(requests.at(-1)?.body ?? '{}')).toEqual({
      events: [{ type: 'user.tool_confirmation', tool_use_id: 'sevt_2', result: 'deny' }]
    })

    expect(
      await claudeManagedAdapter.sessionAction({
        sessionId: 'sesn_test_1',
        action: { kind: 'cancel-turn' }
      })
    ).toEqual({ ok: true })
    expect(JSON.parse(requests.at(-1)?.body ?? '{}')).toEqual({
      events: [{ type: 'user.interrupt' }]
    })
  })

  it('refuses actions and features the platform does not expose', async () => {
    expect(await claudeManagedAdapter.createSession({ prompt: 'hi' })).toMatchObject({
      ok: false,
      reason: 'malformed'
    })
    expect(await claudeManagedAdapter.setSessionModel({ sessionId: 'sesn_test_1' })).toMatchObject({
      ok: false,
      reason: 'unsupported'
    })
    expect(
      await claudeManagedAdapter.sessionAction({
        sessionId: 'sesn_test_1',
        action: { kind: 'archive' }
      })
    ).toMatchObject({ ok: false, reason: 'unsupported' })
  })

  it('deletes a rejected credential instead of keeping a token the vendor refused', async () => {
    lastStatus = 401
    const result = await claudeManagedAdapter.connect({ accessToken: 'bad-token', baseUrl })
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('bad token') })
    expect(await claudeManagedAdapter.status()).toMatchObject({ configured: false, source: 'none' })
  })
})
