import { createRequire } from 'node:module'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { cloudflare } from '@cloudflare/vite-plugin'

const nodeRequire = createRequire(import.meta.url)

export default defineConfig({
  plugins: [react(), cloudflare({ remoteBindings: process.env.UNDOGRAPH_OFFLINE !== '1' })],
  resolve: {
    // The graph SDK's Temporal dependency requires JSBI's CommonJS export.
    alias: { jsbi: nodeRequire.resolve('jsbi') },
  },
})
