export class ApiError extends Error {
  readonly code: string
  readonly status: number
  constructor(code: string, message: string, status: number) {
    super(message)
    this.code = code
    this.status = status
  }
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      ...init,
      credentials: 'same-origin',
      signal: init.signal ?? AbortSignal.timeout(30_000),
      headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
    })
  } catch {
    throw new ApiError(
      'NETWORK_UNAVAILABLE',
      'The server could not be reached. Check the connection and retry.',
      0,
    )
  }
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const error = (body as { error?: { code?: string; message?: string } } | null)?.error
    throw new ApiError(
      error?.code ?? 'REQUEST_FAILED',
      error?.message ?? 'The request could not be completed. Please retry.',
      response.status,
    )
  }
  return body as T
}

export function downloadJson(data: unknown, filename: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1_000)
}
