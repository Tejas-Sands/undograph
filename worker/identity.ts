import { DomainError } from './domain'
import type { Env } from './env'

export interface Visitor { id: string; graphName: string; workspaceId: string; expiresAt: number; cookie?: string }
const cookieName = 'undograph_session'

async function mac(env: Env, value: string): Promise<string> {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) throw new DomainError('SESSION_UNAVAILABLE', 'Server session configuration is unavailable.', 503)
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const bytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
function equal(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let difference = 0
  for (let index = 0; index < a.length; index++) difference |= a.charCodeAt(index) ^ b.charCodeAt(index)
  return difference === 0
}

export async function visitorIdentity(request: Request, env: Env, create = false): Promise<Visitor> {
  const raw = request.headers.get('Cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1)
  const parts = raw?.split('.') ?? []
  let id = parts[0]
  let expiresAt = Number(parts[1])
  let cookie: string | undefined
  const valid = parts.length === 3 && /^[a-f0-9]{32}$/.test(id) && Number.isSafeInteger(expiresAt) && expiresAt > Date.now() && expiresAt <= Date.now() + 86_400_000 && equal(await mac(env, `cookie:${id}.${expiresAt}`), parts[2])
  if (!valid) {
    if (!create) throw new DomainError('NOT_FOUND', 'Workspace not found. Create a local workspace to begin.', 404)
    id = crypto.randomUUID().replaceAll('-', '')
    expiresAt = Date.now() + 86_400_000
    cookie = `${cookieName}=${id}.${expiresAt}.${await mac(env, `cookie:${id}.${expiresAt}`)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${env.ENVIRONMENT === 'local' ? '' : '; Secure'}`
  }
  const digest = await mac(env, `graph:${id}`)
  return { id, graphName: `${env.GRAPH_PREFIX}visitor_${digest}`, workspaceId: `workspace_${digest.slice(0, 32)}`, expiresAt, ...(cookie ? { cookie } : {}) }
}

export async function readJson(request: Request): Promise<unknown> {
  const reader = request.body?.getReader()
  if (!reader) throw new DomainError('INVALID_JSON', 'Provide a JSON request body.', 400)
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.length
      if (size > 16_384) { await reader.cancel(); throw new DomainError('BODY_TOO_LARGE', 'Request bodies must be at most 16 KiB.', 413) }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  try { return JSON.parse(new TextDecoder().decode(bytes)) }
  catch { throw new DomainError('INVALID_JSON', 'Provide a valid JSON request body.', 400) }
}
