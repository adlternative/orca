import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'

/**
 * The adapter is exercised against a server that answers like app.all-hands.dev's V1 API, so the
 * translation (rows, events, action mapping) is covered without an account or an API key.
 */
const CONVERSATIONS = [
  {
    app_conversation_id: 'conv_1',
    title: 'Fix the flaky deploy script',
    execution_status: 'running',
    sandbox_status: 'RUNNING',
    created_at: '2026-01-02T03:04:05Z',
    updated_at: '2026-01-02T04:05:06Z',
    selected_repository: 'acme/deploy'
  },
  {
    app_conversation_id: 'conv_2',
    title: 'Paused waiting for a human',
    execution_status: 'paused',
    sandbox_status: 'PAUSED',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:10:00Z'
  }
]

const EVENTS = [
  {
    id: 'e1',
    kind: 'MessageEvent',
    source: 'user',
    message: 'please fix it',
    timestamp: '2026-01-02T03:04:05Z'
  },
  {
    id: 'e2',
    kind: 'ActionEvent',
    source: 'agent',
    action: { kind: 'BashAction', command: 'npm test' },
    timestamp: '2026-01-02T03:04:06Z'
  },
  {
    id: 'e3',
    kind: 'ObservationEvent',
    source: 'agent',
    observation: { kind: 'BashObservation', content: 'all green' },
    action_id: 'e2',
    timestamp: '2026-01-02T03:04:07Z'
  },
  {
    id: 'e4',
    kind: 'MessageEvent',
    source: 'agent',
    message: { content: [{ type: 'text', text: 'done' }] },
    timestamp: '2026-01-02T03:04:08Z'
  }
]

let server: Server
let sent: unknown[] = []

async function start(): Promise<string> {
  server = createServer((request, response) => {
    const url = request.url ?? ''
    const send = (status: number, body: unknown): void => {
      response.writeHead(status, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify(body))
    }
    if (request.method === 'POST') {
      let raw = ''
      request.on('data', (chunk) => {
        raw += String(chunk)
      })
      request.on('end', () => {
        sent.push({ url, body: JSON.parse(raw || '{}') })
        send(200, { app_conversation_id: 'conv_new' })
      })
      return
    }
    if (url.startsWith('/api/v1/app-conversations/search')) {
      send(200, { items: CONVERSATIONS })
      return
    }
    if (url.startsWith('/api/v1/app-conversations?ids=conv_2')) {
      send(200, { items: [CONVERSATIONS[1]] })
      return
    }
    if (url.startsWith('/api/v1/conversation/conv_1/events/search')) {
      send(200, { items: EVENTS, next_page_id: 'p2' })
      return
    }
    send(404, { detail: 'not found' })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return `http://127.0.0.1:${port}`
}

const { openhandsCloudAdapter } = await import('./openhands-adapter')

// Why a temp HOME: the real ~/.orca may hold a credential only this OS can decrypt, and reading it
// here would make these cases depend on whoever ran the app on this machine last.
let tempHome = ''
const originalHome = process.env.HOME

beforeEach(async () => {
  tempHome = mkdtempSync(join(tmpdir(), 'orca-openhands-test-'))
  process.env.HOME = tempHome
  process.env.ORCA_OPENHANDS_API_KEY = 'test-key'
  process.env.ORCA_OPENHANDS_BASE_URL = await start()
  sent = []
})

afterEach(async () => {
  rmSync(tempHome, { recursive: true, force: true })
  process.env.HOME = originalHome
  delete process.env.ORCA_OPENHANDS_API_KEY
  delete process.env.ORCA_OPENHANDS_BASE_URL
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

describe('openhands cloud adapter', () => {
  it('maps the vendor execution axis onto the shared session states', async () => {
    const reply = (await openhandsCloudAdapter.listSessions({ limit: 5 })) as {
      ok: true
      page: { sessions: { id: string; state: string; provider: string; url: string }[] }
    }

    expect(reply.ok).toBe(true)
    expect(reply.page.sessions.map((row) => [row.id, row.state])).toEqual([
      ['conv_1', 'working'],
      ['conv_2', 'blocked']
    ])
    expect(reply.page.sessions[0].provider).toBe('openhands-cloud')
    expect(reply.page.sessions[0].url).toContain('/conversations/conv_1')
  })

  it('translates vendor events into the canonical schema the renderer decodes', async () => {
    const reply = (await openhandsCloudAdapter.listEvents({ sessionId: 'conv_1' })) as {
      ok: true
      page: { events: { type: string }[]; nextPage: string | null }
    }

    expect(reply.ok).toBe(true)
    expect(reply.page.events.map((event) => event.type)).toEqual([
      'user.message',
      'agent.tool_use',
      'agent.tool_result',
      'agent.message'
    ])
    expect(reply.page.nextPage).toBe('p2')
  })

  it('sends a follow-up message to the documented endpoint', async () => {
    await openhandsCloudAdapter.sessionAction({
      sessionId: 'conv_1',
      action: { kind: 'send-message', text: 'try again' }
    })

    expect(sent).toEqual([
      { url: '/api/v1/app-conversations/conv_1/send-message', body: { message: 'try again' } }
    ])
  })

  it('refuses the actions it declares as unsupported instead of pretending', async () => {
    const reply = (await openhandsCloudAdapter.sessionAction({
      sessionId: 'conv_1',
      action: { kind: 'archive' }
    })) as { ok: false; reason: string }

    expect(reply.ok).toBe(false)
    expect(reply.reason).toBe('unsupported')
    expect(sent).toEqual([])
  })

  it('creates a conversation from a prompt and a repository url', async () => {
    const catalogue = (await import('../../shared/openhands-cloud')).OPENHANDS_CLOUD_PROVIDER
    expect(catalogue.capabilities.schedules).toBe(false)

    const reply = (await openhandsCloudAdapter.createSession({
      prompt: 'fix the build',
      repository: { url: 'https://github.com/acme/deploy.git' }
    })) as { ok: true; sessionId: string }

    expect(reply).toEqual({ ok: true, sessionId: 'conv_new', promptSent: true })
    expect(sent[0]).toEqual({
      url: '/api/v1/app-conversations',
      body: {
        initial_message: { content: [{ type: 'text', text: 'fix the build' }] },
        selected_repository: 'acme/deploy',
        git_provider: 'github'
      }
    })
  })

  it('reports a missing key as not-configured rather than as a failed request', async () => {
    delete process.env.ORCA_OPENHANDS_API_KEY
    const status = (await openhandsCloudAdapter.status()) as { configured: boolean }
    expect(status.configured).toBe(false)
  })
})
