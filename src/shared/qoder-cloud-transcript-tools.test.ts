import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { QoderCloudEvent } from './qoder-cloud-events'
import { parseQoderCloudEventPage } from './qoder-cloud-event-parser'
import {
  CLOUD_NOTICE_PRESENTATION,
  decodeQoderCloudTranscript,
  parseWebSearchResults
} from './qoder-cloud-transcript'

function fixture(name: string): QoderCloudEvent[] {
  const page = parseQoderCloudEventPage(
    JSON.parse(readFileSync(join(__dirname, '__fixtures__', 'qoder-cloud', name), 'utf-8'))
  )
  if (!page) {
    throw new Error('fixture did not parse')
  }
  return page.events
}

describe('tool-rich transcripts (live captures)', () => {
  it('decodes every event in the ImageGen + DeliverArtifacts capture', () => {
    const events = fixture('events-imagegen-artifacts.json')
    expect(events.filter((e) => e.type === 'other')).toEqual([])
    const messages = decodeQoderCloudTranscript(events)
    const artifacts = messages.filter(
      (m) =>
        m.blocks[0].type === 'text' &&
        m.blocks[0].presentation === CLOUD_NOTICE_PRESENTATION.artifact
    )
    expect(artifacts).toHaveLength(3)
    const first = artifacts[0].blocks[0]
    // Why: the view resolves a signed URL from the id; the MIME type lets it pick an image preview.
    expect(first.type === 'text' && first.caption).toMatch(/^file_/)
    expect(first.type === 'text' && first.tone).toBe('image/png')
    expect(first.type === 'text' && first.text).toMatch(/\.png$/)
    const imageGen = messages.find(
      (m) => m.blocks[0].type === 'tool-call' && m.blocks[0].name === 'ImageGen'
    )
    expect(imageGen?.blocks[0].type === 'tool-call' && imageGen.blocks[0].state).toBe('completed')
  })

  it('lifts WebSearch hits into the tool call so the row renders a link list', () => {
    const messages = decodeQoderCloudTranscript(fixture('events-websearch.json'))
    const search = messages.find(
      (m) => m.blocks[0].type === 'tool-call' && m.blocks[0].name === 'WebSearch'
    )
    const block = search?.blocks[0]
    expect(block?.type === 'tool-call' && block.webSearchResults?.length).toBeGreaterThan(0)
    expect(block?.type === 'tool-call' && block.webSearchResults?.[0]).toMatchObject({
      title: expect.any(String),
      url: expect.stringMatching(/^https?:/)
    })
    const fetch = messages.find(
      (m) => m.blocks[0].type === 'tool-call' && m.blocks[0].name === 'WebFetch'
    )
    expect(
      fetch?.blocks[0].type === 'tool-call' && fetch.blocks[0].webSearchResults
    ).toBeUndefined()
  })

  it('parses the vendor result text defensively', () => {
    expect(
      parseWebSearchResults('Web search results for "x":\n\n[{"title":"A","url":"https://a"}]')
    ).toEqual([{ title: 'A', url: 'https://a' }])
    expect(parseWebSearchResults('no json here')).toEqual([])
    expect(parseWebSearchResults('[not json')).toEqual([])
    expect(parseWebSearchResults('[{"title":"missing url"}]')).toEqual([])
  })

  it('renders errors, client tools, compaction and config updates', () => {
    const events = fixture('events-misc.json')
    expect(events.map((e) => e.type)).toEqual([
      'session.error',
      'agent.custom_tool_use',
      'user.custom_tool_result',
      'agent.thread_context_compacted',
      'session.updated'
    ])
    const messages = decodeQoderCloudTranscript(events)
    const [error, clientTool, clientResult, compaction, updated] = messages
    expect(error.blocks[0]).toMatchObject({
      presentation: CLOUD_NOTICE_PRESENTATION.error,
      tone: 'error',
      caption: 'exhausted'
    })
    expect(error.blocks[0].type === 'text' && error.blocks[0].text).toMatch(/^github: /)
    const clientCall = clientTool.blocks[0]
    expect(clientCall).toMatchObject({
      type: 'tool-call',
      name: 'nm_shell_execute',
      mcpIdentity: { server: 'client' },
      state: 'completed'
    })
    // Why: the tool title is the agent's own copy (captured verbatim); assert it is carried
    // through rather than restating it here.
    const callEvent = events[1]
    expect(callEvent.type === 'agent.custom_tool_use' && callEvent.title).toBeTruthy()
    expect(clientCall.type === 'tool-call' && clientCall.mcpIdentity?.tool).toBe(
      callEvent.type === 'agent.custom_tool_use' ? callEvent.title : null
    )
    expect(clientResult.role).toBe('tool')
    expect(compaction.blocks[0]).toMatchObject({ presentation: 'compaction' })
    expect(updated.blocks[0]).toMatchObject({
      presentation: CLOUD_NOTICE_PRESENTATION.updated,
      caption: '11',
      text: 'Browser1 · dfmodel'
    })
  })
})
