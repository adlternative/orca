import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const handlers = new Map<string, (event: unknown, payload: unknown) => Promise<unknown>>()
const listSessions = vi.fn(async (args: unknown) => ({ ok: true, args }))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, payload: unknown) => Promise<unknown>) => {
      handlers.set(channel, handler)
    }
  }
}))

vi.mock('../cloud-agents/qoder-cloud-adapter', () => ({
  qoderCloudAdapter: {
    provider: 'qoder-cloud',
    status: async () => ({ ok: true }),
    connect: async () => ({ ok: true }),
    disconnect: async () => undefined,
    catalog: async () => ({ ok: true }),
    listSessions,
    getSession: async () => ({ ok: true }),
    listEvents: async () => ({ ok: true }),
    listModels: async () => ({ ok: true }),
    setSessionModel: async () => ({ ok: true }),
    createSession: async () => ({ ok: true }),
    sessionAction: async () => ({ ok: true }),
    listSchedules: async () => ({ ok: true }),
    listScheduleRuns: async () => ({ ok: true }),
    fileLink: async () => ({ ok: true }),
    streamSubscribe: async () => undefined,
    streamUnsubscribe: async () => undefined
  }
}))

const { registerCloudAgentHandlers } = await import('./cloud-agents')
const { resetCloudAgentAdapters } = await import('../cloud-agents/adapter')

afterEach(() => {
  handlers.clear()
  resetCloudAgentAdapters()
  listSessions.mockClear()
})

beforeEach(() => {
  registerCloudAgentHandlers()
})

describe('generic cloud agent ipc', () => {
  it('exposes one channel per operation', () => {
    expect(handlers.has('cloudAgent:listSessions')).toBe(true)
    expect(handlers.has('cloudAgent:setSessionModel')).toBe(true)
    expect(handlers.has('cloudAgent:streamUnsubscribe')).toBe(true)
  })

  it('relays the payload to the adapter the caller named', async () => {
    const reply = await handlers.get('cloudAgent:listSessions')?.(null, {
      provider: 'qoder-cloud',
      args: { limit: 5 }
    })

    expect(reply).toEqual({ ok: true, args: { limit: 5 } })
    expect(listSessions).toHaveBeenCalledWith({ limit: 5 })
  })

  it('refuses a payload that names no provider once two providers are registered', async () => {
    const reply = await handlers.get('cloudAgent:listSessions')?.(null, { limit: 2 })

    expect(reply).toEqual({
      ok: false,
      reason: 'malformed',
      message: 'Unknown cloud agent provider.'
    })
    expect(listSessions).not.toHaveBeenCalled()
  })

  it('refuses an unknown provider instead of falling back to the first one', async () => {
    const reply = await handlers.get('cloudAgent:listSessions')?.(null, {
      provider: 'nope',
      args: {}
    })

    expect(reply).toEqual({
      ok: false,
      reason: 'malformed',
      message: 'Unknown cloud agent provider.'
    })
    expect(listSessions).not.toHaveBeenCalled()
  })
})
