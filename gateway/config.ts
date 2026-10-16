export function createRedisConfig(password: string): string {
  if (!password || new TextEncoder().encode(password).byteLength > 512 ||
    [...password].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
    throw new Error('Set FALKORDB_PASSWORD in the Railway service variables. Use a non-empty password of at most 512 UTF-8 bytes without control characters.')
  }
  const quoted = `"${password.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
  return [
    'bind 127.0.0.1', 'port 6379', 'protected-mode yes', `requirepass ${quoted}`,
    'loadmodule /var/lib/falkordb/bin/falkordb.so', 'dir /data', 'appendonly yes', 'appendfsync everysec',
    'maxmemory 256mb', 'maxmemory-policy noeviction', 'save ""',
  ].join('\n') + '\n'
}
