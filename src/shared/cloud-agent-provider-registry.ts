import type { CloudAgentProviderDescriptor, CloudAgentProviderId } from './cloud-agent-provider'
import { CLAUDE_MANAGED_PROVIDER } from './claude-managed'
import { OPENHANDS_CLOUD_PROVIDER } from './openhands-cloud'
import { QODER_CLOUD_PROVIDER } from './qoder-cloud-types'

// Why: one place the renderer asks "what can this provider do", so a second vendor is
// a new descriptor here and an adapter in main — not a sweep of `provider === …` checks.
const CLOUD_AGENT_PROVIDERS: readonly CloudAgentProviderDescriptor[] = [
  QODER_CLOUD_PROVIDER,
  OPENHANDS_CLOUD_PROVIDER,
  CLAUDE_MANAGED_PROVIDER
]

export function listCloudAgentProviders(): readonly CloudAgentProviderDescriptor[] {
  return CLOUD_AGENT_PROVIDERS
}

export function getCloudAgentProvider(
  id: CloudAgentProviderId
): CloudAgentProviderDescriptor | null {
  return CLOUD_AGENT_PROVIDERS.find((provider) => provider.id === id) ?? null
}
