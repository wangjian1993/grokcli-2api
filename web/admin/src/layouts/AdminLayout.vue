<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Layout,
  LayoutHeader,
  LayoutSider,
  LayoutContent,
  Menu,
  Button,
  Space,
  TypographyTitle,
  TypographyText,
  Tag,
  message,
} from 'antdv-next'
import {
  DashboardOutlined,
  KeyOutlined,
  TeamOutlined,
  BarChartOutlined,
  FileTextOutlined,
  AppstoreOutlined,
  SettingOutlined,
  BookOutlined,
  LogoutOutlined,
  MoonOutlined,
  SunOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  ReloadOutlined,
} from '@antdv-next/icons'
import { useUserStore } from '@/stores/user'
import { useTheme } from '@/stores/theme'
import { onUnauthorized, clearToken } from '@/utils/request'

const route = useRoute()
const router = useRouter()
const user = useUserStore()
const themeStore = useTheme()
const collapsed = ref(false)
const statusPill = ref('—')
const version = ref('')

const selectedKeys = computed(() => {
  const name = String(route.name || 'overview')
  return [name]
})

const menuItems = [
  { key: 'overview', icon: () => h(DashboardOutlined), label: '总览', path: '/overview' },
  { key: 'keys', icon: () => h(KeyOutlined), label: 'API Keys', path: '/keys' },
  { key: 'accounts', icon: () => h(TeamOutlined), label: '账号', path: '/accounts' },
  { key: 'usage', icon: () => h(BarChartOutlined), label: '用量', path: '/usage' },
  { key: 'logs', icon: () => h(FileTextOutlined), label: '日志', path: '/logs' },
  { key: 'models', icon: () => h(AppstoreOutlined), label: '模型', path: '/models' },
  { key: 'settings', icon: () => h(SettingOutlined), label: '设置', path: '/settings' },
  { key: 'guide', icon: () => h(BookOutlined), label: '指南', path: '/guide' },
]

function onMenuClick(info: { key: string | number }) {
  const item = menuItems.find((m) => m.key === String(info.key))
  if (item) router.push(item.path)
}

async function refreshStatus() {
  try {
    const st = await user.fetchStatus()
    if (st?.setup_needed) {
      clearToken()
      router.replace('/login')
      return
    }
    version.value = st?.version ? `v${st.version}` : ''
    const mode = st?.account_mode || ''
    const live = st?.accounts?.active_count ?? st?.pool?.live
    const email = st?.credentials_email || ''
    statusPill.value =
      [email, mode, live != null ? `账号 ${live}` : ''].filter(Boolean).join(' · ') || '—'
  } catch (e: any) {
    if (e?.status === 401 && !e.soft) {
      clearToken()
      router.replace('/login')
    }
  }
}

async function doLogout() {
  await user.logout()
  message.success('已退出')
  router.replace('/login')
}

onMounted(async () => {
  onUnauthorized(() => {
    clearToken()
    router.replace({ path: '/login', query: { next: route.fullPath } })
    message.warning('会话已失效，请重新登录')
  })
  try {
    await user.fetchSession()
  } catch {
    clearToken()
    router.replace({ path: '/login', query: { next: route.fullPath } })
    return
  }
  await refreshStatus()
})
</script>

<template>
  <Layout style="min-height: 100%">
    <LayoutSider
      v-model:collapsed="collapsed"
      collapsible
      :trigger="null"
      :width="220"
      :theme="themeStore.isDark ? 'dark' : 'light'"
      style="border-right: 1px solid rgba(0, 0, 0, 0.06)"
    >
      <div
        style="
          height: 56px;
          display: flex;
          align-items: center;
          padding: 0 16px;
          font-weight: 700;
          letter-spacing: 0.02em;
        "
      >
        <span v-if="!collapsed">grokcli-2api</span>
        <span v-else>G2A</span>
      </div>
      <Menu
        mode="inline"
        :selected-keys="selectedKeys"
        :items="menuItems"
        @click="onMenuClick"
      />
    </LayoutSider>
    <Layout>
      <LayoutHeader
        style="
          background: transparent;
          padding: 0 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 64px;
          border-bottom: 1px solid rgba(0, 0, 0, 0.06);
        "
      >
        <Space>
          <Button type="text" @click="collapsed = !collapsed">
            <template #icon>
              <MenuUnfoldOutlined v-if="collapsed" />
              <MenuFoldOutlined v-else />
            </template>
          </Button>
          <div>
            <TypographyTitle :level="4" style="margin: 0">{{ route.meta.title }}</TypographyTitle>
            <TypographyText type="secondary" style="font-size: 12px">{{
              route.meta.sub
            }}</TypographyText>
          </div>
        </Space>
        <Space wrap>
          <Tag>{{ statusPill }}</Tag>
          <TypographyText v-if="version" type="secondary">{{ version }}</TypographyText>
          <Button type="text" @click="themeStore.toggle()">
            <template #icon>
              <SunOutlined v-if="themeStore.isDark" />
              <MoonOutlined v-else />
            </template>
          </Button>
          <Button type="text" @click="refreshStatus">
            <template #icon><ReloadOutlined /></template>
          </Button>
          <Button type="text" danger @click="doLogout">
            <template #icon><LogoutOutlined /></template>
            退出
          </Button>
        </Space>
      </LayoutHeader>
      <LayoutContent style="padding: 16px 20px 32px">
        <router-view />
      </LayoutContent>
    </Layout>
  </Layout>
</template>
