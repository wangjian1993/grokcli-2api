<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import { Page } from '@/components'
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import {
  Card,
  Button,
  Select,
  Input,
  Tag,
  Spin,
  Tooltip,
  Progress,
  Segmented,
  Empty,
  App as AntApp,
  message as staticMessage,
} from 'antdv-next'
import {
  ReloadOutlined,
  SearchOutlined,
} from '@antdv-next/icons'
import {
  getUsageByKey,
  getUsageByModel,
  getUsageEvents,
  getUsageSummary,
} from '@/api/g2a'
import {
  eventBilled,
  fmtLatency,
  fmtNum,
  fmtTime,
  fmtTimeShort,
  fmtTokenCell,
  fmtTokens,
  promptBilled,
  tokensToM,
  usageBilled,
} from '@/utils/g2a/format'
import { withDefaultVxeGridOptions } from '@/components/vxe-table'
import { VxeGrid } from 'vxe-table'
import type { VxeGridListeners, VxeGridProps } from 'vxe-table'
import BaseChart from '@/views/dashboard/analytics/components/base-chart.vue'

defineOptions({ name: 'G2aUsage' })

let message = staticMessage
try {
  message = AntApp.useApp().message
} catch {
  /* outside App provider */
}

const loading = ref(false)
const eventsLoading = ref(false)
const days = ref(7)
const summary = ref<any>({})
const byKey = ref<any[]>([])
const byModel = ref<any[]>([])
const events = ref<any[]>([])
const eventsTotal = ref(0)
const eventsPage = ref(1)
const eventsPageSize = ref(50)
const eventsSource = ref('')
const lastRefreshAt = ref<number | null>(null)
const filters = reactive({
  q: '',
  protocol: 'all',
  ok: 'all',
  stream: 'all',
})
const tableScrollY = ref(480)
const eventsWrapRef = ref<HTMLElement | null>(null)
const dimTab = ref<'key' | 'model'>('key')
let timer: number | undefined
let resizeObs: ResizeObserver | undefined

const dayOptions = [
  { value: 1, label: '今天' },
  { value: 7, label: '近 7 天' },
  { value: 14, label: '近 14 天' },
  { value: 30, label: '近 30 天' },
]

function makeDimGrid(height = 320) {
  return withDefaultVxeGridOptions({
    size: 'small',
    border: 'inner',
    height,
    showOverflow: true,
    data: [] as any[],
    columns: [
      {
        field: 'rank',
        title: '#',
        width: 44,
        slots: { default: 'rank' },
      },
      {
        field: 'label',
        title: '名称',
        minWidth: 150,
        align: 'left',
        headerAlign: 'left',
        slots: { default: 'label' },
      },
      {
        field: 'requests',
        title: '请求',
        width: 90,
        slots: { default: 'requests' },
      },
      {
        field: 'billed',
        title: '计费 token',
        minWidth: 130,
        slots: { default: 'billed' },
      },
      {
        field: 'share',
        title: '占比',
        width: 118,
        slots: { default: 'share' },
      },
      {
        field: 'success_rate',
        title: '成功率',
        width: 88,
        slots: { default: 'rate' },
      },
    ] as VxeGridProps['columns'],
    pagerConfig: { enabled: false },
    toolbarConfig: { enabled: false },
    proxyConfig: { enabled: false },
    rowConfig: { isHover: true },
  })
}

const dimGridOptions = makeDimGrid()

