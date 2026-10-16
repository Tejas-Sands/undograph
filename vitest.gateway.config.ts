import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { include: ['tests/gateway.test.ts', 'tests/gateway-config.test.ts'], testTimeout: 30_000 } })
