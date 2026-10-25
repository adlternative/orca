import type {
  CloudAgentProviderId,
  CloudAgentRequestFailure,
  CloudSessionResourceKind
} from './cloud-agent-provider'

/** A vendor agent template a session can be created from. */
export type CloudAgentTemplate = {
  id: string
  name: string
  description: string | null
  version: number
  model: string | null
}

/** The sandbox a session runs in, with the constraints a user must know before creating one. */
export type CloudAgentEnvironment = {
  id: string
  name: string
  description: string | null
  /** e.g. `limited` — whether the sandbox may reach the network at all. */
  networkPolicy: string | null
  allowedHosts: readonly string[]
  allowPackageManagers: boolean
}

export type CloudAgentMemoryStore = {
  id: string
  name: string
  description: string | null
  entryCount: number | null
}

export type CloudAgentVault = {
  id: string
  displayName: string
}

export type CloudAgentCatalog = {
  provider: CloudAgentProviderId
  templates: CloudAgentTemplate[]
  environments: CloudAgentEnvironment[]
  memoryStores: CloudAgentMemoryStore[]
  vaults: CloudAgentVault[]
}

export type CloudAgentCatalogResult =
  | { ok: true; catalog: CloudAgentCatalog }
  | CloudAgentRequestFailure

/** Shared launch input; provider requirements decide which selections are needed. */
export type NewCloudSessionInput = {
  provider: CloudAgentProviderId
  templateId: string
  templateVersion: number
  environmentId: string
  title: string
  /** The first turn: a plain prompt, or an acceptance goal the vendor will grade. */
  prompt: string
  outcome: { rubric: string; maxIterations: number } | null
  repository: { url: string; mountPath: string; authorizationToken: string } | null
  memoryStores: { id: string; access: 'read' | 'read_write'; instructions: string }[]
  vaultIds: string[]
}

export type CloudAgentCreateResult =
  | {
      ok: true
      sessionId: string
      /** False when the session exists but its first turn did not start. */
      promptSent: boolean
      promptError?: string
    }
  | CloudAgentRequestFailure

const TOKENISH = /^(?:gh[pousr]_|github_pat_)/

export type CloudAgentLaunchRequirements = {
  template: boolean
  environment: boolean
  repositoryToken: boolean
}

export function validateNewCloudSession(
  input: NewCloudSessionInput,
  requirements: CloudAgentLaunchRequirements = {
    template: true,
    environment: true,
    repositoryToken: true
  }
): string | null {
  if (requirements.template && !input.templateId) {
    return 'Choose an agent template.'
  }
  if (requirements.environment && !input.environmentId) {
    return 'Choose an environment.'
  }
  if (!input.prompt.trim() && !input.outcome) {
    return 'Enter a prompt or acceptance criteria.'
  }
  if (input.outcome && !input.outcome.rubric.trim()) {
    return 'Acceptance criteria need a rubric.'
  }
  if (
    input.outcome &&
    (!Number.isInteger(input.outcome.maxIterations) ||
      input.outcome.maxIterations < 1 ||
      input.outcome.maxIterations > 20)
  ) {
    return 'Iterations must be between 1 and 20.'
  }
  if (input.repository) {
    if (!input.repository.url.startsWith('https://')) {
      return 'The repository URL must be https://.'
    }
    if (requirements.repositoryToken && !input.repository.authorizationToken.trim()) {
      return 'A private repository needs a token; leave the URL empty for a public read-only clone.'
    }
    if (
      requirements.repositoryToken &&
      !TOKENISH.test(input.repository.authorizationToken.trim())
    ) {
      return 'That does not look like a GitHub token.'
    }
  }
  return null
}

export const CLOUD_SESSION_RESOURCE_LABELS: Record<CloudSessionResourceKind, string> = {
  'git-repository': 'GitHub repository',
  file: 'File',
  'memory-store': 'Memory store',
  'secret-vault': 'Vault'
}