const eventGridOptions = withDefaultVxeGridOptions({
  size: 'small',
  border: 'inner',
  height: 480,
  showOverflow: true,
  loading: false,
  data: [] as any[],
  columns: [
    {
      field: 'created_at',
      title: '时间',
      width: 148,
      fixed: 'left',
      slots: { default: 'created_at' },
    },
    {
      field: 'ok',
      title: '结果',
      width: 72,
      slots: { default: 'ok' },
    },
    {
      field: 'protocol',
      title: '协议',
      width: 118,
      slots: { default: 'protocol' },
    },
    {
      field: 'stream',
      title: '模式',
      width: 68,
      slots: { default: 'stream' },
    },
    {
      field: 'api_key',
      title: 'Key',
      minWidth: 130,
      slots: { default: 'api_key' },
    },
    {
      field: 'model',
      title: '模型 / 账号',
      minWidth: 150,
      slots: { default: 'model' },
    },
    {
      field: 'client_ip',
      title: 'IP',
      width: 108,
      slots: { default: 'client_ip' },
    },
    {
      field: 'prompt_tokens',
      title: '输入',
      width: 80,
      slots: { default: 'prompt_tokens' },
    },
    {
      field: 'completion_tokens',
      title: '输出',
      width: 80,
      slots: { default: 'completion_tokens' },
    },
    {
      field: 'billed',
      title: '计费',
      width: 100,
      slots: { default: 'billed' },
    },
    {
      field: 'cache',
      title: '缓存',
      width: 110,
      slots: { default: 'cache' },
    },
    {
      field: 'reasoning_tokens',
      title: '推理',
      width: 76,
      slots: { default: 'reasoning_tokens' },
    },
    {
      field: 'effort',
      title: 'effort',
      width: 78,
      slots: { default: 'effort' },
    },
    {
      field: 'ttft_ms',
      title: 'TTFT',
      width: 76,
      slots: { default: 'ttft_ms' },
    },
    {
      field: 'latency_ms',
      title: '耗时',
      width: 76,
      slots: { default: 'latency_ms' },
    },
  ] as VxeGridProps['columns'],
  pagerConfig: {
    enabled: true,
    currentPage: 1,
    pageSize: 50,
    total: 0,
    pageSizes: [25, 50, 100, 200],
    background: true,
    layouts: ['Total', 'Sizes', 'PrevPage', 'Number', 'NextPage'],
  },
  toolbarConfig: { enabled: false },
  proxyConfig: { enabled: false },
  rowConfig: { keyField: 'id', isHover: true },
})

const eventGridEvents: VxeGridListeners = {
  pageChange({ currentPage, pageSize: ps }) {
    eventsPage.value = currentPage
    eventsPageSize.value = ps
    loadEvents(false).catch((e: any) => message.error(e?.message || '加载明细失败'))
  },
}

function mapItems(items: any[], kind: 'key' | 'model') {
  const list = (items || []).map((it, idx) => ({
    ...it,
    rank: idx + 1,
    label:
      kind === 'key'
        ? `${it.name || it.prefix || it.id || '—'}${it.prefix ? ` · ${it.prefix}` : ''}`
        : it.id || it.model || '—',
    success_rate_num:
      it.success_rate != null && it.success_rate !== ''
        ? Number(it.success_rate)
        : null,
    billed: usageBilled(it),
  }))
  const totalBilled = list.reduce((s, r) => s + (Number(r.billed) || 0), 0) || 1
  return list.map((r) => ({
    ...r,
    share: Math.min(100, Math.round(((Number(r.billed) || 0) / totalBilled) * 1000) / 10),
  }))
}

const dimRows = computed(() => (dimTab.value === 'key' ? byKey.value : byModel.value))
const dimShareColor = computed(() => (dimTab.value === 'key' ? '#1677ff' : '#52c41a'))

watch(loading, (v) => {
  if (v) eventGridOptions.loading = true
  else if (!eventsLoading.value) eventGridOptions.loading = false
})
watch(eventsLoading, (v) => {
  eventGridOptions.loading = v || loading.value
})
watch(
  dimRows,
  (v) => {
    dimGridOptions.data = v
  },
  { immediate: true },
)
watch(
  events,
  (v) => {
    eventGridOptions.data = v
  },
  { immediate: true },
)
watch(eventsTotal, (v) => {
  if (eventGridOptions.pagerConfig) eventGridOptions.pagerConfig.total = v
})
watch(eventsPage, (v) => {
  if (eventGridOptions.pagerConfig) eventGridOptions.pagerConfig.currentPage = v
})
watch(eventsPageSize, (v) => {
  if (eventGridOptions.pagerConfig) eventGridOptions.pagerConfig.pageSize = v
})
watch(tableScrollY, (v) => {
  eventGridOptions.height = Math.max(360, v)
})

function fmtRatio(v: any) {
  return v == null || v === '' ? '—' : `${v}%`
}

function rateColor(rate: number | null | undefined) {
  if (rate == null || !Number.isFinite(rate)) return 'default'
  if (rate >= 98) return 'success'
  if (rate >= 90) return 'processing'
  if (rate >= 80) return 'warning'
  return 'error'
}

function rankClass(rank: number) {
  if (rank === 1) return 'gold'
  if (rank === 2) return 'silver'
  if (rank === 3) return 'bronze'
  return ''
}

