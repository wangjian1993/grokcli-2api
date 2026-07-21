<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { Card, Space, Button, Typography, Tag, Spin, App as AntApp,
  message as staticMessage,
} from 'antdv-next'
import { ReloadOutlined } from '@antdv-next/icons'
import { getDashboard, getStatus } from '@/api'
import { fmtNum, fmtRemaining, fmtTime } from '@/utils/format'

const { Text } = Typography
let message = staticMessage
try {
  message = AntApp.useApp().message
} catch {
  /* outside App provider */
}
const loading = ref(false)
const status = ref<any>({})
const dash = ref<any>({})
let timer: number | undefined

function pool() {
  return Object.assign({}, dash.value.pool || {}, status.value.pool || {})
}

function stats() {
  const s = status.value || {}
  const d = dash.value || {}
  const p = pool()
  const keys = d.keys || s.keys || {}
  const acc = d.accounts || s.accounts || {}
  const tm = d.token_maintainer || s.token_maintainer || {}
  const lastTm = tm.last || {}
  const rem = tm.min_remaining_sec != null ? tm.min_remaining_sec : lastTm.min_remaining_sec
  const nextWait =
    tm.next_wait_sec != null
      ? tm.next_wait_sec
      : lastTm.next_wait_sec != null
        ? lastTm.next_wait_sec
        : tm.interval_sec
  const remLabel =
    rem == null || rem === ''
      ? '—'
      : Number(rem) < 0
        ? '已过期'
        : fmtRemaining(Date.now() / 1000 + Number(rem))
  const lastRef =
    lastTm.refresh && lastTm.refresh.refreshed != null ? lastTm.refresh.refreshed : null
  return [
    { label: 'API Base', value: d.api_base || s.api_base || '—', mono: true },
    {
      label: 'CLI 版本',
      value: d.cli_version || s.cli_version || '—',
      sub: `上游 ${d.upstream || s.upstream || '—'}`,
      mono: true,
    },
    {
      label: '账号池',
      value: `${p.total ?? acc.account_count ?? 0} 总量 · ${p.live ?? p.enabled ?? acc.active_count ?? 0} 可轮询`,
      sub: `模式 ${d.account_mode || s.account_mode || '—'} · 冷却 ${p.in_cooldown ?? 0} · 过期 ${p.expired ?? 0} · 模型封禁 ${p.model_blocked ?? 0} · 额度禁用 ${p.quota_disabled ?? 0} · 禁用 ${p.disabled ?? 0}`,
    },
    {
      label: 'API Keys',
      value: `${keys.enabled ?? 0} 启用 / ${keys.total ?? 0}`,
      sub: `请求累计 ${keys.total_requests ?? 0} · 鉴权 ${keys.auth_required ? '开启' : '关闭'}`,
    },
    {
      label: '今日用量',
      value: `${fmtNum((d.usage || s.usage || {}).today_tokens || 0)} token`,
      sub: `请求 ${(d.usage || s.usage || {}).today_requests ?? 0} · 累计 ${(d.usage || s.usage || {}).total_tokens ?? 0} token`,
      mono: true,
    },
    {
      label: 'Token 自动续期',
      value:
        tm.running || tm.cluster_running || tm.leader_running
          ? '运行中'
          : tm.enabled === false
            ? '已关闭'
            : tm.enabled
              ? '已启用'
              : '未运行',
      sub: `最短剩余 ${remLabel} · 下次 ${nextWait ?? '—'}s${lastRef != null ? ` · 上次刷新 ${lastRef}` : ''}${lastTm.at ? ` · ${fmtTime(lastTm.at)}` : ''}`,
    },
  ]
}

async function load() {
  loading.value = true
  try {
    status.value = await getStatus()
    try {
      dash.value = await getDashboard()
    } catch (e: any) {
      console.warn(e)
    }
  } catch (e: any) {
    message.error(e?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  load()
  timer = window.setInterval(load, 15000)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <Spin :spinning="loading">
    <div class="page-toolbar">
      <Button type="primary" @click="load">
        <template #icon><ReloadOutlined /></template>
        刷新
      </Button>
      <Tag :color="status.credentials_ok ? 'success' : 'error'">
        {{ status.credentials_ok ? '凭证正常' : '凭证异常 / 未就绪' }}
      </Tag>
    </div>
    <div class="stat-grid">
      <Card v-for="(it, i) in stats()" :key="i" size="small" class="stat-item page-card">
        <div class="label">{{ it.label }}</div>
        <div class="value" :class="{ mono: it.mono }">{{ it.value }}</div>
        <div v-if="it.sub" class="sub">{{ it.sub }}</div>
      </Card>
    </div>
    <Card title="存储与服务" size="small" class="page-card">
      <Space direction="vertical">
        <Text>
          store:
          <Text code>{{ status.store_backend || dash.store_backend || '—' }}</Text>
          · runtime:
          <Text code>{{ status.runtime || dash.runtime || 'go' }}</Text>
          · version:
          <Text code>{{ status.version || dash.version || '—' }}</Text>
        </Text>
        <Text type="secondary">
          model_health:
          {{
            (dash.model_health || status.model_health || {}).running
              ? '运行中'
              : (dash.model_health || status.model_health || {}).enabled
                ? '已启用'
                : '—'
          }}
        </Text>
      </Space>
    </Card>
  </Spin>
</template>
