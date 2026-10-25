// Incremental Server-Sent Events parser (WHATWG EventSource framing), used for the Qoder
// Cloud session stream. Node has no EventSource with custom headers, so the main process
// reads the fetch body and feeds chunks here.

export type SseFrame = { id: string | null; event: string | null; data: string }

export class SseFrameParser {
  private buffer = ''
  private id: string | null = null
  private event: string | null = null
  private data: string[] = []

  /** Feed a chunk; returns every frame completed by it. */
  push(chunk: string): SseFrame[] {
    this.buffer += chunk
    const frames: SseFrame[] = []
    let newline = this.buffer.indexOf('\n')
    while (newline !== -1) {
      let line = this.buffer.slice(0, newline)
      this.buffer = this.buffer.slice(newline + 1)
      if (line.endsWith('\r')) {
        line = line.slice(0, -1)
      }
      const frame = this.line(line)
      if (frame) {
        frames.push(frame)
      }
      newline = this.buffer.indexOf('\n')
    }
    return frames
  }

  private line(line: string): SseFrame | null {
    if (line === '') {
      if (this.data.length === 0 && this.event === null) {
        this.id = null
        return null
      }
      const frame = { id: this.id, event: this.event, data: this.data.join('\n') }
      this.event = null
      this.data = []
      return frame
    }
    if (line.startsWith(':')) {
      return null // comment / keep-alive
    }
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) {
      value = value.slice(1)
    }
    switch (field) {
      case 'id':
        // Why: the spec ignores ids containing NUL; everything else is opaque.
        if (!value.includes('\0')) {
          this.id = value
        }
        break
      case 'event':
        this.event = value
        break
      case 'data':
        this.data.push(value)
        break
      default:
        break // `retry` and unknown fields: the reconnect policy is Orca's, not the server's.
    }
    return null
  }
}