const lastRefreshLabel = computed(() => {
  if (!lastRefreshAt.value) return ''
  return fmtTimeShort(lastRefreshAt.value)
})

const kpis = computed(() => {
  const sum = summary.value || {}
  const today = sum.today || {}
  const window = sum.window || {}
  const life = sum.lifetime || {}
  const cache = sum.cache || {}
  const cacheToday = cache.today || {}
  const cacheWin = cache.window || {}
  return [
    {
      key: 'req',
      label: '今日请求',
      value: fmtNum(today.requests),
      sub: `成功 ${fmtNum(today.success)} · 失败 ${fmtNum(today.fail)}`,
      meta: today.success_rate != null ? `${today.success_rate}%` : '',
      metaColor: rateColor(Number(today.success_rate)),
      tone: 'blue',
      icon: 'icon-[lucide--activity]',
    },
    {
      key: 'tok',
      label: '今日计费 token',
      value: fmtTokens(usageBilled(today), ''),
      sub: `入 ${fmtNum(promptBilled(today))} · 出 ${fmtNum(today.completion_tokens)}`,
      meta: Number(today.cache_read_tokens || 0) > 0
        ? `缓存 −${fmtNum(today.cache_read_tokens)}`
        : '',
      mono: true,
      tone: 'green',
      icon: 'icon-[lucide--zap]',
    },
    {
      key: 'cache',
      label: '今日缓存命中',
      value: fmtRatio(cacheToday.token_hit_ratio),
      sub: `读 ${fmtNum(cacheToday.cache_read_tokens || 0)} / 入 ${fmtNum(cacheToday.prompt_tokens || 0)}`,
      meta: cacheToday.request_hit_ratio != null
        ? `请求 ${fmtRatio(cacheToday.request_hit_ratio)}`
        : '',
      mono: true,
      tone: 'purple',
      icon: 'icon-[lucide--database]',
    },
    {
      key: 'win',
      label: `近 ${days.value} 天计费`,
      value: fmtTokens(usageBilled(window), ''),
      sub: `请求 ${fmtNum(window.requests)}${window.success_rate != null ? ` · ${window.success_rate}%` : ''}`,
      meta: cacheWin.token_hit_ratio != null
        ? `缓存 ${fmtRatio(cacheWin.token_hit_ratio)}`
        : '',
      mono: true,
      tone: 'orange',
      icon: 'icon-[lucide--chart-column]',
    },
    {
      key: 'life',
      label: '累计计费 token',
      value: fmtTokens(usageBilled(life), ''),
      sub: `累计请求 ${fmtNum(life.requests)} · 源 ${sum.source || '—'}`,
      meta: '',
      mono: true,
      tone: 'slate',
      icon: 'icon-[lucide--layers]',
    },
  ]
})

const hasTrend = computed(() => {
  const rows = summary.value?.series
  return Array.isArray(rows) && rows.length > 0
})

