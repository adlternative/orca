// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CloudAgentCatalog } from '../../../../shared/cloud-agent-create'

const mocks = vi.hoisted(() => ({
  status: vi.fn(),
  catalog: vi.fn(),
  create: vi.fn(),
  open: vi.fn(),
  refresh: vi.fn(),
  setState: vi.fn(),
  state: { projects: [], repos: [] }
}))
vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: (state: typeof mocks.state) => unknown) => selector(mocks.state),
    { getState: () => ({ setOpenCloudSessionId: mocks.open }), setState: mocks.setState }
  )
}))
vi.mock('@/lib/cloud-agent-api', () => ({
  cloudAgentApi: (provider: string) => ({
    status: () => mocks.status(provider),
    catalog: () => mocks.catalog(provider),
    createSession: (input: unknown) => mocks.create(provider, input)
  })
}))
vi.mock('../sidebar/use-cloud-sessions-feed', () => ({
  requestCloudSessionsRefresh: mocks.refresh,
  rememberCloudSessionTitle: vi.fn()
}))
import { useCloudTaskLaunch } from './use-cloud-task-launch'
import {
  cloudSessionKey,
  cloudSessionDrafts,
  rememberLaunchChoice,
  rememberedLaunchChoice,
  associateCloudSession,
  useCloudSessionProjects
} from './cloud-session-context'

