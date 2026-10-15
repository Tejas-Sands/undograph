import { existsSync, readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { cloudflareTest } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

const local = existsSync('.dev.vars') ? parseEnv(readFileSync('.dev.vars', 'utf8')) : {}
const fields = ['FALKORDB_HOST', 'FALKORDB_PORT', 'FALKORDB_USERNAME', 'FALKORDB_PASSWORD', 'SESSION_SECRET']
const bindings = Object.fromEntries(fields.map((key) => [key, process.env[key] ?? local[key] ?? '']))

export default defineConfig({
  plugins: [cloudflareTest({
    remoteBindings: false,
    main: './tests/fixtures/graph-probe-worker.ts',
    wrangler: { configPath: './wrangler.jsonc' },
    miniflare: {
      bindings: { ...bindings, ENVIRONMENT: 'local', FALKORDB_TLS: 'false', GRAPH_PREFIX: 'undograph_test_' },
      workflows: {
        GRAPH_PROBE_WORKFLOW: { name: 'undograph-runtime-probe', className: 'GraphProbeWorkflow' },
        TEST_BUILD_WORKFLOW: { name: 'undograph-test-build', className: 'TestBuildWorkflow' },
        FAILED_BUILD_WORKFLOW: { name: 'undograph-test-failed-build', className: 'FailedBuildWorkflow' },
        TEST_REPAIR_WORKFLOW: { name: 'undograph-test-repair', className: 'TestRepairWorkflow' },
      },
    },
  })],
  test: {
    include: ['tests/graph.*.test.ts', 'tests/workflows.test.ts', 'tests/api.test.ts'],
    testTimeout: 40_000,
  },
})