const trendOption = computed<EChartsOption>(() => {
  const rows = (summary.value?.series || []) as any[]
  const daysLabel = rows.map((r) => String(r.day || '').slice(5) || r.day || '—')
  const reqs = rows.map((r) => Number(r.requests || 0))
  const tokens = rows.map((r) =>
    tokensToM(r.billed_tokens != null ? r.billed_tokens : r.total_tokens || 0),
  )
  const rates = rows.map((r) => Number(r.success_rate ?? 0))

  return {
    color: ['#1677ff', '#52c41a', '#faad14'],
    grid: { top: 44, left: 8, right: 12, bottom: 4, containLabel: true },
    legend: {
      data: ['请求', 'Token (M)', '成功率'],
      top: 4,
      right: 8,
      icon: 'roundRect',
      itemWidth: 12,
      itemHeight: 4,
      textStyle: { fontSize: 12 },
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255,255,255,0.96)',
      borderColor: '#eee',
      borderWidth: 1,
      textStyle: { color: '#333', fontSize: 12 },
      formatter(params: any) {
        const list = Array.isArray(params) ? params : [params]
        if (!list.length) return ''
        const day = list[0].axisValue
        const lines = list.map((p: any) => {
          let val = p.value
          if (p.seriesName === 'Token (M)') val = `${Number(val).toFixed(2)} M`
          else if (p.seriesName === '成功率') val = `${val}%`
          else val = fmtNum(val)
          return `${p.marker}${p.seriesName}: <b>${val}</b>`
        })
        return `<div style="margin-bottom:4px">${day}</div>${lines.join('<br/>')}`
      },
    },
    xAxis: {
      type: 'category',
      boundaryGap: true,
      data: daysLabel.length ? daysLabel : ['—'],
      axisLine: { lineStyle: { color: '#e8e8e8' } },
      axisTick: { show: false },
      axisLabel: { color: '#8c8c8c', fontSize: 11 },
    },
    yAxis: [
      {
        type: 'value',
        name: '请求',
        nameTextStyle: { color: '#8c8c8c', fontSize: 11 },
        splitLine: { lineStyle: { type: 'dashed', color: '#f0f0f0' } },
        axisLabel: { color: '#8c8c8c', fontSize: 11 },
      },
      {
        type: 'value',
        name: 'Token (M)',
        nameTextStyle: { color: '#8c8c8c', fontSize: 11 },
        splitLine: { show: false },
        axisLabel: {
          color: '#8c8c8c',
          fontSize: 11,
          formatter: (v: number) => (Number.isFinite(v) ? String(v) : '0'),
        },
      },
      {
        type: 'value',
        min: 0,
        max: 100,
        show: false,
      },
    ],
    series: [
      {
        name: '请求',
        type: 'bar',
        barMaxWidth: 26,
        itemStyle: {
          borderRadius: [4, 4, 0, 0],
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: '#69b1ff' },
              { offset: 1, color: '#1677ff' },
            ],
          },
        },
        data: reqs.length ? reqs : [0],
      },
      {
        name: 'Token (M)',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { width: 2.5 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(82,196,26,0.22)' },
              { offset: 1, color: 'rgba(82,196,26,0.02)' },
            ],
          },
        },
        data: tokens.length ? tokens : [0],
      },
      {
        name: '成功率',
        type: 'line',
        yAxisIndex: 2,
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 1.5, type: 'dashed' },
        data: rates.length ? rates : [0],
      },
    ],
  }
})

function keyLabel(it: any) {
  if (it.api_key_name) {
    return `${it.api_key_name}${it.api_key_prefix ? ' · ' + it.api_key_prefix : ''}`
  }
  return it.api_key_prefix || it.api_key_id || '—'
}

function streamFlag(it: any): boolean | null {
  if (it.stream === true || it.stream === 1 || it.stream === '1') return true
  if (it.stream === false || it.stream === 0 || it.stream === '0') return false
  if (it.detail?.stream != null) return !!it.detail.stream
  return null
}

function effortOf(it: any): string {
  const raw =
    it.reasoning_effort ||
    it.detail?.reasoning_effort ||
    it.detail?.thinking_intensity ||
    it.detail?.thinking_effort ||
    ''
  return String(raw || '').trim().toLowerCase()
}

function effortColor(effort: string) {
  if (!effort) return 'default'
  if (effort === 'low') return 'default'
  if (effort === 'medium') return 'warning'
  if (effort === 'high' || effort === 'xhigh' || effort === 'max' || effort === 'ultracode') {
    return 'error'
  }
  return 'default'
}

function cacheCell(it: any) {
  const cacheRead = Number(it.cache_read_tokens || 0)
  const cacheCreate = Number(it.cache_creation_tokens || 0)
  const promptTok = Number(it.prompt_tokens || 0)
  const total = cacheRead + cacheCreate
  if (total <= 0) return { text: '—', sub: '', title: '' }
  const hitPct =
    promptTok > 0 && cacheRead > 0
      ? Math.min(100, Math.round((cacheRead / promptTok) * 1000) / 10)
      : null
  const parts: string[] = []
  if (cacheRead > 0) parts.push(`读 ${fmtNum(cacheRead)}`)
  if (cacheCreate > 0) parts.push(`写 ${fmtNum(cacheCreate)}`)
  if (hitPct != null) parts.push(`${hitPct}%`)
  return {
    text: fmtNum(total),
    sub: parts.join(' · '),
    title: parts.join(' · '),
  }
}

function billTitle(it: any) {
  const billed = eventBilled(it)
  const total = Number(it.total_tokens || 0)
  const cacheRead = Number(it.cache_read_tokens || 0)
  if (cacheRead > 0) {
    return `计费 ${fmtNum(billed)}（原 total ${fmtNum(total)} − cache_read ${fmtNum(cacheRead)}）`
  }
  return `计费 ${fmtNum(billed)}`
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
  lastRefreshAt.value = Date.now()
}

