import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'

try {
  writeFileSync('.env.railway', [
    `FALKORDB_PASSWORD=${randomBytes(32).toString('base64url')}`,
    `GRAPH_GATEWAY_TOKEN=${randomBytes(32).toString('base64url')}`,
    'GATEWAY_GRAPH_PREFIXES=undograph_preview_',
    'PORT=8080',
    `SESSION_SECRET=${randomBytes(32).toString('base64url')}`,
    '',
  ].join('\n'), { flag: 'wx', mode: 0o600 })
  console.log('Created ignored .env.railway (0600). Values are not printed. Existing credentials are never overwritten.')
} catch (error) {
  if (error.code !== 'EEXIST') throw error
  console.log('Existing .env.railway preserved.')
}
