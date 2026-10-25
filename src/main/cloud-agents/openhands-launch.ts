import { setTimeout as delay } from 'node:timers/promises'
import type { request as openhandsRequest } from './openhands-adapter'
import { isRecord } from './openhands-mapping'
import { normalizeCreateInput } from './create-input'
import {
  validateNewCloudSession,
  type CloudAgentCreateResult
} from '../../shared/cloud-agent-create'

/** A start-task id is NOT a conversation id; only READY can open the transcript. */
export async function createOpenHandsSession(
  request: typeof openhandsRequest,
  value: unknown
): Promise<CloudAgentCreateResult> {
  const input = normalizeCreateInput(value, 'openhands-cloud')
  const invalid = input
    ? validateNewCloudSession(input, {
        template: false,
        environment: false,
        repositoryToken: false
      })
    : 'Invalid launch input.'
  if (!input || invalid) {
    return { ok: false, reason: 'malformed', message: invalid ?? 'Invalid launch input.' }
  }
  if (input.outcome || input.memoryStores.length || input.vaultIds.length) {
    return {
      ok: false,
      reason: 'unsupported',
      message: 'These launch resources are not supported here.'
    }
  }
  let repository: string | null = null
  if (input.repository) {
    try {
      const url = new URL(input.repository.url)
      const parts = url.pathname
        .replace(/\.git\/?$/, '')
        .replace(/\/$/, '')
        .split('/')
        .filter(Boolean)
      if (
        url.protocol !== 'https:' ||
        url.hostname !== 'github.com' ||
        url.username ||
        url.password ||
        url.port ||
        url.search ||
        url.hash ||
        parts.length !== 2 ||
        parts.some((part) => !/^[\w.-]+$/.test(part))
      ) {
        throw new Error('Invalid repository')
      }
      repository = parts.join('/')
    } catch {
      return {
        ok: false,
        reason: 'malformed',
        message: 'Choose an https://github.com/owner/repository URL.'
      }
    }
  }
  const reply = await request('/api/v1/app-conversations', {
    method: 'POST',
    body: {
      initial_message: { content: [{ type: 'text', text: input.prompt }] },
      ...(input.title.trim() ? { title: input.title.trim() } : {}),
      ...(repository ? { selected_repository: repository, git_provider: 'github' } : {})
    }
  })
  if (!reply.ok) {
    return reply
  }
  let task = isRecord(reply.body) ? reply.body : {}
  const taskId = typeof task.id === 'string' ? task.id : null
  const deadline = Date.now() + 90_000
  while (true) {
    if (
      typeof task.app_conversation_id === 'string' &&
      task.app_conversation_id &&
      (!task.status || task.status === 'READY')
    ) {
      return { ok: true, sessionId: task.app_conversation_id, promptSent: true }
    }
    // Never repeat the POST after a lost/slow start: the renderer blocks accidental duplicates.
    if (task.status === 'ERROR' || !taskId || Date.now() >= deadline) {
      return {
        ok: false,
        reason: 'unreachable',
        message: `OpenHands start task ${taskId ?? '(unknown)'} did not become ready. Check the provider console before retrying.`
      }
    }
    await delay(1_000)
    const poll = await request(
      `/api/v1/app-conversations/start-tasks?ids=${encodeURIComponent(taskId)}`
    )
    if (!poll.ok) {
      return {
        ok: false,
        reason: 'unreachable',
        message: `OpenHands start task ${taskId} may still be running. Check the provider console.`
      }
    }
    task = Array.isArray(poll.body) && isRecord(poll.body[0]) ? poll.body[0] : {}
  }
}
