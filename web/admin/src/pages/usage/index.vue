<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref } from 'vue'
import {
  Card,
  Table,
  Button,
  Select,
  Input,
  Space,
  Tag,
  Spin,
  App as AntApp,
  message as staticMessage,
} from 'antdv-next'
import { ReloadOutlined, SearchOutlined } from '@antdv-next/icons'
import {
  getUsageByKey,
  getUsageByModel,
  getUsageEvents,
  getUsageSummary,
} from '@/api'
import { fmtNum, fmtTime } from '@/utils/format'

let message = staticMessage
try {
  message = AntApp.useApp().message
} catch {
  /* outside App provider */
}
const loading = ref(false)
const days = ref(7)
const summary = ref<any>({})
const byKey = ref<any[]>([])
const byModel = ref<any[]>([])
const events = ref<any[]>([])
const eventsTotal = ref(0)
const eventsPage = ref(1)
const eventsPageSize = ref(50)
const filters = reactive({ q: '', protocol: 'all', ok: 'all' })
let timer: number | undefined

const dimCols = [
  { title: '名称', dataIndex: 'label', key: 'label' },
  { title: '请求', dataIndex: 'requests', key: 'requests', width: 90 },
  { title: 'Tokens', dataIndex: 'total_tokens', key: 'total_tokens', width: 110 },
  { title: '成功率', dataIndex: 'success_rate', key: 'success_rate', width: 90 },
]

const eventCols = [
  { title: '时间', dataIndex: 'created_at', key: 'created_at', width: 160 },
  { title: '模型', dataIndex: 'model', key: 'model', width: 140 },
  { title: 'Key', dataIndex: 'api_key_name', key: 'api_key_name', width: 120 },
  { title: '结果', dataIndex: 'ok', key: 'ok', width: 80 },
  { title: 'Tokens', dataIndex: 'total_tokens', key: 'total_tokens', width: 100 },
  { title: 'TTFT', dataIndex: 'ttft_ms', key: 'ttft_ms', width: 90 },
  { title: '耗时', dataIndex: 'latency_ms', key: 'latency_ms', width: 90 },
  { title: 'IP', dataIndex: 'client_ip', key: 'client_ip', width: 120 },
]

function mapItems(items: any[], kind: 'key' | 'model') {
  return (items || []).map((it) => ({
    ...it,
    label:
      kind === 'key'
        ? `${it.name || it.prefix || it.id || '—'}${it.prefix ? ` · ${it.prefix}` : ''}`
        : it.id || '—',
    success_rate: it.success_rate != null ? `${it.success_rate}%` : '—',
  }))
}

async function loadSummary() {
  const [sum, k, m] = await Promise.all([
    getUsageSummary(days.value),
    getUsageByKey(days.value),
    getUsageByModel(days.value),
  ])
  summary.value = sum || {}
  byKey.value = mapItems(k.items || [], 'key')
  byModel.value = mapItems(m.items || [], 'model')
}

async function loadEvents(reset = false) {
  if (reset) eventsPage.value = 1
  const params = new URLSearchParams()
  params.set('page', String(eventsPage.value))
  params.set('page_size', String(eventsPageSize.value))
  params.set('days', String(days.value))
  if (filters.q.trim()) params.set('q', filters.q.trim())
  if (filters.protocol !== 'all') params.set('protocol', filters.protocol)
  if (filters.ok !== 'all') params.set('ok', filters.ok)
  const data = await getUsageEvents(params.toString())
  events.value = data.items || data.events || []
  eventsTotal.value = data.total ?? data.count ?? events.value.length
}

function onEventsPage(p: number, ps: number) {
  eventsPage.value = p
  eventsPageSize.value = ps
  loadEvents(false)
}

async function load(full = true) {
  loading.value = true
  try {
    await loadSummary()
    if (full) await loadEvents(true)
    else await loadEvents(false)
  } catch (e: any) {
    message.error(e?.message || '加载用量失败')
  } finally {
    loading.value = false
  }
}

function seriesBars() {
  const rows = summary.value.series || []
  const maxTok = Math.max(1, ...rows.map((r: any) => Number(r.total_tokens || 0)))
  return rows.map((r: any) => {
    const tok = Number(r.total_tokens || 0)
    return {
      day: r.day,
      h: Math.max(4, Math.round((tok / maxTok) * 100)),
      tok,
      req: Number(r.requests || 0),
    }
  })
}

