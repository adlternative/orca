import type {
  CloudAgentListScheduleRunsResult,
  CloudAgentListSchedulesResult,
  CloudAgentSchedule,
  CloudAgentScheduleRun
} from '../../shared/cloud-agent-provider'
import { QODER_CLOUD_PROVIDER_ID } from '../../shared/qoder-cloud-types'
import { isRecord, optionalNumber, optionalString, requestJson } from './client'
import type { QoderCloudAuthConfig } from './credential-store'

// Qoder "Deployments": cron-scheduled sessions the vendor owns. Orca lists them under
// Automations as an external manager and links each run to the session it spawned.

const MAX_PAGE_LIMIT = 100

function scheduleStatus(value: unknown): CloudAgentSchedule['status'] {
  return value === 'active' || value === 'paused' || value === 'archived' ? value : 'unknown'
}

/** The full first prompt, clamped only at a size no detail panel should render. */
const MAX_PROMPT_CHARS = 8_000

function firstPrompt(initialEvents: unknown): string | null {
  if (!Array.isArray(initialEvents)) {
    return null
  }
  for (const event of initialEvents) {
    if (!isRecord(event) || event.type !== 'user.message' || !Array.isArray(event.content)) {
      continue
    }
    const text = event.content
      .map((block) => (isRecord(block) && typeof block.text === 'string' ? block.text : ''))
      .join('')
      .trim()
    if (text) {
      return text.length > MAX_PROMPT_CHARS ? `${text.slice(0, MAX_PROMPT_CHARS)}…` : text
    }
  }
  return null
}

function promptPreview(prompt: string | null): string | null {
  if (!prompt) {
    return null
  }
  const firstLine =
    prompt
      .split('\n')
      .find((line) => line.trim().length > 0)
      ?.trim() ?? prompt
  return firstLine.length > 200 ? `${firstLine.slice(0, 200)}…` : firstLine
}

export function parseQoderCloudDeployment(
  value: unknown,
  consoleUrl: string
): CloudAgentSchedule | null {
  if (!isRecord(value)) {
    return null
  }
  const id = optionalString(value.id)
  const name = optionalString(value.name)
  if (!id || !name) {
    return null
  }
  const schedule = isRecord(value.schedule) ? value.schedule : null
  const agent = isRecord(value.agent) ? value.agent : null
  const fullPrompt = firstPrompt(value.initial_events)
  const upcoming = Array.isArray(schedule?.upcoming_runs_at)
    ? schedule.upcoming_runs_at.filter((at): at is string => typeof at === 'string')
    : []
  return {
    provider: QODER_CLOUD_PROVIDER_ID,
    id,
    name,
    description: optionalString(value.description),
    status: optionalString(value.archived_at) ? 'archived' : scheduleStatus(value.status),
    pausedReason: optionalString(value.paused_reason),
    cronExpression: schedule ? optionalString(schedule.expression) : null,
    timezone: schedule ? optionalString(schedule.timezone) : null,
    lastRunAt: schedule ? optionalString(schedule.last_run_at) : null,
    upcomingRunsAt: upcoming,
    agentId: agent ? optionalString(agent.id) : null,
    agentVersion: agent ? optionalNumber(agent.version) : null,
    environmentId: optionalString(value.environment_id),
    environmentName: null,
    promptPreview: promptPreview(fullPrompt),
    prompt: fullPrompt,
    url: `${consoleUrl}/${encodeURIComponent(id)}`
  }
}

export function parseQoderCloudDeploymentRun(value: unknown): CloudAgentScheduleRun | null {
  if (!isRecord(value)) {
    return null
  }
  const id = optionalString(value.id)
  const scheduleId = optionalString(value.deployment_id)
  if (!id || !scheduleId) {
    return null
  }
  const trigger = isRecord(value.trigger_context) ? value.trigger_context : null
  const error = value.error
  return {
    id,
    scheduleId,
    sessionId: optionalString(value.session_id),
    scheduledAt: trigger ? optionalString(trigger.scheduled_at) : null,
    createdAt: optionalString(value.created_at),
    error:
      typeof error === 'string'
        ? error
        : isRecord(error) && typeof error.message === 'string'
          ? error.message
          : null
  }
}

function pageQuery(
  page: string | null | undefined,
  limit: number | null | undefined
): URLSearchParams {
  const query = new URLSearchParams()
  if (limit !== null && limit !== undefined) {
    query.set('limit', String(Math.min(Math.max(Math.trunc(limit), 1), MAX_PAGE_LIMIT)))
  }
  if (page) {
    query.set('page', page)
  }
  return query
}

async function environmentNames(config: QoderCloudAuthConfig): Promise<Map<string, string>> {
  const result = await requestJson(
    config,
    '/environments',
    new URLSearchParams({ limit: String(MAX_PAGE_LIMIT) })
  )
  const names = new Map<string, string>()
  if (!result.ok || !isRecord(result.body) || !Array.isArray(result.body.data)) {
    return names
  }
  for (const row of result.body.data) {
    if (isRecord(row)) {
      const id = optionalString(row.id)
      const name = optionalString(row.name)
      if (id && name) {
        names.set(id, name)
      }
    }
  }
  return names
}

export async function listQoderCloudDeployments(
  config: QoderCloudAuthConfig,
  args: { page?: string | null; limit?: number | null }
): Promise<CloudAgentListSchedulesResult> {
  const result = await requestJson(config, '/deployments', pageQuery(args.page, args.limit))
  if (!result.ok) {
    return result
  }
  if (!isRecord(result.body) || !Array.isArray(result.body.data)) {
    return {
      ok: false,
      reason: 'malformed',
      message: 'Qoder Cloud returned an unexpected deployment page.'
    }
  }
  const consoleUrl = config.baseUrl.includes('qoder.com.cn')
    ? 'https://qoder.com.cn/cloud/deployments'
    : 'https://qoder.com/cloud/deployments'
  const names = await environmentNames(config)
  const schedules: CloudAgentSchedule[] = []
  for (const item of result.body.data) {
    const schedule = parseQoderCloudDeployment(item, consoleUrl)
    if (schedule) {
      schedules.push(
        schedule.environmentId && names.has(schedule.environmentId)
          ? { ...schedule, environmentName: names.get(schedule.environmentId) ?? null }
          : schedule
      )
    }
  }
  return { ok: true, page: { schedules, nextPage: optionalString(result.body.next_page) } }
}

export async function listQoderCloudDeploymentRuns(
  config: QoderCloudAuthConfig,
  args: { scheduleId: string; page?: string | null; limit?: number | null }
): Promise<CloudAgentListScheduleRunsResult> {
  const result = await requestJson(
    config,
    `/deployments/${encodeURIComponent(args.scheduleId)}/runs`,
    pageQuery(args.page, args.limit)
  )
  if (!result.ok) {
    return result
  }
  if (!isRecord(result.body) || !Array.isArray(result.body.data)) {
    return {
      ok: false,
      reason: 'malformed',
      message: 'Qoder Cloud returned an unexpected run page.'
    }
  }
  const runs: CloudAgentScheduleRun[] = []
  for (const item of result.body.data) {
    const run = parseQoderCloudDeploymentRun(item)
    if (run) {
      runs.push(run)
    }
  }
  return { ok: true, page: { runs, nextPage: optionalString(result.body.next_page) } }
}
