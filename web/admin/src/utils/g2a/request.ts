const TOKEN_KEY = 'g2a_admin_token'
const TOKEN_TS_KEY = 'g2a_admin_token_ts'
const AUTH_GRACE_MS = 5 * 60 * 1000

const API_BASE = (import.meta.env.VITE_APP_BASE_API || '/admin/api').replace(/\/$/, '')

let token = localStorage.getItem(TOKEN_KEY) || ''
let lastAuthOkAt = Number(localStorage.getItem(TOKEN_TS_KEY) || 0) || 0
const unauthorizedListeners: Array<(err: ApiError) => void> = []

export class ApiError extends Error {
  status: number
  data?: unknown
  path?: string
  soft?: boolean
  html?: boolean
  network?: boolean

  constructor(message: string, init: Partial<ApiError> = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = init.status ?? 0
    this.data = init.data
    this.path = init.path
    this.soft = init.soft
    this.html = init.html
    this.network = init.network
  }
}

export function getToken() {
  return token
}

export function setToken(t: string) {
  token = t || ''
  if (token) {
    localStorage.setItem(TOKEN_KEY, token)
    lastAuthOkAt = Date.now()
    localStorage.setItem(TOKEN_TS_KEY, String(lastAuthOkAt))
  } else {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(TOKEN_TS_KEY)
    lastAuthOkAt = 0
  }
}

export function clearToken() {
  setToken('')
}

export function markAuthOk() {
  lastAuthOkAt = Date.now()
  try {
    localStorage.setItem(TOKEN_TS_KEY, String(lastAuthOkAt))
  } catch {
    /* ignore */
  }
}

export function inAuthGrace() {
  return !!(token && lastAuthOkAt && Date.now() - lastAuthOkAt < AUTH_GRACE_MS)
}

export function onUnauthorized(fn: (err: ApiError) => void) {
  unauthorizedListeners.push(fn)
}

function errMessage(data: any, fallback: string) {
  if (!data) return fallback
  const msg = data.detail || data.error || data.message || data.msg
  if (typeof msg === 'string' && msg.trim()) return msg
  if (msg != null) {
    try {
      return JSON.stringify(msg)
    } catch {
      return String(msg)
    }
  }
  return fallback
}

function headers(json = true): Record<string, string> {
  const h: Record<string, string> = {}
  if (json) h['Content-Type'] = 'application/json'
  if (token) h['X-Admin-Token'] = token
  return h
}

/** Paths that may legitimately return 401 without forcing a login redirect. */
function shouldIgnoreUnauthorized(path: string): boolean {
  const pathStr = String(path || '')
  const bare = pathStr.split('?')[0] || ''
  return (
    bare === '/login' ||
    bare === '/setup' ||
    bare === '/logout' ||
    bare === '/session' ||
    bare.startsWith('/status') ||
    pathStr.includes('/register-email/sessions/')
  )
}

function notifyUnauthorized(err: ApiError) {
  if (err.status !== 401) return
  if (shouldIgnoreUnauthorized(String(err.path || ''))) return
  // Admin auth is session-token based: any real 401 means the token is gone
  // (restart, expiry, wrong instance). Always redirect to login — do not soft-
  // swallow inside the 5min grace window, or empty pages stay open with no data.
  unauthorizedListeners.forEach((fn) => {
    try {
      fn(err)
    } catch {
      /* ignore */
    }
  })
}

export async function api<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const isForm = typeof FormData !== 'undefined' && opts.body instanceof FormData
  const method = (opts.method || 'GET').toUpperCase()
  let res: Response
  try {
    res = await fetch(API_BASE + path, {
      ...opts,
      credentials: 'same-origin',
      headers: {
        ...headers(!(isForm || method === 'GET')),
        ...(opts.headers as Record<string, string> | undefined),
      },
    })
  } catch (cause: any) {
    const raw = cause?.message || String(cause) || 'Failed to fetch'
    let hint = raw
    if (/failed to fetch|networkerror|load failed|network request failed/i.test(raw)) {
      hint =
        '网络请求失败（服务不可达、反向代理中断、或请求超时）。请检查 grokcli-2api 是否在线、端口/反代是否正确。'
    }
    throw new ApiError(hint, { status: 0, path, network: true })
  }

  let data: any = null
  const ct = (res.headers.get('content-type') || '').toLowerCase()
  try {
    if (ct.includes('application/json')) data = await res.json()
    else {
      const text = await res.text()
      if (/^\s*<!doctype\s+html|^\s*<html[\s>]/i.test(text || '')) {
        throw new ApiError(
          `Admin API 返回了 HTML 页面，通常是反向代理或部署子路径没有把 ${API_BASE}${path} 转发到后端。`,
          { status: res.status, path, html: true },
        )
      }
      data = text ? { detail: text.slice(0, 300) } : null
    }
  } catch (e: any) {
    if (e instanceof ApiError) throw e
    data = null
  }

  if (!res.ok) {
    const fallback =
      res.status === 500 ? '服务器内部错误 (500)' : res.statusText || `HTTP ${res.status}`
    const msg = errMessage(data, fallback)
    const err = new ApiError(typeof msg === 'string' ? msg : JSON.stringify(msg), {
      status: res.status,
      data,
      path,
    })
    notifyUnauthorized(err)
    throw err
  }

  if (token && !String(path || '').startsWith('/status')) {
    markAuthOk()
  }
  return data as T
}

export async function download(path: string, opts: RequestInit = {}) {
  const res = await fetch(API_BASE + path, {
    ...opts,
    credentials: 'same-origin',
    headers: { ...headers(false), ...(opts.headers as any) },
  })
  if (!res.ok) {
    let msg = res.statusText
    try {
      const d = await res.json()
      msg = d.detail || d.error || msg
    } catch {
      /* ignore */
    }
    const err = new ApiError(msg, { status: res.status, path })
    notifyUnauthorized(err)
    throw err
  }
  const blob = await res.blob()
  let filename = 'download.bin'
  const cd = res.headers.get('Content-Disposition') || ''
  const m = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(cd)
  if (m) filename = decodeURIComponent(m[1].replace(/"/g, ''))
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
  return filename
}

export { TOKEN_KEY, API_BASE }