async function loadEvents(reset = false) {
  if (reset) eventsPage.value = 1
  eventsLoading.value = true
  try {
    const params = new URLSearchParams()
    params.set('page', String(eventsPage.value))
    params.set('page_size', String(eventsPageSize.value))
    if (filters.q.trim()) params.set('q', filters.q.trim())
    const protocol =
      filters.protocol === 'openai' ? 'openai_chat' : filters.protocol
    if (protocol !== 'all') params.set('protocol', protocol)
    if (filters.ok !== 'all') params.set('ok', filters.ok)
    if (filters.stream !== 'all') params.set('stream', filters.stream)
    const data = await getUsageEvents(params.toString())
    events.value = data.items || data.events || []
    eventsTotal.value = data.total ?? data.count ?? events.value.length
    eventsSource.value = data.store_source || data.source || ''
  } finally {
    eventsLoading.value = false
  }
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
    await nextTick()
    measureEventsHeight()
  }
}

/** 静默刷新：仅更新摘要与排行，避免明细表格闪烁 */
async function softRefresh() {
  try {
    await loadSummary()
  } catch {
    /* ignore soft refresh errors */
  }
}

function measureEventsHeight() {
  try {
    const el = eventsWrapRef.value
    if (!el) return
    const toolbar = el.querySelector('.events-toolbar') as HTMLElement | null
    const paginationH = 52
    const cardHead = 8
    const top = (toolbar?.offsetHeight || 40) + cardHead + 16
    const rect = el.getBoundingClientRect()
    const avail = window.innerHeight - rect.top - top - paginationH - 20
    tableScrollY.value = Math.max(360, Math.min(760, avail))
  } catch {
    /* ignore */
  }
}

function onDaysChange() {
  load(true)
}

function onFilterSelectChange() {
  loadEvents(true).catch((e: any) => message.error(e?.message || '加载明细失败'))
}

function resetFilters() {
  filters.q = ''
  filters.protocol = 'all'
  filters.ok = 'all'
  filters.stream = 'all'
  loadEvents(true).catch((e: any) => message.error(e?.message || '加载明细失败'))
}

onMounted(() => {
  load()
  // 摘要每 20s 软刷新；明细仅手动/筛选时刷新，减少表格跳动
  timer = window.setInterval(() => softRefresh(), 20000)
  window.addEventListener('resize', measureEventsHeight)
  nextTick(() => {
    measureEventsHeight()
    if (typeof ResizeObserver !== 'undefined' && eventsWrapRef.value) {
      resizeObs = new ResizeObserver(() => measureEventsHeight())
      resizeObs.observe(eventsWrapRef.value)
    }
  })
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
  window.removeEventListener('resize', measureEventsHeight)
  resizeObs?.disconnect()
})
</script>

