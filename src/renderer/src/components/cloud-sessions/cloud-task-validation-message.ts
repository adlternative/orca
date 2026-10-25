import { translate } from '@/i18n/i18n'

export function cloudTaskValidationMessage(message: string): string {
  switch (message) {
    case 'Choose an agent template.':
      return translate('cloudTasks.validation.agent', 'Choose an agent.')
    case 'Choose an environment.':
      return translate('cloudTasks.validation.environment', 'Choose an environment.')
    case 'Enter a prompt or acceptance criteria.':
      return translate('cloudTasks.validation.prompt', 'Describe the task first.')
    case 'Acceptance criteria need a rubric.':
      return translate('cloudTasks.validation.rubric', 'Add acceptance criteria.')
    case 'Iterations must be between 1 and 20.':
      return translate('cloudTasks.validation.iterations', 'Iterations must be between 1 and 20.')
    case 'The repository URL must be https://.':
      return translate('cloudTasks.validation.url', 'Use an HTTPS repository URL.')
    case 'A private repository needs a token; leave the URL empty for a public read-only clone.':
      return translate(
        'cloudTasks.validation.token',
        'Add a repository token under Advanced, or remove the repository.'
      )
    case 'That does not look like a GitHub token.':
      return translate('cloudTasks.validation.tokenFormat', 'Enter a valid GitHub token.')
    default:
      return translate('cloudTasks.validation.generic', 'Check the launch options.')
  }
}
