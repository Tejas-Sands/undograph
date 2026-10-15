import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseEnv } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function configurationFile() {
  const directory = mkdtempSync(join(tmpdir(), 'undograph-setup-test-'))
  temporaryDirectories.push(directory)
  return join(directory, '.dev.vars')
}

function setup(file: string) {
  return spawnSync(process.execPath, [resolve('scripts/local-setup.mjs'), file], { encoding: 'utf8' })
}

describe('local development setup', () => {
  it('creates private loopback-only configuration without printing secrets', () => {
    const file = configurationFile()
    const result = setup(file)
    expect(result.status, result.stderr).toBe(0)
    const config = parseEnv(readFileSync(file, 'utf8'))
    expect(config.FALKORDB_HOST).toBe('127.0.0.1')
    expect(config.FALKORDB_PORT).toBe('16379')
    expect(config.FALKORDB_PASSWORD?.length).toBeGreaterThanOrEqual(32)
    expect(config.SESSION_SECRET?.length).toBeGreaterThanOrEqual(43)
    expect(config.SESSION_SECRET).not.toBe(config.FALKORDB_PASSWORD)
    expect(statSync(file).mode & 0o777).toBe(0o600)
    expect(result.stdout + result.stderr).not.toContain(config.FALKORDB_PASSWORD)
    expect(result.stdout + result.stderr).not.toContain(config.SESSION_SECRET)
  })

  it('preserves existing configuration and secrets on repeated setup', () => {
    const file = configurationFile()
    const original = 'FALKORDB_PASSWORD=existing-private-password\nSESSION_SECRET=existing-session-secret\n'
    writeFileSync(file, original, { mode: 0o600 })
    const result = setup(file)
    expect(result.status, result.stderr).toBe(0)
    expect(readFileSync(file, 'utf8')).toBe(original)
    expect(result.stdout + result.stderr).not.toContain('existing-private-password')
  })
})
