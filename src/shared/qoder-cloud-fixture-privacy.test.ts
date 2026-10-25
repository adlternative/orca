import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'

it('keeps cloud fixtures free of account identifiers and tracking URLs', () => {
  const directory = join(__dirname, '__fixtures__', 'qoder-cloud')
  for (const name of readdirSync(directory).filter((name) => name.endsWith('.json'))) {
    const content = readFileSync(join(directory, name), 'utf8')
    expect(() => JSON.parse(content), name).not.toThrow()
    expect(content, name).not.toMatch(/\b(?:sess|evt|sthr|agent|env|dep|file)_[a-z0-9]{16,}\b/)
    expect(content, name).not.toMatch(/openaicom-did=|original_task|package contentaccess/)
  }
})
