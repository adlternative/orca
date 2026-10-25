import { afterEach, describe, expect, it } from 'vitest'
import {
  getCloudAgentAdapter,
  listCloudAgentAdapters,
  registerCloudAgentAdapter,
  resetCloudAgentAdapters,
  type CloudAgentAdapter
} from './adapter'

function adapter(provider: string): CloudAgentAdapter {
  const none = async (): Promise<unknown> => ({ ok: true, provider })
  return {
    provider,
    status: none,
    connect: none,
    disconnect: async () => undefined,
    catalog: none,
    listSessions: none,
    getSession: none,
    listEvents: none,
    listModels: none,
    setSessionModel: none,
    createSession: none,
    sessionAction: none,
    listSchedules: none,
    listScheduleRuns: none,
    fileLink: none,
    streamSubscribe: async () => undefined,
    streamUnsubscribe: async () => undefined
  }
}

afterEach(resetCloudAgentAdapters)

describe('cloud agent adapter registry', () => {
  it('looks a provider up by id, so a second vendor is one map entry', () => {
    registerCloudAgentAdapter(adapter('qoder-cloud'))
    registerCloudAgentAdapter(adapter('other-cloud'))

    expect(listCloudAgentAdapters().map((entry) => entry.provider)).toEqual([
      'qoder-cloud',
      'other-cloud'
    ])
    expect(getCloudAgentAdapter('other-cloud')?.provider).toBe('other-cloud')
  })

  it('returns null for an unknown provider instead of guessing', () => {
    registerCloudAgentAdapter(adapter('qoder-cloud'))
    expect(getCloudAgentAdapter('nope')).toBeNull()
  })

  it('answers a provider-less request only when one adapter is registered', () => {
    registerCloudAgentAdapter(adapter('qoder-cloud'))
    expect(getCloudAgentAdapter(null)?.provider).toBe('qoder-cloud')

    registerCloudAgentAdapter(adapter('other-cloud'))
    expect(getCloudAgentAdapter(null)).toBeNull()
  })
})
