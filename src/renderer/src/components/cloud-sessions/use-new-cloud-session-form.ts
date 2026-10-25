import { useCallback, useMemo, useState } from 'react'
import type {
  CloudAgentCatalog,
  CloudAgentTemplate,
  NewCloudSessionInput
} from '../../../../shared/cloud-agent-create'
import { QODER_CLOUD_PROVIDER_ID } from '../../../../shared/qoder-cloud-types'

const EMPTY: NewCloudSessionInput = {
  provider: QODER_CLOUD_PROVIDER_ID,
  templateId: '',
  templateVersion: 0,
  environmentId: '',
  title: '',
  prompt: '',
  outcome: null,
  repository: null,
  memoryStores: [],
  vaultIds: []
}

export type NewCloudSessionForm = {
  input: NewCloudSessionInput
  touched: boolean
  setField: <K extends keyof NewCloudSessionInput>(key: K, value: NewCloudSessionInput[K]) => void
  setTemplate: (id: string, templates: readonly CloudAgentTemplate[]) => void
  setOutcome: (outcome: NewCloudSessionInput['outcome']) => void
  setRepository: (repository: NewCloudSessionInput['repository']) => void
  toggleMemoryStore: (id: string) => void
  setMemoryAccess: (id: string, access: 'read' | 'read_write') => void
  toggleVault: (id: string) => void
  seed: (
    catalog: CloudAgentCatalog,
    remembered?: { templateId: string; environmentId: string }
  ) => void
}

/** Form state for the create dialog: one object, so validation reads the whole input at once. */
export function useNewCloudSessionForm(catalog: CloudAgentCatalog | null): NewCloudSessionForm {
  const [input, setInput] = useState<NewCloudSessionInput>(EMPTY)
  const [touched, setTouched] = useState(false)

  const patch = useCallback((next: Partial<NewCloudSessionInput>): void => {
    setTouched(true)
    setInput((current) => ({ ...current, ...next }))
  }, [])

  const setField = useCallback<NewCloudSessionForm['setField']>((key, value) => {
    setTouched(true)
    setInput((current) => ({ ...current, [key]: value }))
  }, [])

  const setTemplate = useCallback<NewCloudSessionForm['setTemplate']>(
    (id, templates) => {
      const match = templates.find((template) => template.id === id)
      patch({ templateId: id, templateVersion: match?.version ?? 0 })
    },
    [patch]
  )

  // Why: preselect the first template and environment so the dialog is usable in two clicks,
  // but never overwrite a choice the user already made.
  const seed = useCallback<NewCloudSessionForm['seed']>((next, remembered) => {
    const template =
      next.templates.find((entry) => entry.id === remembered?.templateId) ?? next.templates[0]
    const environment =
      next.environments.find((entry) => entry.id === remembered?.environmentId) ??
      next.environments[0]
    setInput((current) => ({
      ...EMPTY,
      provider: next.provider,
      prompt: current.prompt,
      title: current.title,
      templateId: template?.id ?? '',
      templateVersion: template?.version ?? 0,
      environmentId: environment?.id ?? ''
    }))
  }, [])

  const setRepository = useCallback<NewCloudSessionForm['setRepository']>(
    (repository) => patch({ repository }),
    [patch]
  )

  const value = useMemo(
    () => ({
      input,
      touched,
      setField,
      setTemplate,
      setOutcome: (outcome: NewCloudSessionInput['outcome']) => patch({ outcome }),
      setRepository,
      toggleMemoryStore: (id: string): void =>
        setInput((current) => {
          const has = current.memoryStores.some((store) => store.id === id)
          return {
            ...current,
            memoryStores: has
              ? current.memoryStores.filter((store) => store.id !== id)
              : [...current.memoryStores, { id, access: 'read_write', instructions: '' }]
          }
        }),
      setMemoryAccess: (id: string, access: 'read' | 'read_write'): void =>
        setInput((current) => ({
          ...current,
          memoryStores: current.memoryStores.map((store) =>
            store.id === id ? { ...store, access } : store
          )
        })),
      toggleVault: (id: string): void =>
        setInput((current) => ({
          ...current,
          vaultIds: current.vaultIds.includes(id)
            ? current.vaultIds.filter((vaultId) => vaultId !== id)
            : [...current.vaultIds, id]
        })),
      seed
    }),
    [input, touched, setField, setTemplate, setRepository, patch, seed]
  )
  void catalog
  return value
}
