// @vitest-environment happy-dom

import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { CloudOutcome } from '../../../../shared/cloud-agent-outcome'
import { CloudOutcomeBanner } from './CloudOutcomeBanner'

function outcome(overrides: Partial<CloudOutcome> = {}): CloudOutcome {
  return {
    id: 'out_1',
    description: 'The recipe must state a grind size and a water temperature.',
    rubric: null,
    maxIterations: 3,
    definedAt: null,
    result: 'failed',
    terminal: true,
    iterations: [
      {
        iteration: 1,
        result: 'failed',
        explanation: null,
        credits: null,
        startedAt: null,
        endedAt: null
      }
    ],
    explanation: 'The grind size note was missing from the recipe.',
    evaluating: false,
    completedAt: null,
    ...overrides
  }
}

describe('CloudOutcomeBanner', () => {
  it('answers the reviewer question with a verdict, the criteria and the reason', () => {
    const { container } = render(<CloudOutcomeBanner outcome={outcome()} />)
    const text = container.textContent ?? ''
    expect(text).toMatch(/Cannot be satisfied/)
    expect(text).toContain('The recipe must state a grind size')
    expect(text).toContain('The grind size note was missing')
    expect(text).toMatch(/iteration 1 of 3/)
  })

  it('keeps the criteria for a pass instead of only shouting the verdict', () => {
    const { container } = render(
      <CloudOutcomeBanner outcome={outcome({ result: 'satisfied', terminal: true })} />
    )
    const text = container.textContent ?? ''
    expect(text).toMatch(/Criteria met/)
    expect(text).toContain('The recipe must state a grind size')
  })

  it('spells out the graded iteration count for a long run', () => {
    const { container } = render(
      <CloudOutcomeBanner
        outcome={outcome({
          result: 'needs_revision',
          maxIterations: 5,
          iterations: Array.from({ length: 4 }, (_, i) => ({
            iteration: i + 1,
            result: 'needs_revision' as const,
            explanation: null,
            credits: null,
            startedAt: null,
            endedAt: null
          }))
        })}
      />
    )
    expect(container.textContent).toMatch(/iteration 4 of 5/)
  })
})
