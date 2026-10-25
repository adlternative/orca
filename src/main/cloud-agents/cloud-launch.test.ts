import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadClaudeLaunchCatalog, createClaudeSession } from './claude-managed-launch'
import { createOpenHandsSession } from './openhands-launch'
import type { request as claudeRequest } from './claude-managed-adapter'

const input = {
  templateId: 'agent_1',
  templateVersion: 3,
  environmentId: 'env_1',
  prompt: 'fix the build',
  title: 'Build fix'
}
const reply = (body: unknown) => ({ ok: true as const, body })
const mockRequest = () => vi.fn<typeof claudeRequest>()
afterEach(() => vi.useRealTimers())

describe('provider launch contracts', () => {
  it('pages Claude catalogs and excludes archived and self-hosted launch choices', async () => {
    const request = mockRequest().mockImplementation(async (path) => {
      if (path.includes('/environments')) {
        return reply({
          data: [
            {
              id: 'env_1',
              name: 'Cloud',
              config: {
                type: 'cloud',
                networking: { type: 'limited', allowed_hosts: ['github.com'] }
              }
            },
            { id: 'env_local', config: { type: 'self_hosted' } },
            { id: 'env_old', archived_at: '2026-01-01' }
          ]
        })
      }
      return path.includes('&page=next')
        ? reply({ data: [{ id: 'agent_2', version: 4 }], next_page: null })
        : reply({
            data: [
              { id: 'agent_1', name: 'Builder', version: 3, model: { id: 'opus' } },
              { id: 'old', archived_at: '2026-01-01' }
            ],
            next_page: 'next'
          })
    })
    const result = await loadClaudeLaunchCatalog(request)
    expect(result).toMatchObject({
      ok: true,
      catalog: {
        provider: 'claude-managed',
        templates: [
          { id: 'agent_1', version: 3, model: 'opus' },
          { id: 'agent_2', version: 4 }
        ],
        environments: [{ id: 'env_1', allowedHosts: ['github.com'] }],
        memoryStores: [],
        vaults: []
      }
    })
    expect(request).toHaveBeenCalledWith('/v1/agents?beta=true&limit=100&page=next')
  })

  it('rejects repeated catalog cursors rather than looping forever', async () => {
    const request = mockRequest().mockResolvedValue(reply({ data: [], next_page: 'repeat' }))
    expect(await loadClaudeLaunchCatalog(request)).toMatchObject({ ok: false, reason: 'malformed' })
    expect(request).toHaveBeenCalledTimes(4)
  })

  it('creates Claude tasks atomically with initial events and optional repository auth', async () => {
    const request = mockRequest().mockResolvedValue(reply({ id: 'sesn_new' }))
    expect(
      await createClaudeSession(request, {
        ...input,
        repository: {
          url: 'https://github.com/acme/app',
          authorizationToken: 'github_pat_test',
          mountPath: '/workspace'
        }
      })
    ).toEqual({ ok: true, sessionId: 'sesn_new', promptSent: true })
    expect(request).toHaveBeenCalledOnce()
    expect(request).toHaveBeenCalledWith('/v1/sessions?beta=true', {
      method: 'POST',
      body: {
        agent: { type: 'agent', id: 'agent_1', version: 3 },
        environment_id: 'env_1',
        title: 'Build fix',
        initial_events: [
          { type: 'user.message', content: [{ type: 'text', text: 'fix the build' }] }
        ],
        resources: [
          {
            type: 'github_repository',
            url: 'https://github.com/acme/app',
            authorization_token: 'github_pat_test',
            mount_path: '/workspace'
          }
        ]
      }
    })
  })

  it('validates before sending and flags missing creation ids as uncertain', async () => {
    const request = mockRequest().mockResolvedValue(reply({}))
    expect(await createClaudeSession(request, { prompt: 'hello' })).toMatchObject({
      ok: false,
      reason: 'malformed'
    })
    expect(await createClaudeSession(request, { ...input, provider: 'qoder-cloud' })).toMatchObject(
      { ok: false, reason: 'malformed' }
    )
    expect(await createClaudeSession(request, { ...input, vaultIds: ['secret'] })).toMatchObject({
      ok: false,
      reason: 'unsupported'
    })
    expect(request).not.toHaveBeenCalled()
    expect(await createClaudeSession(request, input)).toMatchObject({
      ok: false,
      reason: 'unreachable'
    })
    expect(request).toHaveBeenCalledOnce()
  })

  it('waits for OpenHands READY and uses conversation id, never start-task id', async () => {
    vi.useFakeTimers()
    const request = mockRequest()
      .mockResolvedValueOnce(reply({ id: 'start_1', status: 'PENDING' }))
      .mockResolvedValueOnce(
        reply([{ id: 'start_1', status: 'READY', app_conversation_id: 'conv_new' }])
      )
    const result = createOpenHandsSession(request, {
      prompt: 'fix it',
      repository: { url: 'https://github.com/acme/app.git' }
    })
    await vi.advanceTimersByTimeAsync(1_000)
    expect(await result).toEqual({ ok: true, sessionId: 'conv_new', promptSent: true })
    expect(request).toHaveBeenCalledWith('/api/v1/app-conversations', {
      method: 'POST',
      body: {
        initial_message: { content: [{ type: 'text', text: 'fix it' }] },
        selected_repository: 'acme/app',
        git_provider: 'github'
      }
    })
    expect(request).toHaveBeenLastCalledWith('/api/v1/app-conversations/start-tasks?ids=start_1')
  })

  it('does not repost failed OpenHands starts and rejects non-GitHub repository input', async () => {
    const request = mockRequest().mockResolvedValue(reply({ id: 'start_1', status: 'ERROR' }))
    expect(await createOpenHandsSession(request, { prompt: 'fix it' })).toMatchObject({
      ok: false,
      reason: 'unreachable'
    })
    expect(request).toHaveBeenCalledOnce()
    request.mockClear()
    for (const url of [
      'https://gitlab.com/acme/app',
      'https://github.com/acme/app/tree/main',
      'https://user@github.com/acme/app'
    ]) {
      expect(
        await createOpenHandsSession(request, { prompt: 'fix it', repository: { url } })
      ).toMatchObject({ ok: false, reason: 'malformed' })
    }
    expect(request).not.toHaveBeenCalled()
  })
})
