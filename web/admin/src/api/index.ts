import { api, download } from '@/utils/request'

export const getStatus = () => api('/status')
export const getDashboard = () => api('/dashboard')
export const getKeys = () => api('/keys')
export const createKey = (body: { name?: string; note?: string }) =>
  api('/keys', { method: 'POST', body: JSON.stringify(body) })
export const patchKey = (id: string, body: Record<string, unknown>) =>
  api(`/keys/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) })
export const regenerateKey = (id: string) =>
  api(`/keys/${encodeURIComponent(id)}/regenerate`, { method: 'POST', body: '{}' })
export const deleteKey = (id: string) =>
  api(`/keys/${encodeURIComponent(id)}`, { method: 'DELETE' })

export const getModels = () => api('/models')
export const syncModels = () => api('/models/sync', { method: 'POST', body: '{}' })

export const getUsageSummary = (days: number) =>
  api(`/usage/summary?days=${encodeURIComponent(days)}`)
export const getUsageByKey = (days: number, limit = 30) =>
  api(`/usage/by-key?days=${encodeURIComponent(days)}&limit=${limit}`)
export const getUsageByModel = (days: number, limit = 30) =>
  api(`/usage/by-model?days=${encodeURIComponent(days)}&limit=${limit}`)
export const getUsageEvents = (q: string) => api(`/usage/events?${q}`)

export const getLogs = (q: string) => api(`/logs?${q}`)
export const getLogActions = () => api('/logs/actions')

export const getSettings = () => api('/settings')
export const putSettings = (body: Record<string, unknown>) =>
  api('/settings', { method: 'PUT', body: JSON.stringify(body) })
export const patchSettings = (body: Record<string, unknown>) =>
  api('/settings', { method: 'PATCH', body: JSON.stringify(body) })
export const putRuntimeSettings = (body: Record<string, unknown>) =>
  api('/settings/runtime', { method: 'PUT', body: JSON.stringify(body) })
export const changePassword = (body: Record<string, string>) =>
  api('/settings/password', { method: 'PUT', body: JSON.stringify(body) })
export const putTokenMaintain = (enabled: boolean) =>
  api('/settings/token-maintain', { method: 'PUT', body: JSON.stringify({ enabled }) })
export const putModelHealth = (enabled: boolean) =>
  api('/settings/model-health', { method: 'PUT', body: JSON.stringify({ enabled }) })
export const putAccountMode = (mode: string) =>
  api('/settings/account-mode', { method: 'PUT', body: JSON.stringify({ mode }) })

export const getCLIProxySettings = () => api('/settings/cliproxyapi')
export const putCLIProxySettings = (body: Record<string, unknown>) =>
  api('/settings/cliproxyapi', { method: 'PUT', body: JSON.stringify(body) })
export const testCLIProxy = () => api('/settings/cliproxyapi/test', { method: 'POST', body: '{}' })

export const getSub2ApiSettings = () => api('/settings/sub2api')
export const putSub2ApiSettings = (body: Record<string, unknown>) =>
  api('/settings/sub2api', { method: 'PUT', body: JSON.stringify(body) })
export const testSub2Api = () => api('/settings/sub2api/test', { method: 'POST', body: '{}' })
export const getSub2ApiGroups = () => api('/settings/sub2api/groups')

export const getAccounts = (q = '') => api(q ? `/accounts?${q}` : '/accounts')
export const setAccountEnabled = (id: string, enabled: boolean) =>
  api(`/accounts/${encodeURIComponent(id)}/enabled`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled }),
  })
export const kickAccount = (id: string) =>
  api(`/accounts/${encodeURIComponent(id)}/kick`, { method: 'POST', body: '{}' })
export const clearCooldown = (id: string) =>
  api(`/accounts/${encodeURIComponent(id)}/cooldown/clear`, { method: 'POST', body: '{}' })
export const setAccountStatus = (id: string, body: Record<string, unknown>) =>
  api(`/accounts/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
export const deleteAccount = (id: string) =>
  api(`/accounts/${encodeURIComponent(id)}`, { method: 'DELETE' })
export const deleteAccountsBatch = (ids: string[]) =>
  api('/accounts/delete-batch', { method: 'POST', body: JSON.stringify({ account_ids: ids }) })
export const probeAccount = (id: string, model?: string) =>
  api(`/accounts/${encodeURIComponent(id)}/probe`, {
    method: 'POST',
    body: JSON.stringify(model ? { model } : {}),
  })
export const probeBatch = (ids: string[]) =>
  api('/accounts/probe-batch', { method: 'POST', body: JSON.stringify({ account_ids: ids }) })
export const probeAll = () => api('/accounts/probe-all', { method: 'POST', body: '{}' })
export const refreshAccounts = (ids?: string[]) =>
  api('/accounts/refresh', {
    method: 'POST',
    body: JSON.stringify(ids?.length ? { account_ids: ids } : { all: true }),
  })
export const getAccountsQuota = (force = false) =>
  api(`/accounts/quota?force=${force ? 1 : 0}`)
export const getAccountQuota = (id: string) =>
  api(`/accounts/${encodeURIComponent(id)}/quota`)
export const importSSO = (body: unknown) =>
  api('/accounts/import-sso', { method: 'POST', body: JSON.stringify(body) })
export const exportAccounts = (body?: unknown) =>
  api('/accounts/export?async_job=1', {
    method: body ? 'POST' : 'GET',
    body: body ? JSON.stringify(body) : undefined,
  })
export const exportSSO = (ids?: string[]) =>
  api('/accounts/export-sso?download=0', {
    method: ids?.length ? 'POST' : 'GET',
    body: ids?.length ? JSON.stringify({ account_ids: ids }) : undefined,
  })
export const pushCLIProxy = (body: Record<string, unknown>) =>
  api('/accounts/push-cliproxyapi', { method: 'POST', body: JSON.stringify(body) })
export const pushSub2Api = (body: Record<string, unknown>) =>
  api('/accounts/push-sub2api', { method: 'POST', body: JSON.stringify(body) })
export const getRegConfig = () => api('/accounts/register-email/config')
export const putRegConfig = (body: Record<string, unknown>) =>
  api('/accounts/register-email/config', { method: 'PUT', body: JSON.stringify(body) })
export const startRegister = (body: Record<string, unknown>) =>
  api('/accounts/register-email', { method: 'POST', body: JSON.stringify(body) })
export const stopRegister = () =>
  api('/accounts/register-email/stop', { method: 'POST', body: '{}' })
export const getRegBatch = (id: string) =>
  api(`/accounts/register-email/batches/${encodeURIComponent(id)}`)
export const getRegSessions = () => api('/accounts/register-email/sessions')
export const getRegSession = (id: string) =>
  api(`/accounts/register-email/sessions/${encodeURIComponent(id)}`)
export const testRegProxy = (body: Record<string, unknown>) =>
  api('/register-email/test-proxy', { method: 'POST', body: JSON.stringify(body) })

export { download, api }
