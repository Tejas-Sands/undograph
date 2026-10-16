import { existsSync, readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { cloudflareTest } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'
import { createGateway } from './gateway/app.ts'
import { serveGateway } from './gateway/http.ts'
import type { Env } from './worker/env.ts'

const local = existsSync('.dev.vars') ? parseEnv(readFileSync('.dev.vars', 'utf8')) : {}
const fields = ['FALKORDB_HOST', 'FALKORDB_PORT', 'FALKORDB_USERNAME', 'FALKORDB_PASSWORD', 'SESSION_SECRET']
const bindings = Object.fromEntries(fields.map((key) => [key, process.env[key] ?? local[key] ?? '']))
const gateway = process.env.UNDOGRAPH_TEST_GATEWAY === '1' ? serveGateway(createGateway({
  token: 'gateway-workerd-integration-test-token-32', prefixes: ['undograph_test_'],
  database: { ...bindings, ENVIRONMENT: 'local', FALKORDB_TLS: 'false', GRAPH_PREFIX: 'undograph_test_' } as Env,
})) : undefined
if (gateway) await new Promise<void>((resolve) => gateway.listen(0, '127.0.0.1', resolve))
const gatewayBindings: Record<string, string> = gateway ? {
  GRAPH_GATEWAY_URL: `http://127.0.0.1:${(gateway.address() as { port: number }).port}`,
  GRAPH_GATEWAY_TOKEN: 'gateway-workerd-integration-test-token-32',
} : {}

export default defineConfig({
  plugins: [
    { name: 'gateway-test-server', async closeBundle() { if (gateway) await new Promise<void>((resolve) => gateway.close(() => resolve())) } },
    cloudflareTest({
    remoteBindings: false,
    main: './tests/fixtures/graph-probe-worker.ts',
    wrangler: { configPath: './wrangler.jsonc' },
    miniflare: {
      bindings: { ...bindings, ...gatewayBindings, ENVIRONMENT: 'local', FALKORDB_TLS: 'false', GRAPH_PREFIX: 'undograph_test_' },
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
    // These runtime suites share one real DB and gateway; keep concurrency
    // within each test rather than competing across multiple workerd pools.
    fileParallelism: false,
    testTimeout: 40_000,
  },
})
