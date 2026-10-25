// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CloudAgentProviderCapabilities } from '../../../../shared/cloud-agent-provider'
import { CloudSessionControls } from './CloudSessionControls'

const ALL: CloudAgentProviderCapabilities = {
  readTranscript: true,
  liveTail: true,
  createSession: false,
  sendMessage: true,
  approveToolCall: true,
  cancelTurn: true,
  archiveSession: true,
  modelSelection: true,
  sessionResources: [],
  outcomes: true,
  schedules: true
}

function actions(): Parameters<typeof CloudSessionControls>[0]['actions'] {
  return { pending: null, failure: null, lastSentAt: null, run: vi.fn(), dismissFailure: vi.fn() }
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  // Why: match the existing renderer component harness — createRoot, not a testing-library render.
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function renderControls(
  overrides: {
    capabilities?: Partial<CloudAgentProviderCapabilities>
    state?: 'working' | 'blocked' | 'idle' | 'unknown' | 'ended'
    pendingToolCallIds?: string[]
    pendingTool?: string | null
    sessionId?: string
  } = {}
): void {
  act(() => {
    root.render(
      <CloudSessionControls
        capabilities={{ ...ALL, ...overrides.capabilities }}
        sessionId={overrides.sessionId ?? 'sess_test'}
        state={overrides.state ?? 'idle'}
        pendingToolCallIds={overrides.pendingToolCallIds ?? []}
        pendingTool={overrides.pendingTool ?? null}
        modelId={null}
        actions={actions()}
      />
    )
  })
}

function byName(name: RegExp): HTMLElement | null {
  return (
    [...container.querySelectorAll<HTMLElement>('button, textarea, input')].find((element) =>
      name.test(element.getAttribute('aria-label') ?? element.textContent ?? '')
    ) ?? null
  )
}

describe('CloudSessionControls capability gates', () => {
  it('offers the composer only while the session is idle', () => {
    renderControls({ state: 'idle' })
    expect(container.querySelector('textarea')?.disabled).toBe(false)
  })

  it('disables the composer mid-turn and offers cancel instead', () => {
    renderControls({ state: 'working' })
    expect(container.querySelector('textarea')?.disabled).toBe(true)
    expect(byName(/cancel turn/i)).not.toBeNull()
  })

  it('offers approve and deny only when a pending tool id is known', () => {
    renderControls({ state: 'blocked' })
    expect(byName(/^approve$/i)).toBeNull()
    act(() => root.unmount())
    root = createRoot(container)
    renderControls({ state: 'blocked', pendingToolCallIds: ['evt_tool'] })
    expect(byName(/^approve$/i)).not.toBeNull()
    expect(byName(/^deny$/i)).not.toBeNull()
  })

  it('keeps a disabled composer under the approval decision', () => {
    renderControls({ state: 'blocked', pendingToolCallIds: ['evt_tool'] })
    expect(byName(/^approve$/i)).not.toBeNull()
    const composer = container.querySelector('textarea')
    expect(composer?.disabled).toBe(true)
    // Why: a blocked session is not "working"; the placeholder must name the decision.
    expect(composer?.placeholder).toMatch(/approve/i)
  })

  it('sends on Enter and keeps Shift+Enter for a new line', () => {
    const run = vi.fn(async () => true)
    act(() => {
      root.render(
        <CloudSessionControls
          capabilities={ALL}
          sessionId="sess_test"
          state="idle"
          pendingToolCallIds={[]}
          modelId={null}
          pendingTool={null}
          actions={{ ...actions(), run }}
        />
      )
    })
    const textarea = container.querySelector('textarea')
    if (!textarea) {
      throw new Error('composer missing')
    }
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
    act(() => {
      setValue?.call(textarea, 'ping')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => {
      textarea.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
      )
    })
    expect(run).toHaveBeenCalledWith({ kind: 'send-message', text: 'ping' })
    run.mockClear()
    act(() => {
      textarea.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          shiftKey: true,
          bubbles: true,
          cancelable: true
        })
      )
    })
    expect(run).not.toHaveBeenCalled()
  })

  it("keeps each session's draft to itself", () => {
    renderControls({ sessionId: 'sess_a' })
    const textarea = container.querySelector('textarea')
    if (!textarea) {
      throw new Error('no composer')
    }
    act(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
      set?.call(textarea, 'draft for A')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(container.querySelector('textarea')?.value).toBe('draft for A')

    renderControls({ sessionId: 'sess_b' })
    expect(container.querySelector('textarea')?.value).toBe('')

    renderControls({ sessionId: 'sess_a' })
    expect(container.querySelector('textarea')?.value).toBe('draft for A')
  })

  it('names the tool call the approval bar would answer', () => {
    renderControls({
      state: 'blocked',
      pendingToolCallIds: ['call_1', 'call_2'],
      pendingTool: 'Bash rm -rf /tmp/build'
    })
    const bar = container.querySelector('[data-cloud-session-controls]')
    expect(bar?.textContent).toContain('Bash rm -rf /tmp/build')
    expect(bar?.textContent).toContain('(1/2)')
  })

  it('disables the composer for a session that has ended', () => {
    renderControls({ state: 'ended' })
    const composer = container.querySelector('textarea')
    expect(composer?.disabled).toBe(true)
    expect(composer?.placeholder).toMatch(/ended/i)
  })

  it('hides an action the provider does not declare', () => {
    renderControls({
      state: 'blocked',
      pendingToolCallIds: ['evt_tool'],
      capabilities: { approveToolCall: false }
    })
    expect(byName(/^approve$/i)).toBeNull()
  })

  it('renders nothing when no write is possible and nothing failed', () => {
    renderControls({
      capabilities: { sendMessage: false, approveToolCall: false, cancelTurn: false }
    })
    expect(container.querySelector('[data-cloud-session-controls]')).toBeNull()
  })
})