function catalog(provider: string): CloudAgentCatalog {
  return {
    provider,
    templates: [{ id: 'agent_1', version: 3, name: 'Builder', model: null, description: null }],
    environments: [
      {
        id: 'env_1',
        name: 'Cloud',
        description: null,
        networkPolicy: null,
        allowedHosts: [],
        allowPackageManagers: false
      }
    ],
    memoryStores: [],
    vaults: []
  }
}
let container: HTMLDivElement
let root: Root
let launch: ReturnType<typeof useCloudTaskLaunch>
let projects: Readonly<Record<string, string>>
const created = vi.fn()
function Harness({ open = true }: { open?: boolean }) {
  launch = useCloudTaskLaunch(open, null, created)
  projects = useCloudSessionProjects()
  return null
}
async function flush() {
  await act(async () => {
    await Promise.resolve()
  })
}
beforeEach(async () => {
  vi.clearAllMocks()
  localStorage.clear()
  mocks.status.mockResolvedValue({ configured: true })
  mocks.catalog.mockImplementation(async (provider) => ({ ok: true, catalog: catalog(provider) }))
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root.render(<Harness />))
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('cloud task launch', () => {
  it('uses provider/project-scoped preferences without persisting secrets', () => {
    act(() => {
      associateCloudSession('qoder-cloud', 'same-id', 'project-q')
      associateCloudSession('claude-managed', 'same-id', 'project-c')
      rememberLaunchChoice('claude-managed', 'project-c', {
        templateId: 'chosen',
        environmentId: 'chosen-env',
        authorizationToken: 'secret'
      } as Parameters<typeof rememberLaunchChoice>[2])
    })
    expect(projects[cloudSessionKey('qoder-cloud', 'same-id')]).toBe('project-q')
    expect(projects[cloudSessionKey('claude-managed', 'same-id')]).toBe('project-c')
    expect(rememberedLaunchChoice('claude-managed', 'project-c')).toEqual({
      templateId: 'chosen',
      environmentId: 'chosen-env'
    })
    expect(rememberedLaunchChoice('qoder-cloud', 'project-c')).toBeUndefined()
    expect(localStorage.getItem('orca.cloudSessions.context.v1')).not.toContain('secret')
  })

  it('retains the prompt but clears vendor-specific secrets and resources on provider switch', async () => {
    act(() => {
      launch.form.setField('prompt', 'fix the build')
      launch.form.setRepository({
        url: 'https://github.com/acme/app',
        mountPath: '',
        authorizationToken: 'github_pat_secret'
      })
      launch.form.setOutcome({ rubric: 'all tests pass', maxIterations: 3 })
      launch.form.toggleVault('vault_1')
    })
    await act(async () => launch.setProvider('claude-managed'))
    expect(launch.form.input).toMatchObject({
      provider: 'claude-managed',
      prompt: 'fix the build',
      repository: null,
      outcome: null,
      vaultIds: [],
      templateVersion: 3
    })
    expect(launch.canSubmit).toBe(true)
  })

  it('creates once and opens the created task with its provider and project association', async () => {
    let resolve!: (value: unknown) => void
    mocks.create.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done
        })
    )
    await act(async () => launch.setProjectId('project-new'))
    act(() => launch.form.setField('prompt', 'fix it'))
    act(() => {
      void launch.submit()
      void launch.submit()
    })
    expect(mocks.create).toHaveBeenCalledOnce()
    await act(async () => {
      resolve({ ok: true, sessionId: 'created-id', promptSent: true })
    })
    expect(mocks.open).toHaveBeenCalledWith('created-id', launch.provider)
    expect(projects[cloudSessionKey(launch.provider, 'created-id')]).toBe('project-new')
    expect(created).toHaveBeenCalledOnce()
  })

  it('blocks blind retries after ambiguous transport failure, even after catalog retry', async () => {
    mocks.create.mockResolvedValue({ ok: false, reason: 'unreachable', message: 'vendor error' })
    act(() => launch.form.setField('prompt', 'fix it'))
    await act(async () => launch.submit())
    expect(launch.canSubmit).toBe(false)
    expect(launch.submitError).not.toContain('vendor error')
    await act(async () => launch.retry())
    expect(launch.submitError).toContain('task may already exist')
    await act(async () => launch.submit())
    expect(mocks.create).toHaveBeenCalledOnce()
    expect(mocks.open).not.toHaveBeenCalled()
    expect(mocks.refresh).toHaveBeenCalled()
  })

  it('opens a created task with an explicit warning when its first turn failed', async () => {
    mocks.create.mockResolvedValue({
      ok: true,
      sessionId: 'partial',
      promptSent: false,
      promptError: 'raw vendor error'
    })
    act(() => launch.form.setField('prompt', 'hello'))
    await act(async () => launch.submit())
    expect(mocks.open).toHaveBeenCalledWith('partial', launch.provider)
    expect(mocks.setState).toHaveBeenCalledWith({
      cloudSessionLaunchWarning: expect.stringContaining('first message')
    })
    expect(created).toHaveBeenCalledOnce()
    expect(cloudSessionDrafts.get(cloudSessionKey(launch.provider, 'partial'))).toBe('hello')
  })

  it('records a late creation without stealing navigation after the launch surface closes', async () => {
    let resolve!: (value: unknown) => void
    mocks.create.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done
        })
    )
    act(() => launch.form.setField('prompt', 'finish later'))
    act(() => {
      void launch.submit()
    })
    await act(async () => root.render(<Harness open={false} />))
    await act(async () => resolve({ ok: true, sessionId: 'late', promptSent: false }))
    expect(mocks.open).not.toHaveBeenCalled()
    expect(created).not.toHaveBeenCalled()
    expect(mocks.refresh).toHaveBeenCalled()
    expect(cloudSessionDrafts.get(cloudSessionKey(launch.provider, 'late'))).toBe('finish later')
  })

  it('ignores stale catalogs after a provider switch and keeps creation disabled while loading', async () => {
    let resolve!: (value: unknown) => void
    mocks.catalog.mockImplementation((provider) =>
      provider === 'claude-managed'
        ? new Promise((done) => {
            resolve = done
          })
        : Promise.resolve({ ok: true, catalog: catalog(provider) })
    )
    await act(async () => launch.setProvider('claude-managed'))
    expect(launch.catalog).toBeNull()
    expect(launch.canSubmit).toBe(false)
    await act(async () => launch.setProvider('openhands-cloud'))
    await act(async () => resolve({ ok: true, catalog: catalog('claude-managed') }))
    await flush()
    expect(launch.provider).toBe('openhands-cloud')
    expect(launch.catalog?.provider).toBe('openhands-cloud')
  })
})