<template>
  <Page auto-content-height>
    <div class="usage-page">
      <!-- 顶部工具栏 -->
      <div class="usage-header">
        <div class="usage-header-left">
          <span class="usage-header-title">用量</span>
          <span class="usage-header-hint">计费 token 已扣缓存读</span>
          <Tag v-if="lastRefreshLabel" class="refresh-tag">
            更新 {{ lastRefreshLabel }}
          </Tag>
        </div>
        <div class="usage-header-actions">
          <Segmented
            v-model:value="days"
            :options="dayOptions"
            @change="onDaysChange"
          />
          <Button type="primary" :loading="loading" @click="() => load(true)">
            <template #icon><ReloadOutlined /></template>
            刷新
          </Button>
        </div>
      </div>

      <!-- KPI -->
      <Spin :spinning="loading && !lastRefreshAt">
        <div class="kpi-grid">
          <div
            v-for="it in kpis"
            :key="it.key"
            class="kpi-card"
            :class="'tone-' + it.tone"
          >
            <div class="kpi-icon-wrap">
              <span class="kpi-icon" :class="it.icon" />
            </div>
            <div class="kpi-body">
              <div class="kpi-top">
                <span class="kpi-label">{{ it.label }}</span>
                <Tag v-if="it.meta" :color="it.metaColor || 'default'" class="kpi-tag">
                  {{ it.meta }}
                </Tag>
              </div>
              <div class="kpi-value" :class="{ mono: it.mono }">{{ it.value }}</div>
              <div class="kpi-sub">{{ it.sub }}</div>
            </div>
          </div>
        </div>
      </Spin>

      <!-- 趋势 + 维度 -->
      <div class="usage-main-grid">
        <Card size="small" class="page-card chart-card" :bordered="false">
          <template #title>
            <div class="card-title-row">
              <span>每日趋势</span>
              <span class="card-title-hint">请求 · 计费 Token · 成功率</span>
            </div>
          </template>
          <div v-if="!hasTrend && !loading" class="chart-empty">
            <Empty :image="Empty.PRESENTED_IMAGE_SIMPLE" description="暂无趋势数据" />
          </div>
          <BaseChart v-else :option="trendOption" height="300px" />
        </Card>

        <Card size="small" class="page-card dim-card" :bordered="false">
          <template #title>
            <div class="card-title-row">
              <span>用量排行</span>
              <Segmented
                v-model:value="dimTab"
                size="small"
                :options="[
                  { value: 'key', label: `API Key (${byKey.length})` },
                  { value: 'model', label: `模型 (${byModel.length})` },
                ]"
              />
            </div>
          </template>
          <div v-if="!dimRows.length && !loading" class="dim-empty">
            <Empty :image="Empty.PRESENTED_IMAGE_SIMPLE" description="暂无排行数据" />
          </div>
          <VxeGrid v-else v-bind="dimGridOptions">
            <template #rank="{ row }">
              <span
                class="rank-badge"
                :class="[rankClass(row.rank), { top: row.rank <= 3 }]"
              >{{ row.rank }}</span>
            </template>
            <template #label="{ row }">
              <span
                class="dim-label"
                :class="{ mono: dimTab === 'model' }"
                :title="row.label"
              >{{ row.label }}</span>
            </template>
            <template #requests="{ row }">
              <span class="mono">{{ fmtNum(row.requests) }}</span>
            </template>
            <template #billed="{ row }">
              <span class="mono" title="已扣缓存">{{ fmtTokens(row.billed, '') }}</span>
            </template>
            <template #share="{ row }">
              <div class="share-cell">
                <Progress
                  :percent="row.share || 0"
                  :show-info="false"
                  size="small"
                  :stroke-color="dimShareColor"
                  trail-color="rgba(0,0,0,0.06)"
                />
                <span class="share-pct mono">{{ row.share || 0 }}%</span>
              </div>
            </template>
            <template #rate="{ row }">
              <Tag :color="rateColor(row.success_rate_num)">
                {{ row.success_rate_num != null ? row.success_rate_num + '%' : '—' }}
              </Tag>
            </template>
          </VxeGrid>
        </Card>
      </div>

      <!-- 明细 -->
      <div ref="eventsWrapRef" class="events-wrap">
        <Card size="small" class="page-card events-card" :bordered="false">
          <template #title>
            <div class="card-title-row">
              <span>使用明细</span>
              <Tag class="events-count-tag">
                共 {{ fmtNum(eventsTotal) }} 条
                <template v-if="eventsSource"> · {{ eventsSource }}</template>
              </Tag>
            </div>
          </template>
          <div class="events-toolbar">
            <Input
              v-model:value="filters.q"
              placeholder="Key / 账号 / 模型 / 路径 / IP"
              style="max-width: 260px; min-width: 160px; flex: 1"
              allow-clear
              @press-enter="() => loadEvents(true)"
            />
            <Select
              v-model:value="filters.protocol"
              style="width: 132px"
              :options="[
                { value: 'all', label: '全部协议' },
                { value: 'openai', label: 'openai' },
                { value: 'anthropic', label: 'anthropic' },
                { value: 'openai_responses', label: 'responses' },
              ]"
              @change="onFilterSelectChange"
            />
            <Select
              v-model:value="filters.stream"
              style="width: 96px"
              :options="[
                { value: 'all', label: '全部' },
                { value: '1', label: '流式' },
                { value: '0', label: '非流' },
              ]"
              @change="onFilterSelectChange"
            />
            <Select
              v-model:value="filters.ok"
              style="width: 96px"
              :options="[
                { value: 'all', label: '全部' },
                { value: 'true', label: '成功' },
                { value: 'false', label: '失败' },
              ]"
              @change="onFilterSelectChange"
            />
            <Button type="primary" :loading="eventsLoading" @click="() => loadEvents(true)">
              <template #icon><SearchOutlined /></template>
              查询
            </Button>
            <Button @click="resetFilters">重置</Button>
          </div>

          <VxeGrid
            class="events-grid"
            v-bind="eventGridOptions"
            v-on="eventGridEvents"
          >
            <template #created_at="{ row }">
              <span
                class="mono ue-main"
                :title="fmtTime(row.created_at || row.ts)"
              >{{ fmtTimeShort(row.created_at || row.ts) }}</span>
            </template>
            <template #ok="{ row }">
              <Tag :color="row.ok ? 'success' : 'error'" class="ok-tag">
                {{ row.ok ? '成功' : '失败' }}
              </Tag>
            </template>
            <template #protocol="{ row }">
              <div class="mono ue-main">{{ row.protocol || '—' }}</div>
              <div v-if="row.path" class="ue-sub mono">{{ row.path }}</div>
            </template>
            <template #stream="{ row }">
              <Tag v-if="streamFlag(row) === true" color="processing">流</Tag>
              <Tag v-else-if="streamFlag(row) === false">非流</Tag>
              <span v-else class="ue-sub">—</span>
            </template>
            <template #api_key="{ row }">
              <div class="mono ue-main">{{ keyLabel(row) }}</div>
              <div v-if="row.api_key_id" class="ue-sub">{{ row.api_key_id }}</div>
            </template>
            <template #client_ip="{ row }">
              <span class="mono">{{ row.client_ip || '—' }}</span>
            </template>
            <template #model="{ row }">
              <div class="mono ue-main">{{ row.model || '—' }}</div>
              <div v-if="row.account_email || row.account_id" class="ue-sub">
                {{ row.account_email || row.account_id }}
              </div>
            </template>
            <template #prompt_tokens="{ row }">
              <span class="mono">{{ fmtTokenCell(row.prompt_tokens) }}</span>
            </template>
            <template #completion_tokens="{ row }">
              <span class="mono">{{ fmtTokenCell(row.completion_tokens) }}</span>
            </template>
            <template #billed="{ row }">
              <Tooltip :title="billTitle(row)">
                <span class="mono">
                  {{ fmtTokenCell(eventBilled(row)) }}
                  <span
                    v-if="Number(row.cache_read_tokens || 0) > 0"
                    class="ue-sub"
                  >
                    原 {{ fmtTokenCell(row.total_tokens) }}
                  </span>
                </span>
              </Tooltip>
            </template>
            <template #cache="{ row }">
              <Tooltip :title="cacheCell(row).title || undefined">
                <span class="mono">
                  {{ cacheCell(row).text }}
                  <span v-if="cacheCell(row).sub" class="ue-sub">
                    {{ cacheCell(row).sub }}
                  </span>
                </span>
              </Tooltip>
            </template>
            <template #reasoning_tokens="{ row }">
              <span class="mono">
                {{
                  Number(row.reasoning_tokens || 0) > 0
                    ? fmtTokenCell(row.reasoning_tokens)
                    : '—'
                }}
              </span>
            </template>
            <template #effort="{ row }">
              <Tag v-if="effortOf(row)" :color="effortColor(effortOf(row))">
                {{ effortOf(row) }}
              </Tag>
              <span v-else class="ue-sub">—</span>
            </template>
            <template #ttft_ms="{ row }">
              <span class="mono">
                {{ fmtLatency(row.ttft_ms ?? row.detail?.ttft_ms ?? null) }}
              </span>
            </template>
            <template #latency_ms="{ row }">
              <span class="mono">
                {{ fmtLatency(row.latency_ms ?? row.detail?.latency_ms ?? null) }}
              </span>
            </template>
          </VxeGrid>
        </Card>
      </div>
    </div>
  </Page>
