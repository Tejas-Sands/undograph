import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    ssr: 'gateway/server.ts', target: 'node24', outDir: 'dist/gateway',
    rollupOptions: { output: { entryFileNames: 'server.mjs' } },
  },
})
