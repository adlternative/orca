// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CloudAgentSessionRow } from '../../../../shared/cloud-agent-provider'
import { useCloudSessionDetail } from './use-cloud-session-detail'
import {
  cloudSessionTitle,
  rememberCloudSessionTitle,
  rememberCloudSessionRow,
  useLatestCloudSessions
} from '../sidebar/use-cloud-sessions-feed'

const getSession = vi.hoisted(() => vi.fn())
vi.mock('../../lib/cloud-agent-api', () => ({
  cloudAgentApi: (provider: string) => ({ getSession: (id: string) => getSession(provider, id) })
}))
let root: Root
let container: HTMLDivElement
let detail: CloudAgentSessionRow | null
let rows: readonly CloudAgentSessionRow[]
function Harness({ provider }: { provider: string }) {
  detail = useCloudSessionDetail('same-id', true, provider)
  rows = useLatestCloudSessions()
  return null
}
beforeEach(() => {
  vi.clearAllMocks()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('cloud session provider isolation', () => {
  it('does not retain another provider’s detail when the new lookup fails', async () => {
    getSession.mockImplementation(async (provider) =>
      provider === 'qoder-cloud'
        ? { ok: true, session: { id: 'same-id', provider, title: 'Qoder title' } }
        : { ok: false, reason: 'not-found' }
    )
    await act(async () => root.render(<Harness provider="qoder-cloud" />))
    expect(detail?.title).toBe('Qoder title')
    await act(async () => root.render(<Harness provider="claude-managed" />))
    expect(detail).toBeNull()
  })

  it('keeps provisional titles and remembered rows separate for identical vendor IDs', async () => {
    getSession.mockResolvedValue({ ok: false, reason: 'not-found' })
    await act(async () => root.render(<Harness provider="qoder-cloud" />))
    act(() => {
      for (const provider of ['qoder-cloud', 'claude-managed']) {
        rememberCloudSessionTitle('collision', provider, provider)
        rememberCloudSessionRow({ id: 'collision', provider, title: null } as CloudAgentSessionRow)
      }
    })
    expect(cloudSessionTitle('collision', 'qoder-cloud')).toBe('qoder-cloud')
    expect(cloudSessionTitle('collision', 'claude-managed')).toBe('claude-managed')
    expect(rows.filter((row) => row.id === 'collision')).toHaveLength(2)
    // Another vendor naming its row must not evict the first vendor's provisional title.
    act(() =>
      rememberCloudSessionRow({
        id: 'other',
        provider: 'claude-managed',
        title: 'Named'
      } as CloudAgentSessionRow)
    )
    expect(cloudSessionTitle('collision', 'qoder-cloud')).toBe('qoder-cloud')
  })
})
