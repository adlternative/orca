import { useCallback, useEffect, useRef, useState } from 'react'
import { Cloud, LoaderCircle, Unlink } from 'lucide-react'
import type {
  CloudAgentConnectionStatus,
  CloudAgentProviderDescriptor
} from '../../../../shared/cloud-agent-provider'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useMountedRef } from '@/hooks/useMountedRef'
import { readIpcErrorMessage } from '@/lib/ipc-error'
import { translate } from '@/i18n/i18n'
import { cloudAgentApi } from '../../lib/cloud-agent-api'
import { IntegrationCardDetails, IntegrationCardShell } from './integration-card-shell'
import { useIntegrationSubordinateRowClass } from './integration-card-presentation'

/**
 * Settings card for a cloud agent provider that has no bespoke card of its own.
 *
 * Why generic: the transport is provider-routed, so a second vendor must not need a second card
 * component. Qoder keeps its own card only because it has vendor quirks (CN endpoint, token docs).
 */
export function CloudAgentIntegrationCard({
  provider
}: {
  provider: CloudAgentProviderDescriptor
}): React.JSX.Element {
  const mountedRef = useMountedRef()
  const subordinateRowClass = useIntegrationSubordinateRowClass('flex items-center gap-3')
  const [status, setStatus] = useState<CloudAgentConnectionStatus | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const generationRef = useRef(0)

  const loadStatus = useCallback(async () => {
    const generation = ++generationRef.current
    try {
      const next = await cloudAgentApi(provider.id).status()
      if (mountedRef.current && generation === generationRef.current) {
        setStatus(next)
        setLoadFailed(false)
      }
    } catch {
      if (mountedRef.current && generation === generationRef.current) {
        setLoadFailed(true)
      }
    }
  }, [mountedRef, provider.id])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  const checking = status === null && !loadFailed
  const configured = status?.configured ?? false
  const envManaged = status?.source === 'environment'
  const stored = status?.source === 'stored'
  // Why read-only: the credential lives in the vendor CLI's own config; deleting a file Orca does
  // not own would silently log that CLI out.
  const fromCli = status?.source === 'ant-cli'

  const handleDisconnect = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await cloudAgentApi(provider.id).disconnect()
    } catch (cause) {
      if (mountedRef.current) {
        setError(
          readIpcErrorMessage(cause) ??
            translate(
              'auto.components.settings.cloudAgent.integration.disconnectFailed',
              'Could not remove the saved {{provider}} credential.',
              { provider: provider.shortLabel }
            )
        )
      }
    } finally {
      if (mountedRef.current) {
        setBusy(false)
      }
      void loadStatus()
    }
  }

  return (
    <IntegrationCardShell
      icon={<Cloud className="size-5" />}
      settingsSectionId={`integrations-cloud-agent-${provider.id}`}
      name={provider.label}
      description={translate(
        'auto.components.settings.cloudAgent.integration.description',
        'Watch agent sessions running in {{provider}}-managed cloud sandboxes.',
        { provider: provider.shortLabel }
      )}
      checking={checking}
      statusTone={configured ? 'connected' : 'attention'}
      statusLabel={
        configured
          ? translate('auto.components.settings.cloudAgent.integration.connected', 'Connected')
          : translate(
              'auto.components.settings.cloudAgent.integration.notConnected',
              'Not connected'
            )
      }
      actions={
        !checking && !envManaged && !fromCli ? (
          <Button
            variant={stored ? 'outline' : 'default'}
            size="sm"
            onClick={() => setDialogOpen(true)}
          >
            {stored
              ? translate('auto.components.settings.cloudAgent.integration.edit', 'Edit token')
              : translate('auto.components.settings.cloudAgent.integration.connect', 'Connect')}
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
                  {status?.baseUrl ?? ''}
                </p>
                {status?.credentialError ? (
                  <p className="truncate text-xs text-destructive">{status.credentialError}</p>
                ) : null}
              </div>
              {stored ? (
                <button
                  onClick={() => void handleDisconnect()}
                  disabled={busy}
                  aria-label={translate(
                    'auto.components.settings.cloudAgent.integration.disconnect',
                    'Disconnect {{provider}}',
                    { provider: provider.shortLabel }
                  )}
                  className="rounded-md p-1 text-muted-foreground/50 transition-colors hover:text-destructive"
                >
                  {busy ? (
                    <LoaderCircle className="size-3.5 animate-spin" />
                  ) : (
                    <Unlink className="size-3.5" />
                  )}
                </button>
              ) : null}
            </div>
          ) : null}
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          {loadFailed ? (
            <p role="alert" className="text-xs text-destructive">
              {translate(
                'auto.components.settings.cloudAgent.integration.statusLoadFailed',
                'Could not check for a saved {{provider}} credential.',
                { provider: provider.shortLabel }
              )}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {fromCli
              ? translate(
                  'auto.components.settings.cloudAgent.integration.vendorCli',
                  'Using the {{provider}} CLI login already on this machine.',
                  { provider: provider.shortLabel }
                )
              : envManaged
                ? translate(
                    'auto.components.settings.cloudAgent.integration.envManaged',
                    'Configured via environment variables. Unset {{vars}} to manage this credential in Orca.',
                    { vars: `${provider.id.toUpperCase().replace(/-/g, '_')}_API_KEY` }
                  )
                : stored
                  ? translate(
                      'auto.components.settings.cloudAgent.integration.stored',
                      'Saved in Orca on this machine. Its sessions appear alongside the other cloud sessions.'
                    )
                  : translate(
                      'auto.components.settings.cloudAgent.integration.notConfigured',
                      'Connect with a {{provider}} API key.',
                      { provider: provider.shortLabel }
                    )}
          </p>
        </IntegrationCardDetails>
      ) : null}
      <CloudAgentCredentialsDialog
        provider={provider}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initialBaseUrl={status?.baseUrl ?? null}
        onConnected={() => void loadStatus()}
      />
    </IntegrationCardShell>
  )
}

