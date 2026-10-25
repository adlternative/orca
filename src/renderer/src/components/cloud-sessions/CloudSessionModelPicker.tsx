import { useEffect, useState } from 'react'
import { Check, ChevronDown, LoaderCircle, RotateCw, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import type { CloudAgentModel } from '../../../../shared/cloud-agent-model'
import type { CloudAgentRequestFailure } from '../../../../shared/cloud-agent-provider'
import { cloudAgentFailureCopy, providerLabel } from './cloud-agent-failure-copy'
import { useCloudSessionModels } from './use-cloud-session-models'
import { cloudAgentApi } from '../../lib/cloud-agent-api'

type CloudSessionModelPickerProps = {
  sessionId: string
  /** Model the session runs right now, as the vendor reports it. */
  modelId: string | null
  /** A switch mid-turn is rejected by the vendor, so the trigger waits for the turn to settle. */
  disabled: boolean
  /** The session's vendor; the drawer always knows it. */
  provider?: string | null
}

function priceLabel(model: CloudAgentModel): string | null {
  if (model.priceFactor === null || model.priceFactor === 1) {
    return null
  }
  return `×${Number.isInteger(model.priceFactor) ? model.priceFactor : model.priceFactor.toFixed(1)}`
}

/**
 * Switches which model answers the session's next turn.
 *
 * Why per session: the vendor stores the choice on the session's agent snapshot, so a switch is
 * scoped to this conversation and every other session keeps its own model.
 */
export function CloudSessionModelPicker({
  sessionId,
  modelId,
  disabled,
  provider
}: CloudSessionModelPickerProps): React.JSX.Element {
  // Why lazy: the list only matters once the menu opens, and fetching it per session open
  // would burn an IPC round trip for every row a human clicks.
  const [open, setOpen] = useState(false)
  const { models, failure, loading, reload } = useCloudSessionModels(open)
  const [applied, setApplied] = useState(modelId)
  const [pending, setPending] = useState<string | null>(null)
  const [switchFailure, setSwitchFailure] = useState<CloudAgentRequestFailure | null>(null)

  // Why: the drawer can open a different session without unmounting the picker.
  useEffect(() => {
    setApplied(modelId)
    setPending(null)
    setSwitchFailure(null)
  }, [modelId, sessionId])

  const current = models.find((model) => model.id === applied) ?? null
  const label =
    current?.displayName ??
    applied ??
    translate('auto.components.cloud.sessions.model.auto', 'Auto')

  const switchTo = async (model: CloudAgentModel, effort?: string | null): Promise<void> => {
    setPending(model.id)
    setSwitchFailure(null)
    const result = await cloudAgentApi(provider).setSessionModel({
      sessionId,
      modelId: model.id,
      effort: effort ?? (model.efforts.length > 0 ? model.defaultEffort : null)
    })
    setPending(null)
    if (result.ok) {
      setApplied(result.modelId)
      return
    }
    setSwitchFailure(result)
  }

  const listFailure = failure ?? switchFailure

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={disabled || pending !== null}
          className="h-9 max-w-40 gap-1.5 px-2 text-xs text-muted-foreground"
          aria-label={translate(
            'auto.components.cloud.sessions.model.switch',
            'Switch model, currently {{model}}',
            { model: label }
          )}
        >
          {pending !== null ? (
            <LoaderCircle className="size-3.5 shrink-0 animate-spin" />
          ) : (
            <Sparkles className="size-3.5 shrink-0" />
          )}
          <span className="truncate">{label}</span>
          <ChevronDown className="size-3 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="top"
        className="max-h-80 w-60 scrollbar-sleek overflow-y-auto"
      >
        <DropdownMenuLabel className="text-xs">
          {translate('auto.components.cloud.sessions.model.title', 'Model for this session')}
        </DropdownMenuLabel>
        {listFailure ? (
          <div className="space-y-2 px-2 py-1.5">
            <p className="text-xs text-destructive">
              {cloudAgentFailureCopy(listFailure, providerLabel(provider))}
            </p>
            <Button variant="outline" size="sm" className="h-7 w-full" onClick={reload}>
              <RotateCw className="size-3" />
              {translate('auto.components.cloud.sessions.drawer.retry', 'Try again')}
            </Button>
          </div>
        ) : models.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">
            {loading
              ? translate('auto.components.cloud.sessions.model.loading', 'Loading models…')
              : translate(
                  'auto.components.cloud.sessions.model.empty',
                  'This account lists no models.'
                )}
          </p>
        ) : (
          models.map((model) => {
            const selected = model.id === applied
            const price = priceLabel(model)
            const row = (
              <DropdownMenuItem
                key={model.id}
                onSelect={(event) => {
                  // Why: a submenu needs the item open, a plain pick needs it closed.
                  if (model.efforts.length === 0) {
                    void switchTo(model)
                    return
                  }
                  event.preventDefault()
                }}
                className="gap-2"
              >
                <Check className={selected ? 'size-3.5 shrink-0' : 'size-3.5 shrink-0 opacity-0'} />
                <span className="min-w-0 flex-1 truncate">{model.displayName}</span>
                {model.vision ? (
                  <span className="rounded bg-accent px-1 text-[10px] text-accent-foreground">
                    {translate('auto.components.cloud.sessions.model.vision', 'Vision')}
                  </span>
                ) : null}
                {price ? (
                  <span className="text-[10px] text-muted-foreground tabular-nums">{price}</span>
                ) : null}
              </DropdownMenuItem>
            )
            return model.efforts.length === 0 ? (
              row
            ) : (
              <DropdownMenuSub key={model.id}>
                <DropdownMenuSubTrigger className="gap-2">
                  <Check
                    className={selected ? 'size-3.5 shrink-0' : 'size-3.5 shrink-0 opacity-0'}
                  />
                  <span className="min-w-0 flex-1 truncate">{model.displayName}</span>
                  {price ? (
                    <span className="text-[10px] text-muted-foreground tabular-nums">{price}</span>
                  ) : null}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-44">
                  <DropdownMenuLabel className="text-xs">
                    {translate('auto.components.cloud.sessions.model.effort', 'Reasoning effort')}
                  </DropdownMenuLabel>
                  {model.efforts.map((effort) => (
                    <DropdownMenuItem
                      key={effort}
                      onSelect={() => void switchTo(model, effort)}
                      className="gap-2"
                    >
                      <Check
                        className={
                          selected && effort === (current?.defaultEffort ?? null)
                            ? 'size-3.5 shrink-0'
                            : 'size-3.5 shrink-0 opacity-0'
                        }
                      />
                      <span className="flex-1 capitalize">{effort}</span>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => void switchTo(model)}>
                    {translate(
                      'auto.components.cloud.sessions.model.useDefault',
                      'Use the model default'
                    )}
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
