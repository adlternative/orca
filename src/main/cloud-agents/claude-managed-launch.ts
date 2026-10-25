import type { request as claudeRequest } from './claude-managed-adapter'
import { isRecord, itemsOf, nextPageOf } from './claude-managed-mapping'
import { normalizeCreateInput } from './create-input'
import {
  validateNewCloudSession,
  type CloudAgentCatalogResult,
  type CloudAgentCreateResult
} from '../../shared/cloud-agent-create'

type Request = typeof claudeRequest

async function allPages(request: Request, path: string) {
  const items: Record<string, unknown>[] = []
  const seen = new Set<string>()
  let page: string | null = null
  do {
    const reply = await request(
      `${path}?beta=true&limit=100${page ? `&page=${encodeURIComponent(page)}` : ''}`
    )
    if (!reply.ok) {
      return reply
    }
    items.push(...itemsOf(reply.body))
    page = nextPageOf(reply.body)
    if (page && seen.has(page)) {
      return {
        ok: false as const,
        reason: 'malformed' as const,
        message: 'Repeated catalog cursor.'
      }
    }
    if (page) {
      seen.add(page)
    }
  } while (page)
  return { ok: true as const, items }
}

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null)

export async function loadClaudeLaunchCatalog(request: Request): Promise<CloudAgentCatalogResult> {
  const [agents, environments] = await Promise.all([
    allPages(request, '/v1/agents'),
    allPages(request, '/v1/environments')
  ])
  if (!agents.ok) {
    return agents
  }
  if (!environments.ok) {
    return environments
  }
  return {
    ok: true,
    catalog: {
      provider: 'claude-managed',
      templates: agents.items
        .filter((item) => typeof item.id === 'string' && !item.archived_at)
        .map((item) => ({
          id: String(item.id),
          name: text(item.name) ?? String(item.id),
          description: text(item.description),
          version: typeof item.version === 'number' ? item.version : 0,
          model: isRecord(item.model) ? text(item.model.id) : null
        })),
      environments: environments.items
        .filter(
          (item) =>
            typeof item.id === 'string' &&
            !item.archived_at &&
            (!isRecord(item.config) || item.config.type !== 'self_hosted')
        )
        .map((item) => {
          const networking =
            isRecord(item.config) && isRecord(item.config.networking) ? item.config.networking : {}
          return {
            id: String(item.id),
            name: text(item.name) ?? String(item.id),
            description: text(item.description),
            networkPolicy: text(networking.type),
            allowedHosts: Array.isArray(networking.allowed_hosts)
              ? networking.allowed_hosts.filter((host): host is string => typeof host === 'string')
              : [],
            allowPackageManagers: networking.allow_package_managers === true
          }
        }),
      memoryStores: [],
      vaults: []
    }
  }
}

export async function createClaudeSession(
  request: Request,
  value: unknown
): Promise<CloudAgentCreateResult> {
  const input = normalizeCreateInput(value, 'claude-managed')
  const invalid = input ? validateNewCloudSession(input) : 'Invalid launch input.'
  if (!input || invalid) {
    return { ok: false, reason: 'malformed', message: invalid ?? 'Invalid launch input.' }
  }
  if (input.outcome || input.memoryStores.length || input.vaultIds.length) {
    return {
      ok: false,
      reason: 'unsupported',
      message: 'These launch resources are not supported here.'
    }
  }
  const reply = await request('/v1/sessions?beta=true', {
    method: 'POST',
    body: {
      agent: { type: 'agent', id: input.templateId, version: input.templateVersion },
      environment_id: input.environmentId,
      ...(input.title.trim() ? { title: input.title.trim() } : {}),
      initial_events: [{ type: 'user.message', content: [{ type: 'text', text: input.prompt }] }],
      ...(input.repository
        ? {
            resources: [
              {
                type: 'github_repository',
                url: input.repository.url,
                authorization_token: input.repository.authorizationToken,
                ...(input.repository.mountPath ? { mount_path: input.repository.mountPath } : {})
              }
            ]
          }
        : {})
    }
  })
  if (!reply.ok) {
    return reply
  }
  return isRecord(reply.body) && typeof reply.body.id === 'string' && reply.body.id
    ? { ok: true, sessionId: reply.body.id, promptSent: true }
    : {
        ok: false,
        reason: 'unreachable',
        message: 'Claude may have created the task but returned no session id.'
      }
}
