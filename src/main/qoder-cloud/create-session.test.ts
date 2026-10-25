import { describe, expect, it } from 'vitest'
import { validateNewCloudSession, type NewCloudSessionInput } from '../../shared/cloud-agent-create'
import { buildQoderCreateBody, firstTurnEvent } from './create-session'

const base: NewCloudSessionInput = {
  provider: 'qoder-cloud',
  templateId: 'agent_1',
  templateVersion: 4,
  environmentId: 'env_1',
  title: 'Duck in 12 universes',
  prompt: 'render the duck in 12 styles',
  outcome: null,
  repository: null,
  memoryStores: [],
  vaultIds: []
}

describe('buildQoderCreateBody', () => {
  it('pins the agent version and marks the session as Orca-created', () => {
    expect(buildQoderCreateBody(base)).toEqual({
      agent: { id: 'agent_1', type: 'agent', version: 4 },
      environment_id: 'env_1',
      title: 'Duck in 12 universes',
      metadata: { source: 'orca', provider: 'qoder-cloud' },
      resources: []
    })
  })

  it('maps a repository to a github_repository resource, omitting an empty mount path', () => {
    const body = buildQoderCreateBody({
      ...base,
      repository: { url: 'https://github.com/o/r', mountPath: '', authorizationToken: 'ghp_x' }
    })
    expect(body.resources).toEqual([
      { type: 'github_repository', url: 'https://github.com/o/r', authorization_token: 'ghp_x' }
    ])
  })

  it('carries memory access and vaults', () => {
    const body = buildQoderCreateBody({
      ...base,
      memoryStores: [
        { id: 'memstore_1', access: 'read_write', instructions: 'use project context' }
      ],
      vaultIds: ['vault_1']
    })
    expect(body.resources).toEqual([
      {
        type: 'memory_store',
        memory_store_id: 'memstore_1',
        access: 'read_write',
        instructions: 'use project context'
      }
    ])
    expect(body.vault_ids).toEqual(['vault_1'])
  })
})

describe('firstTurnEvent', () => {
  it('sends a plain prompt as a user.message', () => {
    expect(firstTurnEvent(base)).toEqual([
      { type: 'user.message', content: [{ type: 'text', text: 'render the duck in 12 styles' }] }
    ])
  })

  it('sends an acceptance goal as define_outcome instead of a second turn', () => {
    // Why: two events would start two turns, and the vendor answers the second with 409.
    expect(
      firstTurnEvent({ ...base, outcome: { rubric: '- 12 styles', maxIterations: 2 } })
    ).toEqual([
      {
        type: 'user.define_outcome',
        description: 'render the duck in 12 styles',
        rubric: { type: 'text', content: '- 12 styles' },
        max_iterations: 2
      }
    ])
  })

  it('sends nothing when there is no prompt and no outcome', () => {
    expect(firstTurnEvent({ ...base, prompt: '' })).toEqual([])
  })
})

describe('validateNewCloudSession', () => {
  it('accepts the happy path', () => {
    expect(validateNewCloudSession(base)).toBeNull()
  })

  it('requires a prompt or criteria, and a rubric when grading', () => {
    expect(validateNewCloudSession({ ...base, prompt: '' })).toMatch(/prompt or acceptance/)
    expect(
      validateNewCloudSession({ ...base, prompt: '', outcome: { rubric: ' ', maxIterations: 3 } })
    ).toMatch(/rubric/)
  })

  it('bounds the iteration count to the vendor range', () => {
    expect(
      validateNewCloudSession({ ...base, outcome: { rubric: 'x', maxIterations: 21 } })
    ).toMatch(/1 and 20/)
  })

  it('refuses an http repository, a missing token, and a non-GitHub token', () => {
    const repo = { url: '', mountPath: '', authorizationToken: '' }
    expect(
      validateNewCloudSession({
        ...base,
        repository: { ...repo, url: 'http://x/y', authorizationToken: 'ghp_a' }
      })
    ).toMatch(/https/)
    expect(
      validateNewCloudSession({ ...base, repository: { ...repo, url: 'https://x/y' } })
    ).toMatch(/needs a token/)
    expect(
      validateNewCloudSession({
        ...base,
        repository: { ...repo, url: 'https://x/y', authorizationToken: 'hunter2' }
      })
    ).toMatch(/GitHub token/)
    expect(
      validateNewCloudSession({
        ...base,
        repository: { ...repo, url: 'https://x/y', authorizationToken: 'github_pat_abc' }
      })
    ).toBeNull()
  })
})
