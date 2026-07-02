/** 前端 API client:统一信封解包 + 错误对象化(客户端组件用) */

export class ApiClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'ApiClientError'
  }
}

type Envelope<T> =
  | { data: T; requestId: string }
  | { error: { code: string; message: string; details?: Record<string, unknown> }; requestId: string }

export async function apiFetch<T>(
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const { json, ...rest } = init ?? {}
  const res = await fetch(path, {
    ...rest,
    headers: {
      ...(json !== undefined ? { 'content-type': 'application/json' } : {}),
      ...rest.headers,
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  })
  const body = (await res.json().catch(() => null)) as Envelope<T> | null
  if (!body) throw new ApiClientError('INTERNAL_ERROR', '响应解析失败', res.status)
  if ('error' in body) {
    throw new ApiClientError(body.error.code, body.error.message, res.status, body.error.details)
  }
  return body.data
}

export type PageResult<T> = { items: T[]; page: number; pageSize: number; total: number }

export function listQuery(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') sp.set(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}
