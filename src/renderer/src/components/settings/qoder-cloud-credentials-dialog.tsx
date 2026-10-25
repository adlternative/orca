import { useId, useLayoutEffect, useRef, useState } from 'react'
import { ExternalLink, LoaderCircle, Lock } from 'lucide-react'
import {
  QODER_CLOUD_CN_API_BASE_URL,
  QODER_CLOUD_DEFAULT_API_BASE_URL
} from '../../../../shared/qoder-cloud-types'
import { useMountedRef } from '@/hooks/useMountedRef'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { preventOutsideDismissWhenDirty } from '@/lib/outside-dismiss-guard'
import { translate } from '@/i18n/i18n'
import { cloudAgentApi } from '../../lib/cloud-agent-api'

const TOKEN_DOCS_URL = 'https://docs.qoder.com/cloud-agents/quickstart'

type ConnectState = 'idle' | 'connecting' | 'error'

type QoderCloudCredentialsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialBaseUrl?: string | null
  /** Env vars win over stored credentials, so saving here would have no effect. */
  environmentManaged?: boolean
  onConnected?: () => void
}

export function QoderCloudCredentialsDialog({
  open,
  onOpenChange,
  initialBaseUrl,
  environmentManaged = false,
  onConnected
}: QoderCloudCredentialsDialogProps): React.JSX.Element {
  const mountedRef = useMountedRef()
  const tokenId = useId()
  const baseUrlId = useId()
  const errorId = useId()
  const [accessToken, setAccessToken] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [connectState, setConnectState] = useState<ConnectState>('idle')
  const [connectError, setConnectError] = useState<string | null>(null)
  const baselineBaseUrlRef = useRef('')

  // Re-seed on every open; the secret always starts empty because main never hands it back.
  useLayoutEffect(() => {
    if (!open) {
      return
    }
    const seed = initialBaseUrl ?? ''
    baselineBaseUrlRef.current = seed
    setBaseUrl(seed)
    setAccessToken('')
    setConnectState('idle')
    setConnectError(null)
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- keyed on `open` alone: a status refresh mid-edit must not overwrite what the user is typing.
  }, [open])

  const connecting = connectState === 'connecting'
  const canSubmit = !environmentManaged && !connecting && Boolean(accessToken.trim())

  const clearErrorOnEdit = (): void => {
    if (connectState === 'error') {
      setConnectState('idle')
      setConnectError(null)
    }
  }

  const guardOutsideDismiss = preventOutsideDismissWhenDirty(
    () => accessToken !== '' || baseUrl !== baselineBaseUrlRef.current
  )

  const handleConnect = async (): Promise<void> => {
    if (!canSubmit) {
      return
    }
    setConnectState('connecting')
    setConnectError(null)
    try {
      const result = await cloudAgentApi().connect({
        accessToken: accessToken.trim(),
        baseUrl: baseUrl.trim() || null
      })
      if (!mountedRef.current) {
        return
      }
      if (result.ok) {
        setAccessToken('')
        setConnectState('idle')
        onOpenChange(false)
        onConnected?.()
        return
      }
      setConnectState('error')
      setConnectError(result.error)
    } catch (error) {
      if (mountedRef.current) {
        setConnectState('error')
        setConnectError(
          error instanceof Error
            ? error.message
            : translate(
                'auto.components.settings.qoder.cloud.credentials.dialog.connectFailed',
                'Connection failed'
              )
        )
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (connecting ? undefined : onOpenChange(next))}>
      <DialogContent
        className="sm:max-w-lg"
        onPointerDownOutside={guardOutsideDismiss}
        onInteractOutside={guardOutsideDismiss}
        onKeyDown={(event) => {
          if (event.target instanceof HTMLInputElement && event.key === 'Enter' && canSubmit) {
            event.preventDefault()
            void handleConnect()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {translate(
              'auto.components.settings.qoder.cloud.credentials.dialog.title',
              'Connect Qoder Cloud Agents'
            )}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.settings.qoder.cloud.credentials.dialog.description',
              'Use a Qoder personal or service account token to watch cloud agent sessions from Orca. Orca verifies it before saving.'
            )}
          </DialogDescription>
        </DialogHeader>
        {environmentManaged ? (
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.settings.qoder.cloud.credentials.dialog.environmentManaged',
              'Qoder Cloud is already configured through ORCA_QODER_* environment variables, which take precedence. Unset them to save a credential in Orca.'
            )}
          </p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor={tokenId}>
                {translate(
                  'auto.components.settings.qoder.cloud.credentials.dialog.accessToken',
                  'Access token (PAT or SAT)'
                )}
              </Label>
              <Input
                id={tokenId}
                autoFocus
                type="password"
                value={accessToken}
                onChange={(event) => {
                  setAccessToken(event.target.value)
                  clearErrorOnEdit()
                }}
                disabled={connecting}
                aria-invalid={connectState === 'error'}
                aria-describedby={connectState === 'error' ? errorId : undefined}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={baseUrlId}>
                {translate(
                  'auto.components.settings.qoder.cloud.credentials.dialog.baseUrl',
                  'API base URL (optional)'
                )}
              </Label>
              <Input
                id={baseUrlId}
                placeholder={QODER_CLOUD_DEFAULT_API_BASE_URL}
                value={baseUrl}
                onChange={(event) => {
                  setBaseUrl(event.target.value)
                  clearErrorOnEdit()
                }}
                disabled={connecting}
              />
            </div>
            {connectState === 'error' && connectError ? (
              <p id={errorId} className="text-xs text-destructive">
                {connectError}
              </p>
            ) : null}
            <div className="space-y-2 text-xs leading-relaxed text-muted-foreground">
              <p>
                {translate(
                  'auto.components.settings.qoder.cloud.credentials.dialog.hint',
                  'Qoder CN and Qoder international are separate products with separate tokens; set the base URL to match the console that issued your token.'
                )}
              </p>
              <p>
                <button
                  type="button"
                  className="text-primary underline-offset-2 hover:underline"
                  disabled={connecting}
                  onClick={() => {
                    setBaseUrl(QODER_CLOUD_CN_API_BASE_URL)
                    clearErrorOnEdit()
                  }}
                >
                  {translate(
                    'auto.components.settings.qoder.cloud.credentials.dialog.useCn',
                    'Use the Qoder CN endpoint'
                  )}
                </button>
              </p>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                onClick={() => window.api.shell.openUrl(TOKEN_DOCS_URL)}
              >
                <ExternalLink className="size-3" />
                {translate(
                  'auto.components.settings.qoder.cloud.credentials.dialog.docsLink',
                  'Qoder Cloud Agents quickstart'
                )}
              </button>
            </div>
            <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground/70">
              <Lock className="size-3 mt-0.5 shrink-0" />
              {translate(
                'auto.components.settings.qoder.cloud.credentials.dialog.storageNote',
                'Stored on this machine with encrypted storage when the OS keychain is available. ORCA_QODER_* environment variables always take precedence over what you save here.'
              )}
            </p>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={connecting}>
            {translate('auto.components.settings.qoder.cloud.credentials.dialog.cancel', 'Cancel')}
          </Button>
          <Button onClick={() => void handleConnect()} disabled={!canSubmit}>
            {connecting ? (
              <>
                <LoaderCircle className="size-4 animate-spin" />
                {translate(
                  'auto.components.settings.qoder.cloud.credentials.dialog.verifying',
                  'Verifying...'
                )}
              </>
            ) : (
              translate(
                'auto.components.settings.qoder.cloud.credentials.dialog.connect',
                'Connect'
              )
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
