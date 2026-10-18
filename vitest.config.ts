import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/domain.test.ts', 'tests/agents.test.ts', 'tests/local-setup.test.ts', 'tests/knowledge.test.ts', 'tests/workspace-entry.test.tsx'],
  },
})
