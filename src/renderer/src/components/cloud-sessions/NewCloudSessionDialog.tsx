import { useState } from 'react'
import { ChevronRight, Cloud, LoaderCircle } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { NewCloudSessionAdvanced } from './NewCloudSessionAdvanced'
import { useCloudTaskLaunch } from './use-cloud-task-launch'
import { cloudTaskValidationMessage } from './cloud-task-validation-message'

/** One launch surface for every provider; local workspace creation stays untouched. */
export function NewCloudSessionDialog({
  open,
  onOpenChange,
  initialProjectId = null
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialProjectId?: string | null
}): React.JSX.Element {
  const launch = useCloudTaskLaunch(open, initialProjectId, () => onOpenChange(false))
  const { form, catalog, descriptor } = launch
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const environment = catalog?.environments.find((entry) => entry.id === form.input.environmentId)
  const needsRepository =
    form.input.repository !== null && descriptor?.launchRequirements?.repositoryToken !== false
  const validation = launch.invalid ? cloudTaskValidationMessage(launch.invalid) : null
  const controls = descriptor?.launchRequirements
  const connected = launch.configured?.has(launch.provider) === true

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!launch.submitting) {
          onOpenChange(next)
        }
      }}
    >
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{translate('cloudTasks.newTask', 'New cloud task')}</DialogTitle>
          <DialogDescription>
            {translate(
              'cloudTasks.launchDescription',
              'Describe the work. The agent runs in the provider’s cloud, without creating a local workspace.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 overflow-y-auto scrollbar-sleek pr-1">
          <div className="space-y-1.5">
            <Label htmlFor="cloud-session-prompt">
              {translate('cloudTasks.task', 'What should the agent do?')}
            </Label>
            <Textarea
              id="cloud-session-prompt"
              autoFocus
              rows={4}
              disabled={launch.submitting}
              value={form.input.prompt}
              onChange={(event) => form.setField('prompt', event.target.value)}
              placeholder={translate(
                'cloudTasks.promptPlaceholder',
                'Fix a bug, investigate an issue, or prepare a pull request…'
              )}
            />
          </div>
          <fieldset disabled={launch.submitting} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cloud-task-project">
                  {translate('cloudTasks.project', 'Project')}
                </Label>
                <Select
                  value={launch.projectId ?? 'unassigned'}
                  onValueChange={(id) => launch.setProjectId(id === 'unassigned' ? null : id)}
                >
                  <SelectTrigger id="cloud-task-project" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">
                      {translate('cloudTasks.unassigned', 'Unassigned project')}
                    </SelectItem>
                    {launch.projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cloud-task-provider">
                  {translate('cloudTasks.provider', 'Cloud provider')}
                </Label>
                <Select value={launch.provider} onValueChange={launch.setProvider}>
                  <SelectTrigger id="cloud-task-provider" className="w-full">
                    <Cloud className="size-3.5" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {launch.providers.map((provider) => (
                      <SelectItem key={provider.id} value={provider.id}>
                        {provider.label}
                        {launch.configured && !launch.configured.has(provider.id)
                          ? ` · ${translate('cloudTasks.notConnected', 'Not connected')}`
                          : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {launch.configured !== null && !connected ? (
              <div className="space-y-2 text-sm text-muted-foreground" role="status">
                <p>
                  {translate(
                    'cloudTasks.connectFirst',
                    'Connect this provider in Settings → Integrations to start a task.'
                  )}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onOpenChange(false)
                    useAppStore.getState().setActiveView('settings')
                  }}
                >
                  {translate('cloudTasks.openSettings', 'Open settings')}
                </Button>
              </div>
            ) : launch.loadFailure ? (
              <div role="alert" className="space-y-2 text-sm text-destructive">
                <p>{launch.loadFailure}</p>
                <Button variant="outline" size="sm" onClick={launch.retry}>
                  {translate('cloudTasks.retry', 'Retry')}
                </Button>
              </div>
            ) : !catalog ? (
              <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
                <LoaderCircle className="size-3.5 animate-spin" />
                {translate('auto.components.cloud.sessions.new.loading', 'Reading the catalog…')}
              </p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  {controls?.template !== false ? (
                    <div className="space-y-1.5">
                      <Label htmlFor="cloud-agent-template">
                        {translate('auto.components.cloud.sessions.new.agent', 'Agent')}
                      </Label>
                      <Select
                        value={form.input.templateId}
                        onValueChange={(id) => form.setTemplate(id, catalog.templates)}
                      >
                        <SelectTrigger id="cloud-agent-template" className="w-full">
                          <SelectValue
                            placeholder={translate('cloudTasks.noAgents', 'No agents available')}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {catalog.templates.map((entry) => (
                            <SelectItem key={entry.id} value={entry.id}>
                              {entry.name}
                              {entry.model ? ` · ${entry.model}` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                  {controls?.environment !== false ? (
                    <div className="space-y-1.5">
                      <Label htmlFor="cloud-agent-environment">
                        {translate('auto.components.cloud.sessions.new.environment', 'Environment')}
                      </Label>
                      <Select
                        value={form.input.environmentId}
                        onValueChange={(id) => form.setField('environmentId', id)}
                      >
                        <SelectTrigger id="cloud-agent-environment" className="w-full">
                          <SelectValue
                            placeholder={translate(
                              'cloudTasks.noEnvironments',
                              'No environments available'
                            )}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {catalog.environments.map((entry) => (
                            <SelectItem key={entry.id} value={entry.id}>
                              {entry.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                </div>
                {environment?.description ? (
                  <p className="text-xs text-muted-foreground">{environment.description}</p>
                ) : null}
                {launch.cloneUrl ? (
                  <p className="break-all text-xs text-muted-foreground">
                    {translate('cloudTasks.repositoryPrefill', 'Repository from project: {{url}}', {
                      url: launch.cloneUrl
                    })}
                  </p>
                ) : null}
                {needsRepository ? (
                  <p className="text-xs text-muted-foreground">
                    {translate(
                      'cloudTasks.repositoryAuth',
                      'This provider needs a repository token. Add it under Advanced before starting.'
                    )}
                  </p>
                ) : null}
                <details
                  open={advancedOpen}
                  onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
                  className="rounded-md border px-3 py-2"
                >
                  <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium">
                    <ChevronRight className={`size-3.5 ${advancedOpen ? 'rotate-90' : ''}`} />
                    {translate('cloudTasks.advanced', 'Advanced options')}
                  </summary>
                  {advancedOpen ? (
                    <div className="space-y-4 pt-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="cloud-session-title">
                          {translate('auto.components.cloud.sessions.new.name', 'Name (optional)')}
                        </Label>
                        <Input
                          id="cloud-session-title"
                          value={form.input.title}
                          onChange={(event) => form.setField('title', event.target.value)}
                        />
                      </div>
                      <NewCloudSessionAdvanced
                        key={launch.provider}
                        catalog={catalog}
                        form={form}
                      />
                    </div>
                  ) : null}
                </details>
              </>
            )}
          </fieldset>
          {validation && form.touched && connected && catalog ? (
            <p className="text-xs text-muted-foreground">{validation}</p>
          ) : null}
          {launch.submitError ? (
            <p role="alert" className="text-sm text-destructive">
              {launch.submitError}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" disabled={launch.submitting} onClick={() => onOpenChange(false)}>
            {translate('auto.components.cloud.sessions.new.cancel', 'Cancel')}
          </Button>
          <Button disabled={!launch.canSubmit} onClick={() => void launch.submit()}>
            {launch.submitting ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Cloud className="size-4" />
            )}
            {translate('cloudTasks.startTask', 'Start cloud task')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
