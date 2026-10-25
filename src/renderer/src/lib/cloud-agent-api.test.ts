import { afterEach, describe, expect, it, vi } from 'vitest'
import { cloudAgentApi, DEFAULT_CLOUD_AGENT_PROVIDER } from './cloud-agent-api'

const qoderCloud = { listEvents: vi.fn() }
const bound = vi.fn((provider: string) => ({ listEvents: vi.fn(), provider }))

afterEach(() => {
  bound.mockClear()
})

describe('cloudAgentApi', () => {
  it('binds the provider it is given, so a row from any vendor routes correctly', () => {
    vi.stubGlobal('window', { api: { cloudAgents: bound, qoderCloud } })

    cloudAgentApi('other-cloud')

    expect(bound).toHaveBeenCalledWith('other-cloud')
  })

  it('falls back to the configured provider when the caller has no row', () => {
    vi.stubGlobal('window', { api: { cloudAgents: bound, qoderCloud } })

    cloudAgentApi()
    cloudAgentApi(null)

    expect(bound.mock.calls).toEqual([
      [DEFAULT_CLOUD_AGENT_PROVIDER],
      [DEFAULT_CLOUD_AGENT_PROVIDER]
    ])
  })

  it('uses the vendor namespace on a host whose preload predates the generic bridge', () => {
    vi.stubGlobal('window', { api: { qoderCloud } })

    expect(cloudAgentApi('other-cloud')).toBe(qoderCloud)
  })
})