function cardStats() {
  const sum = summary.value
  const today = sum.today || {}
  const window = sum.window || {}
  const life = sum.lifetime || {}
  const cache = sum.cache || {}
  const cacheToday = cache.today || {}
  const cacheWin = cache.window || {}
  const fmtRatio = (v: any) => (v == null || v === '' ? '—' : `${v}%`)
  return [
    {
      label: '今日请求',
      value: fmtNum(today.requests),
      sub: `成功 ${fmtNum(today.success)} · 失败 ${fmtNum(today.fail)}${today.success_rate != null ? ` · ${today.success_rate}%` : ''}`,
    },
    {
      label: '今日 token',
      value: fmtNum(today.total_tokens),
      sub: `输入 ${fmtNum(today.prompt_tokens)} · 输出 ${fmtNum(today.completion_tokens)}`,
      mono: true,
    },
    {
      label: '今日缓存命中',
      value: fmtRatio(cacheToday.token_hit_ratio),
      sub: `读 ${fmtNum(cacheToday.cache_read_tokens || 0)} / 输入 ${fmtNum(cacheToday.prompt_tokens || 0)}`,
      mono: true,
    },
    {
      label: `近 ${days.value} 天 token`,
      value: fmtNum(window.total_tokens),
      sub: `请求 ${fmtNum(window.requests)}${window.success_rate != null ? ` · 成功率 ${window.success_rate}%` : ''}`,
      mono: true,
    },
    {
      label: `近 ${days.value} 天缓存`,
      value: fmtRatio(cacheWin.token_hit_ratio),
      sub: `读 ${fmtNum(cacheWin.cache_read_tokens || 0)}`,
      mono: true,
    },
    {
      label: '累计 token',
      value: fmtNum(life.total_tokens),
      sub: `请求 ${fmtNum(life.requests)} · 源 ${sum.source || '—'}`,
      mono: true,
    },
  ]
}

onMounted(() => {
  load()
  timer = window.setInterval(() => load(false), 20000)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <Spin :spinning="loading">
    <div class="page-toolbar">
      <Select
        v-model:value="days"
        style="width: 120px"
        :options="[
          { value: 1, label: '今天' },
          { value: 7, label: '近 7 天' },
          { value: 14, label: '近 14 天' },
          { value: 30, label: '近 30 天' },
        ]"
        @change="() => load(true)"
      />
      <Button type="primary" @click="() => load(true)">
        <template #icon><ReloadOutlined /></template>
        刷新
      </Button>
    </div>

    <div class="stat-grid">
      <Card v-for="(it, i) in cardStats()" :key="i" size="small" class="stat-item page-card">
        <div class="label">{{ it.label }}</div>
        <div class="value" :class="{ mono: it.mono }">{{ it.value }}</div>
        <div class="sub">{{ it.sub }}</div>
      </Card>
    </div>

    <Card title="每日 token" size="small" class="page-card">
      <div v-if="!seriesBars().length" style="opacity: 0.55">暂无数据</div>
      <div v-else class="usage-bars">
        <div
          v-for="b in seriesBars()"
          :key="b.day"
          class="usage-bar"
          :title="`${b.day} · ${fmtNum(b.tok)} tok · ${b.req} 请求`"
        >
          <div class="usage-bar-fill" :style="{ height: b.h + '%' }" />
          <div class="usage-bar-label">{{ String(b.day || '').slice(5) }}</div>
          <div class="usage-bar-val">{{ fmtNum(b.tok) }}</div>
        </div>
      </div>
    </Card>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px">
      <Card title="按 API Key" size="small" class="page-card">
        <Table
          :data-source="byKey"
          :columns="dimCols"
          row-key="id"
          size="small"
          :pagination="false"
        />
      </Card>
      <Card title="按模型" size="small" class="page-card">
        <Table
          :data-source="byModel"
          :columns="dimCols"
          row-key="id"
          size="small"
          :pagination="false"
        />
      </Card>
    </div>

    <Card title="使用明细" size="small" class="page-card">
      <div class="page-toolbar">
        <Input
          v-model:value="filters.q"
          placeholder="Key / 账号 / 模型 / 路径 / IP"
          style="max-width: 260px"
          allow-clear
          @press-enter="() => loadEvents(true)"
        />
        <Select
          v-model:value="filters.protocol"
          style="width: 160px"
          :options="[
            { value: 'all', label: '全部协议' },
            { value: 'openai', label: 'openai' },
            { value: 'anthropic', label: 'anthropic' },
            { value: 'openai_responses', label: 'responses' },
          ]"
        />
        <Select
          v-model:value="filters.ok"
          style="width: 120px"
          :options="[
            { value: 'all', label: '全部结果' },
            { value: 'true', label: '成功' },
            { value: 'false', label: '失败' },
          ]"
        />
        <Button type="primary" @click="() => loadEvents(true)">
          <template #icon><SearchOutlined /></template>
          查询
        </Button>
      </div>
      <Table
        :data-source="events"
        :columns="eventCols"
        row-key="id"
        size="small"
        :pagination="{
          current: eventsPage,
          pageSize: eventsPageSize,
          total: eventsTotal,
          showSizeChanger: true,
          onChange: onEventsPage,
        }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'created_at'">{{ fmtTime(record.created_at || record.ts) }}</template>
          <template v-else-if="column.key === 'ok'">
            <Tag :color="record.ok ? 'success' : 'error'">{{ record.ok ? 'OK' : 'FAIL' }}</Tag>
          </template>
          <template v-else-if="column.key === 'model'">
            <span class="mono">{{ record.model || '—' }}</span>
          </template>
          <template v-else-if="column.key === 'total_tokens'">
            <span class="mono">{{ fmtNum(record.total_tokens) }}</span>
          </template>
        </template>
      </Table>
    </Card>
  </Spin>
</template>
