import { createServer } from 'node:http'
import type { Hono } from 'hono'

export function serveGateway(app: Hono) {
  return createServer({ requestTimeout: 20_000, headersTimeout: 10_000, maxHeaderSize: 8_192 }, async (request, response) => {
    try {
      const chunks: Buffer[] = []
      let size = 0
      for await (const chunk of request) {
        size += chunk.length
        if (size > 65_536) { response.writeHead(413).end(); return }
        chunks.push(Buffer.from(chunk))
      }
      const result = await app.fetch(new Request(`http://localhost${request.url ?? '/'}`, {
        method: request.method, headers: Object.entries(request.headers).flatMap(([key, value]) => value === undefined ? [] : [[key, Array.isArray(value) ? value.join(', ') : value]]),
        ...(size ? { body: Buffer.concat(chunks) } : {}),
      }))
      response.writeHead(result.status, Object.fromEntries(result.headers))
      response.end(Buffer.from(await result.arrayBuffer()))
    } catch { if (!response.headersSent) response.writeHead(400); response.end() }
  })
}
