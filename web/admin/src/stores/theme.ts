import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

function readDark(): boolean {
  try {
    const t = localStorage.getItem('g2a_theme') || 'auto'
    if (t === 'dark') return true
    if (t === 'light') return false
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
  } catch {
    return false
  }
}

export const useTheme = defineStore('theme', () => {
  const isDark = ref(readDark())

  function apply() {
    document.documentElement.classList.toggle('dark', isDark.value)
    document.documentElement.setAttribute('data-theme', isDark.value ? 'dark' : 'light')
  }

  function toggle() {
    isDark.value = !isDark.value
    localStorage.setItem('g2a_theme', isDark.value ? 'dark' : 'light')
    apply()
  }

  apply()
  watch(isDark, apply)

  return { isDark: computed(() => isDark.value), toggle }
})
