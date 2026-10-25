import { useEffect, useRef, useState } from 'react'
import { Download, FileText, ImageOff, LoaderCircle } from 'lucide-react'
import type { NativeChatTextBlock } from '../../../../shared/native-chat-types'
import { formatBytes } from '@/components/status-bar/workspace-space-format'
import { translate } from '@/i18n/i18n'
import { ExpandableMarkdownImage } from '@/components/sidebar/MarkdownImageLightbox'
import { useCloudAgentFileLink } from './use-cloud-agent-file-link'

function isImageMime(mime: string | undefined): boolean {
  return Boolean(mime && mime.startsWith('image/'))
}

/**
 * A file the cloud agent delivered. Images preview inline once the row is near the
 * viewport (the URL is short-lived, so it is resolved lazily and refreshed); other
 * files are a name, a size and a download that opens the signed URL in the browser.
 */
export function CloudArtifactNotice({ block }: { block: NativeChatTextBlock }): React.JSX.Element {
  const fileId = block.caption ?? null
  const filename = block.text
  const image = isImageMime(block.tone)
  const ref = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(false)
  useEffect(() => {
    const node = ref.current
    if (!node || typeof IntersectionObserver === 'undefined') {
      setNear(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true)
          observer.disconnect()
        }
      },
      { rootMargin: '400px' }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  const link = useCloudAgentFileLink(fileId, near)
  const url = link.phase === 'ready' ? link.link.url : null
  const size = link.phase === 'ready' ? link.link.sizeBytes : null
  const open = (): void => {
    if (url) {
      void window.api.shell.openUrl(url)
    }
  }
  const openLabel = translate('auto.components.cloud.sessions.artifact.open', 'Open {{value0}}', {
    value0: filename
  })

  return (
    <div ref={ref} data-cloud-artifact={fileId ?? undefined} className="max-w-md">
      {image ? (
        <div className="overflow-hidden rounded-md border border-border bg-muted/20">
          {/* Why: the tile promised "zoom in" with a cursor but opened a browser tab; images now
              zoom in place, the way every other image in the app does. */}
          {url ? (
            <ExpandableMarkdownImage
              src={url}
              alt={filename}
              className="block max-h-72 w-auto max-w-full object-contain"
              triggerClassName="my-0 block w-full"
            />
          ) : (
            <div className="flex h-32 w-48 items-center justify-center text-muted-foreground">
              {link.phase === 'error' ? (
                <ImageOff className="size-5" />
              ) : (
                <LoaderCircle className="size-5 animate-spin" />
              )}
            </div>
          )}
          <div className="flex items-center justify-between gap-2 px-2 py-1 text-[11px] text-muted-foreground">
            <span className="truncate">{filename}</span>
            <span className="flex shrink-0 items-center gap-1.5">
              {size !== null ? <span>{formatBytes(size)}</span> : null}
              <button
                type="button"
                onClick={open}
                disabled={!url}
                aria-label={openLabel}
                className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground disabled:opacity-40"
              >
                <Download className="size-3.5" />
              </button>
            </span>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2 text-sm">
          <FileText className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{filename}</span>
          {size !== null ? (
            <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(size)}</span>
          ) : null}
          <button
            type="button"
            onClick={open}
            disabled={!url}
            aria-label={openLabel}
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground disabled:opacity-40"
          >
            {link.phase === 'loading' ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <Download className="size-3.5" />
            )}
          </button>
        </div>
      )}
      {link.phase === 'error' ? (
        <p className="mt-1 text-xs text-destructive">{link.message}</p>
      ) : null}
    </div>
  )
}
