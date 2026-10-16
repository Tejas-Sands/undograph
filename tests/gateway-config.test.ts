import { describe, expect, it } from 'vitest'
import { createRedisConfig } from '../gateway/config'

describe('Railway database password configuration', () => {
  it('accepts ordinary provider-style passwords shorter than 32 characters', () => {
    expect(() => createRedisConfig('sample12Pass')).not.toThrow()
    expect(() => createRedisConfig('x'.repeat(512))).not.toThrow()
  })

  it('quotes spaces, quotes, backslashes and Unicode without adding configuration lines', () => {
    const password = ' spaced "quoted" \\ # café 🔐 '
    const config = createRedisConfig(password)
    expect(config.split('\n').filter((line) => line.startsWith('requirepass '))).toHaveLength(1)
    expect(config).toContain('bind 127.0.0.1\n')
    expect(config).not.toContain('bind 0.0.0.0')
  })

  it('rejects missing passwords, control characters and oversized values without exposing them', () => {
    for (const password of ['', 'secret\nbind 0.0.0.0', 'secret\r\nport 9999', 'secret\0', 'x'.repeat(513), 'é'.repeat(257)]) {
      expect(() => createRedisConfig(password)).toThrow(/FALKORDB_PASSWORD/)
      try { createRedisConfig(password) } catch (error) {
        if (password) expect(String(error)).not.toContain(password)
      }
    }
  })
})
