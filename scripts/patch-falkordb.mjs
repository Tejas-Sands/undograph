import { readFileSync, writeFileSync } from 'node:fs'

// SDK 6.8.0 forwards socket errors before connect() returns a client on which
// callers can attach a listener. Keep those failures on the rejected promise.
const file = new URL('../node_modules/falkordb/dist/src/falkordb.js', import.meta.url)
const metadata = JSON.parse(readFileSync(new URL('../node_modules/falkordb/package.json', import.meta.url), 'utf8'))
const source = readFileSync(file, 'utf8')
const marker = '// UndoGraph: handle SDK errors before connect() returns.'
const needle = 'const falkordb = new FalkorDB();'
if (!source.includes(marker)) {
  if (metadata.version !== '6.8.0' || source.split(needle).length !== 2) {
    throw new Error('Review the FalkorDB connection-error patch for the installed SDK version.')
  }
  writeFileSync(file, source.replace(needle, `${needle}\n        ${marker}\n        falkordb.on('error', () => {});`))
}
