import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'

const filename = process.argv[2] ?? '.dev.vars'
const configuration = [
  'FALKORDB_HOST=127.0.0.1',
  'FALKORDB_PORT=16379',
  'FALKORDB_USERNAME=default',
  `FALKORDB_PASSWORD=${randomBytes(24).toString('base64url')}`,
  `SESSION_SECRET=${randomBytes(32).toString('base64url')}`,
  '',
].join('\n')

try {
  writeFileSync(filename, configuration, { flag: 'wx', mode: 0o600 })
  console.log('Local configuration created. Secrets are kept in the ignored configuration file.')
} catch (error) {
  if (error.code !== 'EEXIST') throw error
  console.log('Existing local configuration preserved.')
}
