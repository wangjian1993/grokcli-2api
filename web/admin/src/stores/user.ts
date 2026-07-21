import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api, clearToken, getToken, setToken } from '@/utils/request'

export const useUserStore = defineStore('user', () => {
  const token = ref(getToken())
  const authenticated = ref(!!token.value)
  const setupNeeded = ref(false)
  const status = ref<any>(null)

  function setAuthToken(t: string) {
    setToken(t)
    token.value = t
    authenticated.value = !!t
  }

  function logoutLocal() {
    clearToken()
    token.value = ''
    authenticated.value = false
  }

  async function fetchSession() {
    const res = await api<{ ok?: boolean; authenticated?: boolean; token?: string }>('/session')
    if (res?.token) setAuthToken(res.token)
    authenticated.value = true
    return res
  }

  async function fetchStatus() {
    const res = await api('/status')
    status.value = res
    setupNeeded.value = !!(res && res.setup_needed)
    return res
  }

  async function login(password: string) {
    const res = await api<{ token?: string }>('/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    })
    if (res?.token) setAuthToken(res.token)
    authenticated.value = true
    return res
  }

  async function setup(password: string) {
    const res = await api<{ token?: string }>('/setup', {
      method: 'POST',
      body: JSON.stringify({ password }),
    })
    if (res?.token) setAuthToken(res.token)
    authenticated.value = true
    setupNeeded.value = false
    return res
  }

  async function logout() {
    try {
      await api('/logout', { method: 'POST', body: '{}' })
    } catch {
      /* ignore */
    }
    logoutLocal()
  }

  return {
    token,
    authenticated,
    setupNeeded,
    status,
    setAuthToken,
    logoutLocal,
    fetchSession,
    fetchStatus,
    login,
    setup,
    logout,
  }
})
