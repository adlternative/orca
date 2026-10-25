import type { NativeChatTextBlock } from './native-chat-types'
import type { QoderCloudEvent, QoderCloudOutcomeResult } from './qoder-cloud-events'

/** `presentation` values this decoder stamps on system notices; the view narrows on them. */
export const CLOUD_OUTCOME_PRESENTATION = {
  defined: 'cloud-outcome-defined',
  verdict: 'cloud-outcome-verdict'
} as const

/** Notices that are not outcomes; the view narrows on these. */
export const CLOUD_NOTICE_PRESENTATION = {
  /** `caption` = vendor file id; `text` = filename. The view resolves a URL on demand. */
  artifact: 'cloud-artifact',
  /** Vendor-side failure; `caption` = `exhausted` when it will not retry. */
  error: 'cloud-session-error',
  /** Agent configuration changed mid-session. */
  updated: 'cloud-session-updated'
} as const

function verdictTone(result: QoderCloudOutcomeResult): NativeChatTextBlock['tone'] {
  switch (result) {
    case 'satisfied':
      return 'notice'
    case 'needs_revision':
    case 'max_iterations_reached':
    case 'interrupted':
      return 'warning'
    case 'failed':
      return 'error'
    case 'pending':
    case 'running':
    case 'evaluating':
      return 'notice'
  }
}

/**
 * System-notice block for the vendor events that are facts about the session rather than
 * conversation. Copy lives in the view; these blocks carry data in `caption`/`tone`.
 */
export function cloudNoticeBlock(event: QoderCloudEvent): NativeChatTextBlock | null {
  switch (event.type) {
    case 'user.define_outcome':
      return event.rubric?.type === 'text'
        ? {
            type: 'text',
            presentation: CLOUD_OUTCOME_PRESENTATION.defined,
            text: event.rubric.content,
            ...(event.max_iterations !== null ? { caption: String(event.max_iterations) } : {})
          }
        : null
    case 'span.outcome_evaluation_end':
      return {
        type: 'text',
        presentation: CLOUD_OUTCOME_PRESENTATION.verdict,
        tone: verdictTone(event.result),
        // Why: `<result>:<iteration>` is data; the view owns the wording.
        caption: `${event.result}:${event.iteration}`,
        text: event.explanation ?? ''
      }
    case 'agent.artifact_delivered':
      return {
        type: 'text',
        presentation: CLOUD_NOTICE_PRESENTATION.artifact,
        caption: event.file_id,
        // Why: `tone` is free-form in the block contract; the MIME type lets the view pick a preview.
        ...(event.content_type ? { tone: event.content_type } : {}),
        text: event.original_filename ?? event.file_id
      }
    case 'session.error': {
      const where = event.server ? `${event.server}: ` : ''
      return {
        type: 'text',
        presentation: CLOUD_NOTICE_PRESENTATION.error,
        tone: 'error',
        ...(event.retry ? { caption: event.retry } : {}),
        text: `${where}${event.message || event.error_type}`
      }
    }
    case 'agent.thread_context_compacted':
      return { type: 'text', presentation: 'compaction', text: '' }
    case 'session.updated': {
      const parts = [event.agent_name, event.model].filter((part): part is string => Boolean(part))
      return {
        type: 'text',
        presentation: CLOUD_NOTICE_PRESENTATION.updated,
        ...(event.tool_count !== null ? { caption: String(event.tool_count) } : {}),
        text: parts.join(' · ')
      }
    }
    case 'user.message':
    case 'agent.message':
    case 'agent.thinking':
    case 'agent.tool_use':
    case 'agent.tool_result':
    case 'agent.custom_tool_use':
    case 'user.custom_tool_result':
    case 'session.status_running':
    case 'session.status_idle':
    case 'session.status_rescheduled':
    case 'session.thread_status_running':
    case 'session.thread_status_idle':
    case 'session.thread_status_rescheduled':
    case 'session.usage':
    case 'span.model_request_start':
    case 'span.model_request_end':
    case 'span.outcome_evaluation_start':
    case 'span.outcome_evaluation_ongoing':
    case 'other':
      return null
  }
}
