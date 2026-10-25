// @vitest-environment happy-dom
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useCloudSessionsFeed } from './use-cloud-sessions-feed'

const { apiFor } = vi.hoisted(() => ({ apiFor: vi.fn() }))
vi.mock('../../lib/cloud-agent-api', () => ({ cloudAgentApi: apiFor }))
afterEach(cleanup)

it('keeps configured providers discoverable even when their session list is empty', async () => {
  apiFor.mockImplementation((provider: string) => ({
    status: async () => ({ configured: provider !== 'openhands-cloud' }),
    listSessions: async () => ({ ok: true, page: { sessions: [], nextPage: null } })
  }))
  const { result } = renderHook(() => useCloudSessionsFeed(true))
  await waitFor(() => expect(result.current.lastFetchedAt).not.toBeNull())
  expect(result.current.configured).toBe(true)
  expect(result.current.configuredProviders).toEqual(['qoder-cloud', 'claude-managed'])
  expect(result.current.sessions).toEqual([])
})
