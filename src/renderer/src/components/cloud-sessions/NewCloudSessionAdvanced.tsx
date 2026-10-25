import { useMemo, useState } from 'react'
import type { CloudAgentCatalog } from '../../../../shared/cloud-agent-create'
import { getCloudAgentProvider } from '../../../../shared/cloud-agent-provider-registry'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import type { NewCloudSessionForm } from './use-new-cloud-session-form'

/** The Advanced block of the create dialog: repository mount, memory stores, vaults, criteria. */
export function NewCloudSessionAdvanced({
  catalog,
  form
}: {
  catalog: CloudAgentCatalog
  form: NewCloudSessionForm
}): React.JSX.Element {
  const provider = getCloudAgentProvider(catalog.provider)
  const needsToken = provider?.launchRequirements?.repositoryToken !== false
  const repository = form.input.repository ?? { url: '', mountPath: '', authorizationToken: '' }
  const outcome = form.input.outcome ?? { rubric: '', maxIterations: 3 }
  const [repositoryOn, setRepositoryOn] = useState(form.input.repository !== null)
  const [outcomeOn, setOutcomeOn] = useState(form.input.outcome !== null)
  const [memoryQuery, setMemoryQuery] = useState('')
  // Why: an account can hold dozens of stores; a search field beats scanning a wall of names.
  const visibleStores = useMemo(() => {
    const query = memoryQuery.trim().toLowerCase()
    return query
      ? catalog.memoryStores.filter((store) => store.name.toLowerCase().includes(query))
      : catalog.memoryStores
  }, [catalog.memoryStores, memoryQuery])

  const updateRepository = (patch: Partial<typeof repository>): void => {
    form.setRepository({ ...repository, ...patch })
  }

  return (
    <div className="space-y-4 pt-1">
      {provider?.capabilities.sessionResources.includes('git-repository') ? (
        <div className="space-y-1">
          <label className="flex items-center gap-2 text-xs font-medium text-foreground">
            <Checkbox
              checked={repositoryOn}
              onCheckedChange={(checked) => {
                const on = checked === true
                setRepositoryOn(on)
                form.setRepository(on ? repository : null)
              }}
            />
            {translate('auto.components.cloud.sessions.new.mountRepo', 'Mount a GitHub repository')}
          </label>
          {repositoryOn ? (
            <div className="space-y-2 pl-6">
              <Input
                aria-label={translate(
                  'auto.components.cloud.sessions.new.repoUrl',
                  'Repository URL'
                )}
                value={repository.url}
                placeholder={translate(
                  'auto.components.cloud.sessions.new.repoUrlPlaceholder',
                  'https://github.com/your-org/your-repo'
                )}
                onChange={(event) => updateRepository({ url: event.target.value })}
              />
              {needsToken ? (
                <>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      aria-label={translate(
                        'auto.components.cloud.sessions.new.mountPath',
                        'Mount path'
                      )}
                      value={repository.mountPath}
                      placeholder={translate(
                        'auto.components.cloud.sessions.new.mountPathPlaceholder',
                        '/data/workspace/your-repo'
                      )}
                      onChange={(event) => updateRepository({ mountPath: event.target.value })}
                    />
                    <Input
                      aria-label={translate(
                        'auto.components.cloud.sessions.new.repoToken',
                        'GitHub token'
                      )}
                      type="password"
                      value={repository.authorizationToken}
                      placeholder={translate(
                        'auto.components.cloud.sessions.new.repoTokenPlaceholder',
                        'ghp_…'
                      )}
                      onChange={(event) =>
                        updateRepository({ authorizationToken: event.target.value })
                      }
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {translate(
                      'auto.components.cloud.sessions.new.repoTokenNote',
                      'A fine-grained token with Contents: read and, only if the agent should push, Pull requests: write. Orca stores it in this session request only.'
                    )}{' '}
                    <button
                      type="button"
                      className="text-primary underline-offset-2 hover:underline"
                      onClick={() =>
                        void window.api.shell.openUrl(
                          'https://github.com/settings/tokens?type=beta'
                        )
                      }
                    >
                      {translate(
                        'auto.components.cloud.sessions.new.repoTokenLink',
                        'Create a token'
                      )}
                    </button>
                  </p>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {catalog.memoryStores.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-foreground">
            {translate('auto.components.cloud.sessions.new.memory', 'Memory stores')}
          </p>
          {catalog.memoryStores.length > 8 ? (
            <Input
              value={memoryQuery}
              onChange={(event) => setMemoryQuery(event.target.value)}
              placeholder={translate(
                'auto.components.cloud.sessions.new.searchMemory',
                'Search memory stores'
              )}
              aria-label={translate(
                'auto.components.cloud.sessions.new.searchMemory',
                'Search memory stores'
              )}
              className="h-8"
            />
          ) : null}
          <div className="max-h-44 space-y-1 overflow-y-auto scrollbar-sleek pl-1">
            {visibleStores.map((store) => {
              const chosen = form.input.memoryStores.find((item) => item.id === store.id)
              return (
                <div key={store.id} className="flex items-center gap-2">
                  <Checkbox
                    checked={chosen !== undefined}
                    onCheckedChange={() => form.toggleMemoryStore(store.id)}
                    aria-label={store.name}
                  />
                  <span className="min-w-0 flex-1 truncate text-xs">
                    {store.name}
                    {store.entryCount !== null ? (
                      <span className="text-muted-foreground"> · {store.entryCount}</span>
                    ) : null}
                  </span>
                  {chosen ? (
                    <Select
                      value={chosen.access}
                      onValueChange={(value) =>
                        form.setMemoryAccess(
                          store.id,
                          value === 'read_write' ? 'read_write' : 'read'
                        )
                      }
                    >
                      <SelectTrigger
                        className="h-7 w-32"
                        aria-label={translate(
                          'auto.components.cloud.sessions.new.memoryAccessLabel',
                          '{{value0}} access',
                          { value0: store.name }
                        )}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="read_write">
                          {translate(
                            'auto.components.cloud.sessions.new.readWrite',
                            'read & write'
                          )}
                        </SelectItem>
                        <SelectItem value="read">
                          {translate('auto.components.cloud.sessions.new.readOnly', 'read only')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      {catalog.vaults.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-sm">
            {translate('auto.components.cloud.sessions.new.vaults', 'Vaults')}
          </p>
          <div className="max-h-32 space-y-1 overflow-y-auto scrollbar-sleek pl-1">
            {catalog.vaults.map((vault) => (
              <label key={vault.id} className="flex items-center gap-2 text-xs">
                <Checkbox
                  checked={form.input.vaultIds.includes(vault.id)}
                  onCheckedChange={() => form.toggleVault(vault.id)}
                  aria-label={vault.displayName}
                />
                <span className="min-w-0 truncate">{vault.displayName}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}

      {provider?.capabilities.outcomes ? (
        <div className="space-y-1">
          <label className="flex items-center gap-2 text-xs font-medium text-foreground">
            <Checkbox
              checked={outcomeOn}
              onCheckedChange={(checked) => {
                const on = checked === true
                setOutcomeOn(on)
                form.setOutcome(on ? outcome : null)
              }}
            />
            {translate(
              'auto.components.cloud.sessions.new.grade',
              'Grade the result against acceptance criteria'
            )}
          </label>
          {outcomeOn ? (
            <div className="space-y-2 pl-6">
              <Textarea
                aria-label={translate(
                  'auto.components.cloud.sessions.new.rubric',
                  'Acceptance criteria'
                )}
                rows={3}
                value={outcome.rubric}
                placeholder={translate(
                  'auto.components.cloud.sessions.new.rubricPlaceholder',
                  '- /data/report.md exists\n- It cites a source for every claim'
                )}
                onChange={(event) => form.setOutcome({ ...outcome, rubric: event.target.value })}
              />
              <div className="flex items-center gap-2">
                <Label htmlFor="cloud-outcome-iterations">
                  {translate('auto.components.cloud.sessions.new.iterations', 'Max iterations')}
                </Label>
                <Input
                  id="cloud-outcome-iterations"
                  type="number"
                  min={1}
                  max={20}
                  className="h-7 w-20"
                  value={outcome.maxIterations}
                  onChange={(event) =>
                    form.setOutcome({ ...outcome, maxIterations: Number(event.target.value) || 1 })
                  }
                />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
