import { describe, expect, it } from 'vitest'
import { parseCloudAgentModel, parseCloudAgentModelPage } from './models'

describe('parseCloudAgentModel', () => {
  it('keeps what a picker shows and orders efforts the way the vendor ranks them', () => {
    const model = parseCloudAgentModel({
      id: 'ultimate',
      display_name: 'Ultimate',
      price_factor: 2,
      is_vl: true,
      is_enabled: true,
      efforts: ['high', 'none', 'max', 'low'],
      default_effort: 'high',
      available_context_windows: [400000, 200000, 200000]
    })
    expect(model).toEqual({
      id: 'ultimate',
      displayName: 'Ultimate',
      priceFactor: 2,
      vision: true,
      efforts: ['none', 'low', 'high', 'max'],
      defaultEffort: 'high',
      contextWindows: [200000, 400000]
    })
  })

  it('falls back to the id when the vendor sends no display name', () => {
    expect(parseCloudAgentModel({ id: 'auto' })?.displayName).toBe('auto')
  })

  it('drops entries without an id', () => {
    expect(parseCloudAgentModel({ display_name: 'Nameless' })).toBeNull()
    expect(parseCloudAgentModel(null)).toBeNull()
  })
})

describe('parseCloudAgentModelPage', () => {
  it('omits models the account cannot run', () => {
    const models = parseCloudAgentModelPage({
      data: [
        { id: 'auto', is_enabled: true },
        { id: 'legacy', is_enabled: false },
        { id: 'ultimate' }
      ]
    })
    expect(models?.map((model) => model.id)).toEqual(['auto', 'ultimate'])
  })

  it('reports an unreadable page instead of an empty list', () => {
    expect(parseCloudAgentModelPage({ models: [] })).toBeNull()
    expect(parseCloudAgentModelPage('nope')).toBeNull()
  })
})
