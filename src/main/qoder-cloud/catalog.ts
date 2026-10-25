import type {
  CloudAgentCatalogResult,
  CloudAgentEnvironment,
  CloudAgentMemoryStore,
  CloudAgentTemplate,
  CloudAgentVault
} from '../../shared/cloud-agent-create'
import { isRecord, optionalNumber, optionalString, requestJson } from './client'
import type { QoderCloudAuthConfig } from './credential-store'
import { QODER_CLOUD_PROVIDER_ID } from '../../shared/qoder-cloud-types'

// Reading the catalogs a create dialog needs: agent templates, sandboxes, memory stores, vaults.
// Each is a narrow pass over one list endpoint; anything unparseable is dropped rather than
// guessed, so the dialog can never offer a template that does not exist.

const CATALOG_LIMIT = 100

function pageOf(body: unknown): unknown[] | null {
  if (!isRecord(body) || !Array.isArray(body.data)) {
    return null
  }
  return body.data
}

function template(value: unknown): CloudAgentTemplate | null {
  if (!isRecord(value)) {
    return null
  }
  const id = optionalString(value.id)
  const name = optionalString(value.name)
  const version = optionalNumber(value.version)
  if (!id || !name || version === null) {
    return null
  }
  return {
    id,
    name,
    description: optionalString(value.description),
    version,
    model: isRecord(value.model) ? optionalString(value.model.id) : optionalString(value.model)
  }
}

function environment(value: unknown): CloudAgentEnvironment | null {
  if (!isRecord(value)) {
    return null
  }
  const id = optionalString(value.id)
  const name = optionalString(value.name)
  if (!id || !name) {
    return null
  }
  const config = isRecord(value.config) ? value.config : null
  const networking = config && isRecord(config.networking) ? config.networking : null
  return {
    id,
    name,
    description: optionalString(value.description),
    networkPolicy: networking ? optionalString(networking.type) : null,
    allowedHosts: Array.isArray(networking?.allowed_hosts)
      ? networking.allowed_hosts.filter((host): host is string => typeof host === 'string')
      : [],
    allowPackageManagers: networking?.allow_package_managers === true
  }
}

function memoryStore(value: unknown): CloudAgentMemoryStore | null {
  if (!isRecord(value)) {
    return null
  }
  const id = optionalString(value.id)
  const name = optionalString(value.name)
  return id && name
    ? {
        id,
        name,
        description: optionalString(value.description),
        entryCount: optionalNumber(value.entry_count)
      }
    : null
}

function vault(value: unknown): CloudAgentVault | null {
  if (!isRecord(value)) {
    return null
  }
  const id = optionalString(value.id)
  return id ? { id, displayName: optionalString(value.display_name) ?? id } : null
}

function collect<T>(body: unknown, parse: (value: unknown) => T | null): T[] {
  const rows = pageOf(body)
  if (!rows) {
    return []
  }
  const out: T[] = []
  for (const row of rows) {
    const parsed = parse(row)
    if (parsed) {
      out.push(parsed)
    }
  }
  return out
}

export async function loadQoderCloudCatalog(
  config: QoderCloudAuthConfig
): Promise<CloudAgentCatalogResult> {
  const query = new URLSearchParams({ limit: String(CATALOG_LIMIT) })
  const [agents, environments, memories, vaults] = await Promise.all([
    requestJson(config, '/agents', query),
    requestJson(config, '/environments', query),
    requestJson(config, '/memory_stores', query),
    requestJson(config, '/vaults', query)
  ])
  // Why: templates and environments are required to create anything; memory and vaults are extras,
  // so a failure on those degrades to empty rather than blocking the dialog.
  if (!agents.ok) {
    return agents
  }
  if (!environments.ok) {
    return environments
  }
  return {
    ok: true,
    catalog: {
      provider: QODER_CLOUD_PROVIDER_ID,
      templates: collect(agents.body, template).filter((item) => item.version > 0),
      environments: collect(environments.body, environment),
      memoryStores: memories.ok ? collect(memories.body, memoryStore) : [],
      vaults: vaults.ok ? collect(vaults.body, vault) : []
    }
  }
}
