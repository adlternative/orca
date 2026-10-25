import {
  AzureDevOpsIntegrationCard,
  BitbucketIntegrationCard,
  GiteaIntegrationCard,
  GitHubIntegrationCard,
  GitLabIntegrationCard
} from './source-control-integration-cards'
import { JiraIntegrationCard, LinearIntegrationCard } from './task-tracker-integration-cards'
import { CloudAgentIntegrationCard } from './cloud-agent-integration-card'
import { QoderCloudIntegrationCard } from './qoder-cloud-integration-card'
import { listCloudAgentProviders } from '../../../../shared/cloud-agent-provider-registry'
import { useIntegrationProviderStatusRefresh } from './use-integration-provider-status-refresh'
import { translate } from '@/i18n/i18n'
export { getIntegrationsPaneSearchEntries } from './integrations-search'

export function IntegrationsPane(): React.JSX.Element {
  useIntegrationProviderStatusRefresh()

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground">
            {translate('auto.components.settings.IntegrationsPane.298c65ecac', 'Review providers')}
          </h3>
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.settings.IntegrationsPane.1683acbac4',
              'Connect the source hosts Orca can use for pull requests, merge requests, checks, and review status.'
            )}
          </p>
        </div>
        <div className="space-y-3">
          <GitHubIntegrationCard />
          <GitLabIntegrationCard />
          <BitbucketIntegrationCard />
          <AzureDevOpsIntegrationCard />
          <GiteaIntegrationCard />
        </div>
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground">
            {translate('auto.components.settings.IntegrationsPane.70e885705b', 'Task providers')}
          </h3>
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.settings.IntegrationsPane.3ba07f933b',
              'Connect issue trackers Orca can use to browse tasks and start workspaces with linked context.'
            )}
          </p>
        </div>
        <div className="space-y-3">
          <LinearIntegrationCard />
          <JiraIntegrationCard />
        </div>
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground">
            {translate('auto.components.settings.IntegrationsPane.cloudAgents', 'Cloud agents')}
          </h3>
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.settings.IntegrationsPane.cloudAgentsDescription',
              'Connect hosted agent runtimes Orca can watch alongside local agents.'
            )}
          </p>
        </div>
        <div className="space-y-3">
          {/* Why the loop: one card per configured vendor. Qoder keeps a bespoke card for its
              CN endpoint and token docs; everything else uses the generic one. */}
          {listCloudAgentProviders().map((provider) =>
            provider.id === 'qoder-cloud' ? (
              <QoderCloudIntegrationCard key={provider.id} />
            ) : (
              <CloudAgentIntegrationCard key={provider.id} provider={provider} />
            )
          )}
        </div>
      </section>
    </div>
  )
}
