// @vitest-environment happy-dom

import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { CloudAgentSessionRow } from '../../../../shared/qoder-cloud-types'
import { CloudSessionRow } from './CloudSessionRow'

function row(overrides: Partial<CloudAgentSessionRow> = {}): CloudAgentSessionRow {
  return {
    id: 'sess_row_test01',
    provider: 'qoder-cloud',
    title: 'Deploy to prod',
    state: 'idle',
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    ...overrides
  } as CloudAgentSessionRow
}

function rendered(session: CloudAgentSessionRow): string {
  const { container } = render(
    <TooltipProvider>
      <ul>
        <CloudSessionRow session={session} stale={false} />
      </ul>
    </TooltipProvider>
  )
  return container.textContent ?? ''
}

describe('CloudSessionRow', () => {
  it('names the approval state in words, not colour alone', () => {
    expect(rendered(row({ state: 'blocked' }))).toMatch(/Needs approval/)
  })

  it('shows each platform without hovering or relying on the task title', () => {
    for (const [provider, label] of [
      ['qoder-cloud', 'Qoder'],
      ['claude-managed', 'Claude'],
      ['openhands-cloud', 'OpenHands']
    ]) {
      expect(rendered(row({ provider }))).toContain(label)
    }
  })

  it('keeps idle rows free of state words', () => {
    const text = rendered(row())
    expect(text).not.toMatch(/Needs approval/)
    expect(text).toContain('Deploy to prod')
  })
})
