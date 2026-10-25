import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseQoderCloudDeployment, parseQoderCloudDeploymentRun } from './deployments'

const FIXTURES = join(__dirname, '..', '..', 'shared', '__fixtures__', 'qoder-cloud')
const CONSOLE = 'https://qoder.com/cloud/deployments'

describe('Qoder deployments (sanitized fixtures)', () => {
  it('maps a cron deployment to a provider-neutral schedule', () => {
    const { data } = JSON.parse(readFileSync(join(FIXTURES, 'deployments.json'), 'utf-8'))
    const schedules = data.map((item: unknown) => parseQoderCloudDeployment(item, CONSOLE))
    expect(schedules).toHaveLength(3)
    expect(schedules[0]).toMatchObject({
      provider: 'qoder-cloud',
      name: 'weekly-example',
      status: 'active',
      cronExpression: '0 8 * * 1',
      timezone: 'UTC',
      pausedReason: null
    })
    expect(schedules[0].upcomingRunsAt).toHaveLength(5)
    // Synthetic prose preserves the wire shape without publishing account content.
    const prompt = schedules[0].prompt ?? ''
    expect(prompt).toMatch(/https:\/\/example\.com/i)
    expect(schedules[0].promptPreview).toBe(prompt.split('\n')[0])
    expect(schedules[0].promptPreview?.length ?? 0).toBeLessThanOrEqual(201)
    expect(schedules[0].url).toBe(`${CONSOLE}/${schedules[0].id}`)
    // Daily fixtures include last_run_at in the vendor's timestamp format.
    expect(schedules[1].lastRunAt).toMatch(/^\d{4}-/)
  })

  it('links a run to the session it spawned', () => {
    const { data } = JSON.parse(readFileSync(join(FIXTURES, 'deployment-runs.json'), 'utf-8'))
    const runs = data.map((item: unknown) => parseQoderCloudDeploymentRun(item))
    expect(runs).toHaveLength(3)
    expect(runs[0]).toMatchObject({
      scheduleId: expect.stringMatching(/^dep_/),
      sessionId: expect.stringMatching(/^sess_/),
      scheduledAt: expect.stringMatching(/^\d{4}-/),
      error: null
    })
  })

  it('reads an error object or string, and refuses rows without identity', () => {
    expect(
      parseQoderCloudDeploymentRun({ id: 'r', deployment_id: 'd', error: 'boom' })?.error
    ).toBe('boom')
    expect(
      parseQoderCloudDeploymentRun({ id: 'r', deployment_id: 'd', error: { message: 'nested' } })
        ?.error
    ).toBe('nested')
    expect(parseQoderCloudDeploymentRun({ id: 'r' })).toBeNull()
    expect(parseQoderCloudDeployment({ id: 'd' }, CONSOLE)).toBeNull()
  })
})
