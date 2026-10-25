import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { activeCloudOutcome } from './cloud-agent-outcome'
import { projectCloudOutcomes } from './qoder-cloud-outcome'
import type { QoderCloudEvent } from './qoder-cloud-events'
import { parseQoderCloudEventPage } from './qoder-cloud-event-parser'
import { CLOUD_OUTCOME_PRESENTATION, decodeQoderCloudTranscript } from './qoder-cloud-transcript'

function fixture(name: string): QoderCloudEvent[] {
  const page = parseQoderCloudEventPage(
    JSON.parse(readFileSync(join(__dirname, '__fixtures__', 'qoder-cloud', name), 'utf-8'))
  )
  if (!page) {
    throw new Error('fixture did not parse')
  }
  return page.events
}

describe('projectCloudOutcomes (live captures)', () => {
  it('folds a satisfied outcome: defined → evaluating → terminal verdict', () => {
    const events = fixture('events-outcome-satisfied.json')
    // Why: every new event type in this capture must decode; a silent `other` would hide a regression.
    expect(events.filter((e) => e.type === 'other')).toEqual([])
    const [outcome] = projectCloudOutcomes(events)
    expect(outcome).toMatchObject({
      id: 'outc_00szzlkjwaakhlhd0fu4',
      // Why: the capture is in the vendor user's own language; match the language-neutral tail.
      maxIterations: 1,
      result: 'satisfied',
      terminal: true,
      evaluating: false
    })
    expect(outcome.description).toMatch(/DONE$/)
    expect(outcome.rubric?.type === 'text' && outcome.rubric.content).toContain('/data/ok.txt')
    expect(outcome.iterations).toHaveLength(1)
    expect(outcome.iterations[0]).toMatchObject({
      iteration: 0,
      result: 'satisfied',
      credits: 1.09
    })
    expect(outcome.iterations[0].startedAt).not.toBeNull()
    expect(outcome.completedAt).toBe(outcome.iterations[0].endedAt)
    expect(activeCloudOutcome([outcome])).toBeNull()
  })

  it('reports the iteration limit as a terminal failure with the grader explanation', () => {
    const [outcome] = projectCloudOutcomes(fixture('events-outcome-max-iterations.json'))
    expect(outcome.result).toBe('max_iterations_reached')
    expect(outcome.terminal).toBe(true)
    expect(outcome.explanation).toContain('DeliverArtifacts')
  })

  it('shows grading in progress while an evaluation span is open', () => {
    const events = fixture('events-outcome-satisfied.json')
    const cutoff = events.findIndex((e) => e.type === 'span.outcome_evaluation_end')
    const [outcome] = projectCloudOutcomes(events.slice(0, cutoff))
    expect(outcome).toMatchObject({ result: 'evaluating', evaluating: true, terminal: false })
    expect(activeCloudOutcome([outcome])?.id).toBe(outcome.id)
  })

  it('treats needs_revision as another agent turn, not a verdict', () => {
    const events = fixture('events-outcome-satisfied.json')
    const end = events.find((e) => e.type === 'span.outcome_evaluation_end')
    if (!end || end.type !== 'span.outcome_evaluation_end') {
      throw new Error('fixture lacks an evaluation end')
    }
    const revised = events.map((e) =>
      e === end ? { ...end, result: 'needs_revision' as const } : e
    )
    const [outcome] = projectCloudOutcomes(revised)
    expect(outcome.result).toBe('running')
    expect(outcome.terminal).toBe(false)
    expect(outcome.iterations[0].result).toBe('needs_revision')
  })
})

describe('decodeQoderCloudTranscript with outcomes', () => {
  it('renders the goal as the user turn, the rubric and verdict as system notices', () => {
    const messages = decodeQoderCloudTranscript(fixture('events-outcome-satisfied.json'))
    const roles = messages.map((m) => m.role)
    expect(roles[0]).toBe('user')
    expect(roles[1]).toBe('system')
    const rubric = messages[1].blocks[0]
    expect(rubric.type === 'text' && rubric.presentation).toBe(CLOUD_OUTCOME_PRESENTATION.defined)
    expect(rubric.type === 'text' && rubric.text).toContain('/data/ok.txt')
    expect(rubric.type === 'text' && rubric.caption).toBe('1')
    const verdict = messages.findLast(
      (m) =>
        m.blocks[0].type === 'text' &&
        m.blocks[0].presentation === CLOUD_OUTCOME_PRESENTATION.verdict
    )
    expect(verdict?.blocks[0].type === 'text' && verdict.blocks[0].tone).toBe('notice')
    expect(verdict?.blocks[0].type === 'text' && verdict.blocks[0].caption).toBe('satisfied:0')
    expect(verdict?.blocks[0].type === 'text' && verdict.blocks[0].text).toContain('/data/ok.txt')
    // Two messages from one event must not collide on id.
    expect(new Set(messages.map((m) => m.id)).size).toBe(messages.length)
  })

  it('renders a delivered artifact as a resolvable notice', () => {
    const messages = decodeQoderCloudTranscript(fixture('events-outcome-satisfied.json'))
    const artifact = messages.find(
      (m) => m.blocks[0].type === 'text' && m.blocks[0].presentation === 'cloud-artifact'
    )
    expect(artifact?.blocks[0]).toMatchObject({ text: 'ok.txt', tone: 'text/plain' })
    expect(artifact?.blocks[0].type === 'text' && artifact.blocks[0].caption).toMatch(/^file_/)
  })

  it('colours the iteration-limit verdict as a warning', () => {
    const messages = decodeQoderCloudTranscript(fixture('events-outcome-max-iterations.json'))
    const verdict = messages.findLast(
      (m) =>
        m.blocks[0].type === 'text' &&
        m.blocks[0].presentation === CLOUD_OUTCOME_PRESENTATION.verdict
    )
    expect(verdict?.blocks[0].type === 'text' && verdict.blocks[0].tone).toBe('warning')
  })
})
