import { FileText, LoaderCircle, Paperclip } from 'lucide-react'
import type { CloudDeliveredArtifact } from '../../../../shared/qoder-cloud-transcript'
import { formatBytes } from '@/components/status-bar/workspace-space-format'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { useCloudAgentFileLink } from './use-cloud-agent-file-link'

function ArtifactTile({ artifact }: { artifact: CloudDeliveredArtifact }): React.JSX.Element {
  const image = Boolean(artifact.mimeType?.startsWith('image/'))
  // Why: the strip is small and sits at the top, so every tile resolves eagerly.
  const link = useCloudAgentFileLink(artifact.fileId, true)
  const url = link.phase === 'ready' ? link.link.url : null
  const label =
    artifact.sizeBytes !== null
      ? `${artifact.filename} · ${formatBytes(artifact.sizeBytes)}`
      : artifact.filename
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          disabled={!url}
          onClick={() => url && void window.api.shell.openUrl(url)}
          aria-label={translate('auto.components.cloud.sessions.artifact.open', 'Open {{value0}}', {
            value0: artifact.filename
          })}
          className="relative size-12 shrink-0 overflow-hidden rounded-md border border-border bg-muted/20 text-muted-foreground transition-colors hover:border-ring disabled:cursor-default"
        >
          {image && url ? (
            // Why: absolute fill, not flex sizing — a flex child <img> collapses to 0 width before load.
            <img
              src={url}
              alt=""
              loading="lazy"
              className="absolute inset-0 size-full object-cover"
            />
          ) : link.phase === 'loading' ? (
            <LoaderCircle className="absolute inset-0 m-auto size-4 animate-spin" />
          ) : (
            <FileText className="absolute inset-0 m-auto size-5" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}

/** Deliverables first: what the session produced, before how it got there. */
export function CloudArtifactsStrip({
  artifacts
}: {
  artifacts: readonly CloudDeliveredArtifact[]
}): React.JSX.Element | null {
  if (artifacts.length === 0) {
    return null
  }
  return (
    <section
      aria-label={translate('auto.components.cloud.sessions.artifacts.label', 'Delivered files')}
      className="border-b border-worktree-sidebar-border px-3 py-2"
    >
      <p className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Paperclip className="size-3.5" />
        {translate('auto.components.cloud.sessions.artifacts.count', '{{value0}} delivered files', {
          value0: String(artifacts.length)
        })}
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {artifacts.map((artifact) => (
          <ArtifactTile key={artifact.fileId} artifact={artifact} />
        ))}
      </div>
    </section>
  )
}
