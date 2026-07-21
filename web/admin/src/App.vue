<script setup lang="ts">
import { ConfigProvider, App as AntApp, theme } from 'antdv-next'
import zhCN from 'antdv-next/locale/zh_CN'
import { computed } from 'vue'
import { useTheme } from '@/stores/theme'

const themeStore = useTheme()
const algorithm = computed(() =>
  themeStore.isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
)
</script>

<template>
  <ConfigProvider
    :locale="zhCN"
    :theme="{
      algorithm,
      token: { colorPrimary: '#1677ff', borderRadius: 8 },
    }"
  >
    <AntApp>
      <router-view />
    </AntApp>
  </ConfigProvider>
</template>
