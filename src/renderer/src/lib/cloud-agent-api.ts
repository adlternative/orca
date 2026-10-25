export const DEFAULT_CLOUD_AGENT_PROVIDER = 'qoder-cloud'

type CloudAgentApi = typeof window.api.qoderCloud

/**
 * Binds the generic cloud-agent bridge to one provider.
 *
 * Why a function: whoever holds a session row knows the vendor. Surfaces that do not hold one
 * (settings, the new-session dialog, the catalog) speak for the configured provider.
 */
export function cloudAgentApi(provider?: string | null): CloudAgentApi {
  const bind = window.api.cloudAgents
  if (typeof bind === 'function') {
    return bind(provider || DEFAULT_CLOUD_AGENT_PROVIDER)
  }
  // Why: hosts whose preload predates the generic bridge, and tests stubbing only this namespace.
  return window.api.qoderCloud
}
