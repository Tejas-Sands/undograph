import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { expect, it } from 'vitest'

it('handles a socket reset during SDK connection without crashing the gateway process', async () => {
  const server = createServer((socket) => socket.destroy())
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as { port: number }
  try {
    const child = spawn(process.execPath, ['--input-type=module', '-e', `
      import { FalkorDB } from 'falkordb';
      try {
        const client = await FalkorDB.connect({
          socket: { host: '127.0.0.1', port: ${port}, connectTimeout: 1000, reconnectStrategy: false }
        });
        client.on('error', () => {});
        await client.close();
        process.exitCode = 2;
      } catch {
        console.log('Connection failure caught');
      }
    `], { timeout: 5_000 })
    let stdout = '', stderr = ''
    child.stdout.on('data', (data) => { stdout += data })
    child.stderr.on('data', (data) => { stderr += data })
    const code = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('close', resolve) })
    expect({ code, stdout, stderr }).toEqual({ code: 0, stdout: 'Connection failure caught\n', stderr: '' })
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())) }
})