</template>

<style scoped>
.usage-page {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.usage-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.usage-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.usage-header-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--ant-color-text, #1f1f1f);
}

.usage-header-hint {
  font-size: 12px;
  color: var(--ant-color-text-secondary, #8c8c8c);
}

.refresh-tag {
  margin: 0 !important;
  font-size: 11px;
  font-weight: 400;
  line-height: 18px;
}

.usage-header-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

/* KPI */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
}

@media (max-width: 1280px) {
  .kpi-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .kpi-grid {
    grid-template-columns: 1fr 1fr;
  }
}

.kpi-card {
  position: relative;
  display: flex;
  gap: 12px;
  padding: 14px 14px 12px;
  border-radius: 12px;
  background: var(--ant-color-bg-container, #fff);
  border: 1px solid var(--ant-color-border-secondary, #f0f0f0);
  overflow: hidden;
  min-height: 104px;
  transition: box-shadow 0.2s ease, border-color 0.2s ease;
}

.kpi-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
  border-color: var(--ant-color-border, #e8e8e8);
}

.kpi-card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  border-radius: 3px 0 0 3px;
  background: #1677ff;
}

.kpi-card.tone-green::before {
  background: #52c41a;
}
.kpi-card.tone-purple::before {
  background: #722ed1;
}
.kpi-card.tone-orange::before {
  background: #fa8c16;
}
.kpi-card.tone-slate::before {
  background: #8c8c8c;
}

.kpi-icon-wrap {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(22, 119, 255, 0.1);
  color: #1677ff;
  margin-top: 2px;
}

.tone-green .kpi-icon-wrap {
  background: rgba(82, 196, 26, 0.1);
  color: #52c41a;
}
.tone-purple .kpi-icon-wrap {
  background: rgba(114, 46, 209, 0.1);
  color: #722ed1;
}
.tone-orange .kpi-icon-wrap {
  background: rgba(250, 140, 22, 0.1);
  color: #fa8c16;
}
.tone-slate .kpi-icon-wrap {
  background: rgba(0, 0, 0, 0.04);
  color: #8c8c8c;
}

.kpi-icon {
  width: 18px;
  height: 18px;
  display: inline-block;
}

.kpi-body {
  min-width: 0;
  flex: 1;
}

.kpi-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}

