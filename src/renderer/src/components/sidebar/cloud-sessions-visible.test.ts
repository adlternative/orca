import { describe, expect, it } from 'vitest'
import { selectVisibleSessions } from './cloud-sessions-visible'

type Row = { id: string; state: string }

function rows(states: string[]): Row[] {
  return states.map((state, index) => ({ id: `s${index}`, state }))
}

describe('selectVisibleSessions', () => {
  it('trims idle rows past the limit', () => {
    const source = rows(Array.from({ length: 12 }, () => 'idle'))
    expect(selectVisibleSessions(source, false, 8)).toHaveLength(8)
  })

  it('never folds away a session waiting on a human', () => {
    const source = rows([
      'idle',
      'idle',
      'blocked',
      'idle',
      'idle',
      'blocked',
      'idle',
      'idle',
      'idle',
      'blocked'
    ])
    const visible = selectVisibleSessions(source, false, 4)
    expect(visible.filter((row) => row.state === 'blocked')).toHaveLength(3)
    // 4 rows inside the limit plus the 2 blocked ones that sit past it.
    expect(visible).toHaveLength(6)
  })

  it('keeps the vendor order instead of ranking by state', () => {
    const source = rows(['idle', 'blocked', 'idle', 'blocked'])
    expect(selectVisibleSessions(source, false, 2).map((row) => row.id)).toEqual(['s0', 's1', 's3'])
  })

  it('shows everything when expanded', () => {
    const source = rows(['idle', 'idle', 'idle', 'idle', 'idle'])
    expect(selectVisibleSessions(source, true, 2)).toHaveLength(5)
  })
})

describe('selectVisibleSessions provider floor', () => {
  const row = (
    id: string,
    provider: string,
    state = 'idle'
  ): { id: string; provider: string; state: string } => ({
    id,
    provider,
    state
  })

  it('keeps the newest rows of a provider that recency alone would hide', () => {
    const qoder = Array.from({ length: 10 }, (_, index) => row(`q${index}`, 'qoder-cloud'))
    const claude = Array.from({ length: 3 }, (_, index) => row(`c${index}`, 'claude-managed'))
    const visible = selectVisibleSessions([...qoder, ...claude], false, 8)
    expect(visible.map((session) => session.id)).toEqual([
      'q0',
      'q1',
      'q2',
      'q3',
      'q4',
      'q5',
      'q6',
      'q7',
      'c0',
      'c1',
      'c2'
    ])
  })

  it('leaves a single-provider list untouched', () => {
    const source = Array.from({ length: 10 }, (_, index) => row(`q${index}`, 'qoder-cloud'))
    expect(selectVisibleSessions(source, false, 8)).toHaveLength(8)
  })
})
