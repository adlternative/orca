import { useCallback } from 'react'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { getCloudAgentProvider } from '../../../../shared/cloud-agent-provider-registry'
import { useLatestCloudSessions } from '../sidebar/use-cloud-sessions-feed'
import { CloudSessionDrawerBody } from './CloudSessionDrawer'
import { useCloudSessionDetail } from './use-cloud-session-detail'
import {
  associateCloudSession,
  cloudSessionKey,
  useCloudSessionProjects
} from './cloud-session-context'

/** Cloud selection owns the main region, independently of the local workspace and sidebar. */
export default function CloudSessionPanel(): React.JSX.Element | null {
  const sessionId = useAppStore((s) => s.openCloudSessionId)
  const provider = useAppStore((s) => s.openCloudSessionProvider)
  const closeSession = useAppStore((s) => s.setOpenCloudSessionId)
  const projects = useAppStore((s) => s.projects)
  const launchWarning = useAppStore((s) => s.cloudSessionLaunchWarning)
  const associations = useCloudSessionProjects()
  const sessions = useLatestCloudSessions()
  const row =
    sessions.find((entry) => entry.id === sessionId && entry.provider === provider) ?? null
  const detail = useCloudSessionDetail(sessionId, row === null, provider)
  const close = useCallback(() => closeSession(null), [closeSession])
  if (!sessionId || !provider) {
    return null
  }
  const key = cloudSessionKey(provider, sessionId)
  const projectId = associations[key]
  const selectedProject = projects.some((project) => project.id === projectId)
    ? projectId
    : 'unassigned'

  return (
    <section data-cloud-session-panel="" className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="flex items-center gap-2 border-b px-4 py-2 text-xs text-muted-foreground">
        <Select
          value={selectedProject}
          onValueChange={(value) =>
            associateCloudSession(provider, sessionId, value === 'unassigned' ? null : value)
          }
        >
          <SelectTrigger size="sm" aria-label={translate('cloudTasks.project', 'Project')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unassigned">
              {translate('cloudTasks.unassigned', 'Unassigned project')}
            </SelectItem>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.displayName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="truncate">{getCloudAgentProvider(provider)?.label ?? provider}</span>
      </div>
      {launchWarning ? (
        <p role="alert" className="border-b px-4 py-3 text-sm text-muted-foreground">
          {launchWarning}
        </p>
      ) : null}
      <CloudSessionDrawerBody
        key={key}
        sessionId={sessionId}
        row={row ?? detail}
        provider={provider}
        onClose={close}
      />
    </section>
  )
}