.kpi-label {
  font-size: 12px;
  color: var(--ant-color-text-secondary, #8c8c8c);
}

.kpi-tag {
  margin: 0 !important;
  font-size: 11px;
  line-height: 18px;
  padding-inline: 6px;
}

.kpi-value {
  font-size: 22px;
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: -0.02em;
  color: var(--ant-color-text, #1f1f1f);
  word-break: break-all;
}

.kpi-sub {
  margin-top: 6px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--ant-color-text-tertiary, #a0a0a0);
}

/* main grid: chart + rank */
.usage-main-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(320px, 1fr);
  gap: 14px;
  align-items: stretch;
}

@media (max-width: 1100px) {
  .usage-main-grid {
    grid-template-columns: 1fr;
  }
}

.page-card {
  margin-bottom: 0 !important;
  border-radius: 12px;
  height: 100%;
}

.chart-card :deep(.ant-card-body),
.dim-card :deep(.ant-card-body) {
  padding-top: 8px;
}

.chart-empty,
.dim-empty {
  min-height: 300px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.card-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  font-weight: 600;
}

.card-title-hint {
  font-size: 12px;
  font-weight: 400;
  color: var(--ant-color-text-secondary, #8c8c8c);
}

.rank-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  color: #8c8c8c;
  background: rgba(0, 0, 0, 0.04);
}

.rank-badge.top.gold {
  color: #fff;
  background: linear-gradient(135deg, #faad14, #ffd666);
}
.rank-badge.top.silver {
  color: #fff;
  background: linear-gradient(135deg, #8c8c8c, #bfbfbf);
}
.rank-badge.top.bronze {
  color: #fff;
  background: linear-gradient(135deg, #d48806, #fa8c16);
}

.dim-label {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.share-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.share-cell :deep(.ant-progress) {
  flex: 1;
  margin: 0;
  line-height: 1;
}

.share-pct {
  width: 40px;
  text-align: right;
  font-size: 11px;
  color: var(--ant-color-text-secondary, #8c8c8c);
  flex-shrink: 0;
}

/* events */
.events-wrap {
  min-height: 0;
}

.events-card :deep(.ant-card-body) {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding-top: 8px;
}

.events-count-tag {
  margin: 0 !important;
  font-weight: 400;
  font-size: 12px;
}

.events-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.events-grid {
  min-height: 360px;
}

.ue-main {
  display: block;
  line-height: 1.3;
  white-space: nowrap;
}

.ue-sub {
  display: block;
  font-size: 11px;
  opacity: 0.5;
  line-height: 1.25;
  margin-top: 1px;
}

.ok-tag {
  margin: 0 !important;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-variant-numeric: tabular-nums;
}
</style>
