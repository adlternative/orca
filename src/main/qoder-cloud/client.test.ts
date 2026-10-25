import { describe, expect, it } from 'vitest'
import { parseQoderCloudSession, parseQoderCloudSessionPage } from './client'

const VENDOR_SESSION = {
  id: 'sess_fixture000001',
  type: 'session',
  agent: { id: 'agent_fixture000001', type: 'agent', version: 2 },
  environment_id: 'env_fixture000001',
  title: 'API-doc-verification-session',
  status: 'idle',
  archived_at: null,
  created_at: '2026-05-18T15:26:15.747298Z',
  updated_at: '2026-05-18T15:26:15.747298Z',
  usage: { model_credits: 1, sandbox_runtime_credits: 0.25, total_credits: 1.25 }
}

describe('parseQoderCloudSession', () => {
  it('maps a vendor session to the shared row', () => {
    expect(parseQoderCloudSession(VENDOR_SESSION)).toEqual({
      provider: 'qoder-cloud',
      id: VENDOR_SESSION.id,
      title: VENDOR_SESSION.title,
      vendorStatus: 'idle',
      state: 'idle',
      archived: false,
      agentId: VENDOR_SESSION.agent.id,
      agentVersion: 2,
      model: null,
      environmentId: VENDOR_SESSION.environment_id,
      createdAt: VENDOR_SESSION.created_at,
      updatedAt: VENDOR_SESSION.updated_at,
      url: `https://qoder.com/cloud/sessions/${VENDOR_SESSION.id}`,
      totalCredits: 1.25
    })
  })

  it.each([
    ['running', null, 'working'],
    // Why: rescheduling is the vendor retrying inside the active turn, so the agent is still working.
    ['rescheduling', null, 'working'],
    ['idle', null, 'idle'],
    ['terminated', null, 'ended'],
    ['idle', '2026-05-18T16:00:00Z', 'ended']
  ] as const)('status %s archived_at %s reads as %s', (status, archivedAt, state) => {
    const row = parseQoderCloudSession({ ...VENDOR_SESSION, status, archived_at: archivedAt })
    expect(row?.state).toBe(state)
    expect(row?.archived).toBe(archivedAt !== null)
  })

  it('refuses a session with an unknown status rather than guessing', () => {
    expect(parseQoderCloudSession({ ...VENDOR_SESSION, status: 'canceling' })).toBeNull()
    expect(parseQoderCloudSession({ ...VENDOR_SESSION, id: '' })).toBeNull()
    expect(parseQoderCloudSession('sess_x')).toBeNull()
  })

  it('points CN sessions at the CN console', () => {
    const row = parseQoderCloudSession(VENDOR_SESSION, 'https://api.qoder.com.cn/api/v1/cloud')
    expect(row?.url).toBe(`https://qoder.com.cn/cloud/sessions/${VENDOR_SESSION.id}`)
  })

  it('tolerates missing optional fields', () => {
    const row = parseQoderCloudSession({ id: 'sess_1', status: 'running' })
    expect(row).toMatchObject({
      id: 'sess_1',
      title: null,
      agentId: null,
      agentVersion: null,
      environmentId: null,
      totalCredits: null,
      state: 'working'
    })
  })
})

describe('session model', () => {
  it('reads the model id whether the vendor sends a bare id or a tuning object', () => {
    const bare = parseQoderCloudSession({
      ...VENDOR_SESSION,
      agent: { ...VENDOR_SESSION.agent, model: 'ultimate' }
    })
    const tuned = parseQoderCloudSession({
      ...VENDOR_SESSION,
      agent: { ...VENDOR_SESSION.agent, model: { id: 'auto', effort: 'high' } }
    })
    expect(bare?.model).toBe('ultimate')
    expect(tuned?.model).toBe('auto')
  })
})

describe('parseQoderCloudSessionPage', () => {
  it('drops malformed rows without dropping the page', () => {
    const page = parseQoderCloudSessionPage({
      data: [VENDOR_SESSION, { id: 'sess_bad', status: 'nope' }, 42],
      next_page: 'cursor_2',
      has_more: true
    })
    expect(page?.sessions.map((session) => session.id)).toEqual([VENDOR_SESSION.id])
    expect(page?.nextPage).toBe('cursor_2')
  })

  it('refuses a body without a data array', () => {
    expect(parseQoderCloudSessionPage({ sessions: [] })).toBeNull()
    expect(parseQoderCloudSessionPage(null)).toBeNull()
  })

  it('normalizes a null cursor', () => {
    expect(parseQoderCloudSessionPage({ data: [], next_page: null })?.nextPage).toBeNull()
  })
})
