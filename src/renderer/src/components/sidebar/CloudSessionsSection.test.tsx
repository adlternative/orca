// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { CloudSessionsSection } from './CloudSessionsSection'
import type { CloudSessionsFeed } from './use-cloud-sessions-feed'
import type { CloudAgentSessionRow } from '../../../../shared/cloud-agent-provider'

const { useFeed, openUrl } = vi.hoisted(() => ({ useFeed: vi.fn(), openUrl: vi.fn() }))
vi.mock('./use-cloud-sessions-feed', () => ({ useCloudSessionsFeed: useFeed }))
vi.mock('@/components/cloud-sessions/use-cloud-session-search', () => ({
  useCloudSessionSearch: () => ({ inactive: true })
}))
vi.mock('@/components/cloud-sessions/NewCloudSessionDialog', () => ({
  NewCloudSessionDialog: () => null
}))
vi.mock('./CloudSessionRow', () => ({
  CloudSessionRow: ({ session }: { session: { title: string; provider: string } }) => (
    <li data-provider={session.provider}>{session.title}</li>
  )
}))

function row(provider: string, title: string): CloudAgentSessionRow {
  return {
    id: 'shared-id',
    provider,
    title,
    state: 'idle',
    vendorStatus: 'idle',
    archived: false,
    agentId: null,
    agentVersion: null,
    model: null,
    environmentId: null,
    createdAt: null,
    updatedAt: null,
    url: '',
    totalCredits: null
  }
}

function feed(overrides: Partial<CloudSessionsFeed> = {}): CloudSessionsFeed {
  return {
    configured: true,
    configuredProviders: ['qoder-cloud', 'claude-managed', 'openhands-cloud'],
    sessions: [row('qoder-cloud', 'Qoder task'), row('claude-managed', 'Claude task')],
    hasMore: false,
    failure: null,
    failureProvider: null,
    lastFetchedAt: Date.now(),
    refresh: vi.fn(),
    ...overrides
  }
}

function show(overrides: Partial<CloudSessionsFeed> = {}): void {
  useFeed.mockReturnValue(feed(overrides))
  render(
    <TooltipProvider>
      <CloudSessionsSection />
    </TooltipProvider>
  )
}

beforeEach(() => {
  vi.stubGlobal('api', { shell: { openUrl } })
  vi.clearAllMocks()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('cloud session provider navigation', () => {
  it('offers every connected console, including a provider with no sessions', async () => {
    show()
    fireEvent.keyDown(screen.getByRole('button', { name: 'More cloud session actions' }), {
      key: 'Enter'
    })
    for (const label of ['Qoder', 'Claude', 'OpenHands']) {
      expect(await screen.findByRole('menuitem', { name: `Open ${label} console` })).toBeTruthy()
    }
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open Claude console' }))
    expect(openUrl).toHaveBeenCalledWith('https://platform.claude.com')
  })

  it('selects one provider, shows its empty state and restores all rows', () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Show only Claude sessions' }))
    expect(screen.queryByText('Qoder task')).toBeNull()
    expect(screen.getByText('Claude task')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Show only OpenHands sessions' }))
    expect(screen.queryByText('Claude task')).toBeNull()
    expect(screen.getByText('No active cloud sessions.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'All' }))
    expect(screen.getByText('Qoder task')).toBeTruthy()
    expect(screen.getByText('Claude task')).toBeTruthy()
  })

  it('does not advertise unconfigured consoles just because they are registered', async () => {
    show({ configuredProviders: ['qoder-cloud'], sessions: [] })
    fireEvent.keyDown(screen.getByRole('button', { name: 'More cloud session actions' }), {
      key: 'Enter'
    })
    expect(await screen.findByRole('menuitem', { name: 'Open Qoder console' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'Open Claude console' })).toBeNull()
  })
})
