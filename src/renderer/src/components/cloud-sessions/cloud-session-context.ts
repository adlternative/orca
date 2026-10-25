import { useSyncExternalStore } from 'react'

const STORAGE_KEY = 'orca.cloudSessions.context.v1'
type LaunchChoice = { templateId: string; environmentId: string }
type Context = {
  projects: Record<string, string>
  choices: Record<string, LaunchChoice>
}
const listeners = new Set<() => void>()
// Drafts stay in memory, never in the persisted launch preferences.
export const cloudSessionDrafts = new Map<string, string>()

export function cloudSessionKey(provider: string, sessionId: string): string {
  return JSON.stringify([provider, sessionId])
}

function load(): Context {
  const empty: Context = { projects: {}, choices: {} }
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (!stored || typeof stored !== 'object') {
      return empty
    }
    if ('projects' in stored && stored.projects && typeof stored.projects === 'object') {
      for (const [key, value] of Object.entries(stored.projects)) {
        if (typeof value === 'string') {
          empty.projects[key] = value
        }
      }
    }
    if ('choices' in stored && stored.choices && typeof stored.choices === 'object') {
      for (const [key, value] of Object.entries(stored.choices)) {
        if (
          value &&
          typeof value === 'object' &&
          'templateId' in value &&
          typeof value.templateId === 'string' &&
          'environmentId' in value &&
          typeof value.environmentId === 'string'
        ) {
          empty.choices[key] = { templateId: value.templateId, environmentId: value.environmentId }
        }
      }
    }
  } catch {
    /* Corrupt or blocked storage must not prevent launching a task. */
  }
  return empty
}
let context = load()

function publish(next: Context): void {
  context = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(context))
  } catch {
    /* Session still opens. */
  }
  for (const listener of listeners) {
    listener()
  }
}

export function useCloudSessionProjects(): Readonly<Record<string, string>> {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => context.projects
  )
}

export function associateCloudSession(
  provider: string,
  sessionId: string,
  projectId: string | null
): void {
  const projects = { ...context.projects }
  const key = cloudSessionKey(provider, sessionId)
  if (projectId) {
    projects[key] = projectId
  } else {
    delete projects[key]
  }
  publish({ ...context, projects })
}

export function rememberedLaunchChoice(
  provider: string,
  projectId: string | null
): LaunchChoice | undefined {
  return context.choices[cloudSessionKey(provider, projectId ?? '')]
}

export function rememberLaunchChoice(
  provider: string,
  projectId: string | null,
  choice: LaunchChoice
): void {
  // Credentials, prompts and repository tokens never enter persisted launch preferences.
  publish({
    ...context,
    choices: {
      ...context.choices,
      [cloudSessionKey(provider, projectId ?? '')]: {
        templateId: choice.templateId,
        environmentId: choice.environmentId
      }
    }
  })
}
