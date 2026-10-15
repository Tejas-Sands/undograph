import { cloudflareTest } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [cloudflareTest({
    wrangler: { configPath: './wrangler.jsonc' },
    miniflare: { bindings: { FALKORDB_HOST: '', FALKORDB_PASSWORD: '' } },
  })],
  test: {
    include: ['tests/runtime.test.ts', 'tests/workflows.test.ts', 'tests/api.test.ts'],
    testTimeout: 15_000,
  },
})
