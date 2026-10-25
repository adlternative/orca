import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import {
  cloudRepositoryPrefill,
  resolveProjectCloneUrlPrefill
} from '@/lib/project-clone-url-prefill'
import { cloudAgentApi } from '@/lib/cloud-agent-api'
import {
  listCloudAgentProviders,
  getCloudAgentProvider
} from '../../../../shared/cloud-agent-provider-registry'
import type { CloudAgentCatalog } from '../../../../shared/cloud-agent-create'
import { validateNewCloudSession } from '../../../../shared/cloud-agent-create'
import {
  rememberCloudSessionTitle,
  requestCloudSessionsRefresh
} from '../sidebar/use-cloud-sessions-feed'
import { cloudAgentFailureCopy } from './cloud-agent-failure-copy'
import { useNewCloudSessionForm } from './use-new-cloud-session-form'
import {
  associateCloudSession,
  cloudSessionDrafts,
  cloudSessionKey,
  rememberedLaunchChoice,
  rememberLaunchChoice
} from './cloud-session-context'

const LAST_PROVIDER_KEY = 'orca.cloudSessions.lastProvider'
const providers = listCloudAgentProviders().filter((entry) => entry.capabilities.createSession)
function lastProvider(): string {
  try {
    const id = localStorage.getItem(LAST_PROVIDER_KEY)
    if (providers.some((entry) => entry.id === id)) {
      return id!
    }
  } catch {
    /* Storage is optional. */
  }
  return providers[0]?.id ?? ''
}

export function useCloudTaskLaunch(
  open: boolean,
  initialProjectId: string | null,
  onCreated: () => void
) {
  const projects = useAppStore((s) => s.projects)
  const repos = useAppStore((s) => s.repos)
  const [projectId, setProjectId] = useState<string | null>(initialProjectId)
  const [provider, setProvider] = useState(lastProvider)
  const [configured, setConfigured] = useState<ReadonlySet<string> | null>(null)
  const [catalog, setCatalog] = useState<CloudAgentCatalog | null>(null)
  const [loadFailure, setLoadFailure] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [uncertain, setUncertain] = useState(false)
  const submittingRef = useRef(false)
  const lifecycle = useRef(0)
  useEffect(() => {
    const generation = ++lifecycle.current
    return () => {
      lifecycle.current = generation + 1
    }
  }, [open])
  const form = useNewCloudSessionForm(catalog)
  const descriptor = getCloudAgentProvider(provider)
  const seed = form.seed
  const setRepository = form.setRepository

  useEffect(() => {
    if (!open) {
      return
    }
    setProjectId(initialProjectId)
    setConfigured(null)
    setSubmitError(null)
    setUncertain(false)
    let cancelled = false
    void Promise.all(
      providers.map(async (entry) => {
        try {
          return (await cloudAgentApi(entry.id).status()).configured ? entry.id : null
        } catch {
          return null
        }
      })
    ).then((ids) => {
      if (cancelled) {
        return
      }
      const available = new Set(ids.filter((id): id is string => id !== null))
      setConfigured(available)
      setProvider((current) => (available.has(current) ? current : ([...available][0] ?? current)))
    })
    return () => {
      cancelled = true
    }
  }, [open, initialProjectId])

  useEffect(() => {
    if (!open) {
      return
    }
    setCatalog(null)
    setLoadFailure(null)
    let cancelled = false
    void (async () => {
      try {
        const result = await cloudAgentApi(provider).catalog()
        if (cancelled) {
          return
        }
        if (!result.ok) {
          setLoadFailure(cloudAgentFailureCopy(result, descriptor?.label ?? provider))
          return
        }
        seed(result.catalog, rememberedLaunchChoice(provider, projectId))
        setCatalog(result.catalog)
      } catch {
        if (!cancelled) {
          setLoadFailure(
            translate(
              'cloudTasks.catalogFailed',
              'Could not load launch options. Check the connection and retry.'
            )
          )
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, provider, projectId, reload, seed, descriptor?.label])

  const cloneUrl = cloudRepositoryPrefill(resolveProjectCloneUrlPrefill(projects, repos, projectId))
  useEffect(() => {
    if (catalog?.provider !== provider) {
      return
    }
    setRepository(cloneUrl ? { url: cloneUrl, mountPath: '', authorizationToken: '' } : null)
  }, [cloneUrl, catalog, provider, setRepository])

  const invalid = validateNewCloudSession(form.input, descriptor?.launchRequirements)
  const readyCatalog = catalog?.provider === provider ? catalog : null
  const canSubmit =
    !invalid &&
    !submitting &&
    !uncertain &&
    readyCatalog !== null &&
    configured?.has(provider) === true

  const submit = async (): Promise<void> => {
    if (!canSubmit || submittingRef.current) {
      return
    }
    const generation = lifecycle.current
    submittingRef.current = true
    setSubmitting(true)
    setSubmitError(null)
    try {
      const result = await cloudAgentApi(provider).createSession({ ...form.input, provider })
      if (!result.ok) {
        const ambiguous = result.reason === 'unreachable'
        setUncertain(ambiguous)
        setSubmitError(
          ambiguous
            ? translate(
                'cloudTasks.uncertain',
                'The response was lost. A task may already exist. Check the task list before starting another.'
              )
            : cloudAgentFailureCopy(result, descriptor?.label ?? provider)
        )
        requestCloudSessionsRefresh()
        return
      }
      associateCloudSession(provider, result.sessionId, projectId)
      rememberLaunchChoice(provider, projectId, {
        templateId: form.input.templateId,
        environmentId: form.input.environmentId
      })
      try {
        localStorage.setItem(LAST_PROVIDER_KEY, provider)
      } catch {
        /* Optional preference. */
      }
      rememberCloudSessionTitle(
        result.sessionId,
        form.input.title || form.input.prompt || form.input.outcome?.rubric || '',
        provider
      )
      if (!result.promptSent) {
        cloudSessionDrafts.set(cloudSessionKey(provider, result.sessionId), form.input.prompt)
      }
      requestCloudSessionsRefresh()
      // Still record a completed launch, but do not steal navigation after its surface closed.
      if (generation !== lifecycle.current) {
        return
      }
      const store = useAppStore.getState()
      store.setOpenCloudSessionId(result.sessionId, provider)
      if (!result.promptSent) {
        useAppStore.setState({
          cloudSessionLaunchWarning: translate(
            'cloudTasks.firstTurnFailed',
            'The task was created, but its first message was not sent. Continue in the composer below; do not create another task.'
          )
        })
      }
      onCreated()
    } catch {
      setUncertain(true)
      requestCloudSessionsRefresh()
      setSubmitError(
        translate(
          'cloudTasks.uncertain',
          'The response was lost. A task may already exist. Check the task list before starting another.'
        )
      )
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  return {
    providers,
    provider,
    setProvider,
    descriptor,
    projects,
    projectId,
    setProjectId,
    configured,
    catalog: readyCatalog,
    loadFailure,
    retry: () => setReload((value) => value + 1),
    form,
    invalid,
    canSubmit,
    submit,
    submitting,
    submitError,
    cloneUrl
  }
}
