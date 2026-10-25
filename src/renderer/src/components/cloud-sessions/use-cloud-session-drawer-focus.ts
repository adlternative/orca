import { useEffect, useRef } from 'react'

/**
 * Hands focus back to the session's sidebar row when the drawer closes.
 *
 * Why: the drawer opens from store state (`openCloudSessionId`) rather than a Radix trigger,
 * so Radix has nothing to restore focus to — Escape used to drop focus on `<body>` and the next
 * Tab restarted at the top of the page.
 */
export function useCloudSessionDrawerFocusReturn(open: boolean, sessionId: string | null): void {
  const openerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    const active = document.activeElement
    openerRef.current = active instanceof HTMLElement && active !== document.body ? active : null
    const openedSessionId = sessionId
    return () => {
      const row =
        openedSessionId === null
          ? null
          : document.querySelector<HTMLElement>(
              `[data-cloud-session-row="${CSS.escape(openedSessionId)}"]`
            )
      const opener = openerRef.current
      const target = row ?? (opener?.isConnected ? opener : null)
      target?.focus()
    }
  }, [open, sessionId])
}
