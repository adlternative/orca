import type { NewCloudSessionInput } from '../../shared/cloud-agent-create'
import { isRecord, optionalString } from '../qoder-cloud/client'

export function normalizeCreateInput(
  value: unknown,
  provider: string
): NewCloudSessionInput | null {
  if (!isRecord(value) || (value.provider !== undefined && value.provider !== provider)) {
    return null
  }
  const templateId = optionalString(value.templateId) ?? ''
  const environmentId = optionalString(value.environmentId) ?? ''
  const templateVersion = typeof value.templateVersion === 'number' ? value.templateVersion : 0
  if (!Number.isInteger(templateVersion) || templateVersion < 0) {
    return null
  }
  const repository = isRecord(value.repository)
    ? {
        url: optionalString(value.repository.url) ?? '',
        mountPath: optionalString(value.repository.mountPath) ?? '',
        authorizationToken: optionalString(value.repository.authorizationToken) ?? ''
      }
    : null
  const outcome = isRecord(value.outcome)
    ? {
        rubric: optionalString(value.outcome.rubric) ?? '',
        maxIterations:
          typeof value.outcome.maxIterations === 'number' ? value.outcome.maxIterations : 3
      }
    : null
  const memoryStores = Array.isArray(value.memoryStores)
    ? value.memoryStores
        .filter(isRecord)
        .map((store) => ({
          id: optionalString(store.id) ?? '',
          access: store.access === 'read_write' ? ('read_write' as const) : ('read' as const),
          instructions: optionalString(store.instructions) ?? ''
        }))
        .filter((store) => store.id.length > 0)
    : []
  return {
    provider,
    templateId,
    templateVersion,
    environmentId,
    title: optionalString(value.title) ?? '',
    prompt: optionalString(value.prompt) ?? '',
    outcome: outcome && outcome.rubric.trim() ? outcome : null,
    repository: repository && repository.url.trim() ? repository : null,
    memoryStores,
    vaultIds: Array.isArray(value.vaultIds)
      ? value.vaultIds.filter((id): id is string => typeof id === 'string')
      : []
  }
}
