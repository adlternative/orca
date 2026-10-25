import { useCallback, useEffect, useRef, useState } from 'react'
import { Cloud, LoaderCircle, Unlink } from 'lucide-react'
import type { QoderCloudConnectionStatus } from '../../../../shared/qoder-cloud-types'
import { QODER_CLOUD_DEFAULT_API_BASE_URL } from '../../../../shared/qoder-cloud-types'
import { Button } from '@/components/ui/button'
import { useMountedRef } from '@/hooks/useMountedRef'
import { readIpcErrorMessage } from '@/lib/ipc-error'
import { IntegrationCardDetails, IntegrationCardShell } from './integration-card-shell'
import { useIntegrationSubordinateRowClass } from './integration-card-presentation'
import { QoderCloudCredentialsDialog } from './qoder-cloud-credentials-dialog'
import { translate } from '@/i18n/i18n'
import { cloudAgentApi } from '../../lib/cloud-agent-api'

export function QoderCloudIntegrationCard(): React.JSX.Element {
  const mountedRef = useMountedRef()
  const subordinateRowClass = useIntegrationSubordinateRowClass('flex items-center gap-3')
  const [connection, setConnection] = useState<QoderCloudConnectionStatus | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [disconnectError, setDisconnectError] = useState<string | null>(null)
  const generationRef = useRef(0)

  // Reads plaintext metadata only, so mounting the pane cannot trigger a keychain prompt.
  const loadConnection = useCallback(async () => {
    const generation = ++generationRef.current
    try {
      const next = await cloudAgentApi().status()
      if (mountedRef.current && generation === generationRef.current) {
        setConnection(next)
        setLoadFailed(false)
      }
    } catch {
      if (mountedRef.current && generation === generationRef.current) {
        setLoadFailed(true)
      }
    }
  }, [mountedRef])

  useEffect(() => {
    void loadConnection()
  }, [loadConnection])

  const current = loadFailed ? null : connection
  const checking = current === null && !loadFailed
  const configured = current?.configured ?? false
  const envManaged = current?.source === 'environment'
  const stored = current?.source === 'stored'
  const baseUrlOverride =
    current?.baseUrl && current.baseUrl !== QODER_CLOUD_DEFAULT_API_BASE_URL
      ? current.baseUrl
      : null

  const handleDisconnect = async (): Promise<void> => {
    setDisconnecting(true)
    setDisconnectError(null)
    try {
      await cloudAgentApi().disconnect()
    } catch (error) {
      if (mountedRef.current) {
        setDisconnectError(
          readIpcErrorMessage(error) ??
            translate(
              'auto.components.settings.qoder.cloud.integration.card.disconnectFailed',
              'Could not remove the saved Qoder Cloud credential.'
            )
        )
      }
    } finally {
      if (mountedRef.current) {
        setDisconnecting(false)
      }
      void loadConnection()
    }
  }

  return (
    <IntegrationCardShell
      icon={<Cloud className="size-5" />}
      settingsSectionId="integrations-qoder-cloud"
      name="Qoder Cloud Agents"
      description={translate(
        'auto.components.settings.qoder.cloud.integration.card.description',
        'Watch agent sessions running in Qoder-managed cloud sandboxes.'
      )}
      checking={checking}
      statusTone={configured ? 'connected' : 'attention'}
      statusLabel={
        configured
          ? translate(
              'auto.components.settings.qoder.cloud.integration.card.connected',
              'Connected'
            )
          : translate(
              'auto.components.settings.qoder.cloud.integration.card.notConnected',
              'Not connected'
            )
      }
      actions={
        !checking && !envManaged ? (
          <Button
            variant={stored ? 'outline' : 'default'}
            size="sm"
            onClick={() => setDialogOpen(true)}
          >
            {stored
              ? translate(
                  'auto.components.settings.qoder.cloud.integration.card.edit',
                  'Edit token'
                )
              : translate(
                  'auto.components.settings.qoder.cloud.integration.card.connect',
                  'Connect'
                )}
          </Button>
        ) : null
      }
    >
      {!checking ? (
        <IntegrationCardDetails>
          {configured ? (
            <div className={subordinateRowClass}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {baseUrlOverride ??
                    translate(
                      'auto.components.settings.qoder.cloud.integration.card.defaultHost',
                      'api.qoder.com'
                    )}
                </p>
                {current?.credentialError ? (
                  <p className="truncate text-xs text-destructive">{current.credentialError}</p>
                ) : null}
              </div>
              {stored ? (
                <button
                  onClick={() => void handleDisconnect()}
                  disabled={disconnecting}
                  aria-label={translate(
                    'auto.components.settings.qoder.cloud.integration.card.disconnect',
                    'Disconnect Qoder Cloud'
                  )}
                  className="rounded-md p-1 text-muted-foreground/50 transition-colors hover:text-destructive"
                >
                  {disconnecting ? (
                    <LoaderCircle className="size-3.5 animate-spin" />
                  ) : (
                    <Unlink className="size-3.5" />
                  )}
                </button>
              ) : null}
            </div>
          ) : null}
          {disconnectError ? <p className="text-xs text-destructive">{disconnectError}</p> : null}
          {loadFailed ? (
            <p role="alert" className="text-xs text-destructive">
              {translate(
                'auto.components.settings.qoder.cloud.integration.card.statusLoadFailed',
                'Could not check for a saved Qoder Cloud credential.'
              )}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {envManaged
              ? translate(
                  'auto.components.settings.qoder.cloud.integration.card.envManaged',
                  'Configured via environment variables. Unset ORCA_QODER_* to manage this credential in Orca.'
                )
              : stored
                ? translate(
                    'auto.components.settings.qoder.cloud.integration.card.storedCredential',
                    'Saved in Orca on this machine. Sessions appear in the sidebar under Cloud sessions.'
                  )
                : translate(
                    'auto.components.settings.qoder.cloud.integration.card.notConfigured',
                    'Connect with a Qoder personal or service account token. ORCA_QODER_ACCESS_TOKEN works too and takes precedence.'
                  )}
          </p>
        </IntegrationCardDetails>
      ) : null}
      <QoderCloudCredentialsDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initialBaseUrl={current?.baseUrl}
        environmentManaged={envManaged}
        onConnected={() => void loadConnection()}
      />
    </IntegrationCardShell>
  )
}
