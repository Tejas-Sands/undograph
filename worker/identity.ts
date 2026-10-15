import { DomainError } from './domain'
import type { Env } from './env'

export interface Visitor { id: string; generation: string; graphName: string; workspaceId: string; expiresAt: number; cookie?: string }
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
  // Preserve initial development cookies while new cookies carry a reset generation.
  let generation = parts.length === 4 ? parts[1] : ''
  let expiresAt = Number(parts.at(-2))
  const payload = generation ? `${id}.${generation}.${expiresAt}` : `${id}.${expiresAt}`
  const valid = [3, 4].includes(parts.length) && /^[a-f0-9]{32}$/.test(id) &&
    (parts.length === 3 || /^[a-f0-9]{32}$/.test(generation)) && Number.isSafeInteger(expiresAt) &&
    expiresAt > Date.now() && expiresAt <= Date.now() + 86_400_000 && equal(await mac(env, `cookie:${payload}`), parts.at(-1)!)
  if (!valid) {
    if (!create) throw new DomainError('NOT_FOUND', 'Workspace not found. Create a local workspace to begin.', 404)
    id = crypto.randomUUID().replaceAll('-', '')
    generation = crypto.randomUUID().replaceAll('-', '')
    expiresAt = Date.now() + 86_400_000
  }
  return identify(env, id, generation, expiresAt, !valid)
}

async function identify(env: Env, id: string, generation: string, expiresAt: number, issueCookie: boolean): Promise<Visitor> {
  const payload = `${id}.${generation}.${expiresAt}`
  const digest = await mac(env, generation ? `graph:${id}.${generation}` : `graph:${id}`)
  const cookie = issueCookie ? `${cookieName}=${payload}.${await mac(env, `cookie:${payload}`)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))}${env.ENVIRONMENT === 'local' ? '' : '; Secure'}` : undefined
  return { id, generation, graphName: `${env.GRAPH_PREFIX}visitor_${digest}`, workspaceId: `workspace_${digest.slice(0, 32)}`, expiresAt, ...(cookie ? { cookie } : {}) }
}

export async function rotateWorkspace(request: Request, env: Env): Promise<Visitor> {
  const visitor = await visitorIdentity(request, env)
  return identify(env, visitor.id, crypto.randomUUID().replaceAll('-', ''), visitor.expiresAt, true)
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
