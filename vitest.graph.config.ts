import { existsSync, readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { cloudflareTest } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

const local = existsSync('.dev.vars') ? parseEnv(readFileSync('.dev.vars', 'utf8')) : {}
const fields = ['FALKORDB_HOST', 'FALKORDB_PORT', 'FALKORDB_USERNAME', 'FALKORDB_PASSWORD', 'SESSION_SECRET']
const bindings = Object.fromEntries(fields.map((key) => [key, process.env[key] ?? local[key] ?? '']))

export default defineConfig({
  plugins: [cloudflareTest({
    main: './tests/fixtures/graph-probe-worker.ts',
    wrangler: { configPath: './wrangler.jsonc' },
    miniflare: {
      bindings: { ...bindings, ENVIRONMENT: 'local', FALKORDB_TLS: 'false', GRAPH_PREFIX: 'undograph_test_' },
      workflows: { GRAPH_PROBE_WORKFLOW: { name: 'undograph-runtime-probe', className: 'GraphProbeWorkflow' } },
    },
  })],
  test: {
    include: ['tests/graph.*.test.ts'],
    testTimeout: 20_000,
  },
})