function CloudAgentCredentialsDialog({
  provider,
  open,
  onOpenChange,
  initialBaseUrl,
  onConnected
}: {
  provider: CloudAgentProviderDescriptor
  open: boolean
  onOpenChange: (open: boolean) => void
  initialBaseUrl: string | null
  onConnected: () => void
}): React.JSX.Element {
  const mountedRef = useMountedRef()
  const [token, setToken] = useState('')
  const [baseUrl, setBaseUrl] = useState(initialBaseUrl ?? '')
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The secret never comes back from main, so every open starts empty.
  useEffect(() => {
    if (open) {
      setToken('')
      setBaseUrl(initialBaseUrl ?? '')
      setError(null)
    }
  }, [open, initialBaseUrl])

  const submit = async (): Promise<void> => {
    if (!token.trim()) {
      return
    }
    setConnecting(true)
    setError(null)
    try {
      const reply = await cloudAgentApi(provider.id).connect({
        accessToken: token.trim(),
        ...(baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {})
      })
      if (!mountedRef.current) {
        return
      }
      if (reply.ok) {
        onOpenChange(false)
        onConnected()
      } else {
        setError(reply.error)
      }
    } catch (cause) {
      if (mountedRef.current) {
        setError(
          readIpcErrorMessage(cause) ??
            translate(
              'auto.components.settings.cloudAgent.integration.connectFailed',
              'Could not verify that key with {{provider}}.',
              { provider: provider.shortLabel }
            )
        )
      }
    } finally {
      if (mountedRef.current) {
        setConnecting(false)
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {translate(
              'auto.components.settings.cloudAgent.integration.dialogTitle',
              'Connect {{provider}}',
              { provider: provider.label }
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor={`${provider.id}-token`}>
              {translate('auto.components.settings.cloudAgent.integration.tokenLabel', 'API key')}
            </Label>
            <Input
              id={`${provider.id}-token`}
              autoFocus
              type="password"
              value={token}
              onChange={(event) => {
                setToken(event.target.value)
                setError(null)
              }}
              disabled={connecting}
              aria-invalid={error !== null}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${provider.id}-base-url`}>
              {translate(
                'auto.components.settings.cloudAgent.integration.baseUrlLabel',
                'API base URL (optional)'
              )}
            </Label>
            <Input
              id={`${provider.id}-base-url`}
              placeholder={initialBaseUrl ?? ''}
              value={baseUrl}
              onChange={(event) => {
                setBaseUrl(event.target.value)
                setError(null)
              }}
              disabled={connecting}
            />
          </div>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <p className="text-[11px] text-muted-foreground/70">
            {translate(
              'auto.components.settings.cloudAgent.integration.storageNote',
              'Stored on this machine with encrypted storage when the OS keychain is available.'
            )}
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={connecting}>
            {translate('auto.components.settings.cloudAgent.integration.cancel', 'Cancel')}
          </Button>
          <Button onClick={() => void submit()} disabled={connecting || token.trim().length === 0}>
            {connecting ? (
              <>
                <LoaderCircle className="size-4 animate-spin" />
                {translate(
                  'auto.components.settings.cloudAgent.integration.verifying',
                  'Verifying...'
                )}
              </>
            ) : (
              translate('auto.components.settings.cloudAgent.integration.connect', 'Connect')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
