/** Normalize post-login / guard redirects so we never stay on bare "#/". */
export function normalizeAppPath(path: unknown): string {
  const raw = String(path || '').trim()
  if (!raw || raw === '/' || raw === '/#' || raw === '#/' || raw === '#') {
    return '/overview'
  }
  if (raw.startsWith('#/')) return normalizeAppPath(raw.slice(1))
  if (raw.startsWith('#')) return normalizeAppPath(raw.slice(1) || '/')
  return raw.startsWith('/') ? raw : `/${raw}`
}
