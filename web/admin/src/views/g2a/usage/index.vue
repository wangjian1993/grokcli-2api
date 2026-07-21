<script setup lang="ts">
import { Page } from '@/components'
import { nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import {
  Card,
  Button,
  Select,
  Input,
  Tag,
  Spin,
  Tooltip,
  App as AntApp,
  message as staticMessage,
} from 'antdv-next'
import { ReloadOutlined, SearchOutlined } from '@antdv-next/icons'
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
  usageBilled,
} from '@/utils/g2a/format'
import { withDefaultVxeGridOptions } from '@/components/vxe-table'
import { VxeGrid } from 'vxe-table'
import type { VxeGridListeners, VxeGridProps } from 'vxe-table'

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
const eventsSource = ref('')
const filters = reactive({
  q: '',
  protocol: 'all',
  ok: 'all',
  stream: 'all',
})
const tableScrollY = ref(520)
const eventsWrapRef = ref<HTMLElement | null>(null)
let timer: number | undefined
let resizeObs: ResizeObserver | undefined

function makeDimGrid() {
  return withDefaultVxeGridOptions({
    size: 'small',
    border: 'inner',
    height: 400,
    showOverflow: true,
    data: [] as any[],
    columns: [
      {
        field: 'label',
        title: '名称',
        minWidth: 140,
        align: 'left',
        headerAlign: 'left',
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
        width: 140,
        slots: { default: 'billed' },
      },
      {
        field: 'success_rate',
        title: '成功率',
        width: 90,
      },
    ] as VxeGridProps['columns'],
    pagerConfig: { enabled: false },
    toolbarConfig: { enabled: false },
    proxyConfig: { enabled: false },
    rowConfig: { keyField: 'id', isHover: true },
  })
}

const keyGridOptions = makeDimGrid()
const modelGridOptions = makeDimGrid()

const eventGridOptions = withDefaultVxeGridOptions({
  size: 'small',
  border: 'inner',
  height: 520,
  showOverflow: true,
  loading: false,
  data: [] as any[],
  columns: [
    {
      field: 'created_at',
      title: '时间',
      width: 158,
      fixed: 'left',
      slots: { default: 'created_at' },
    },
    {
      field: 'protocol',
      title: '协议',
      width: 120,
      slots: { default: 'protocol' },
    },
    {
      field: 'stream',
      title: '模式',
      width: 72,
      slots: { default: 'stream' },
    },
    {
      field: 'api_key',
      title: 'Key',
      width: 140,
      slots: { default: 'api_key' },
    },
    {
      field: 'client_ip',
      title: 'IP',
      width: 110,
      slots: { default: 'client_ip' },
    },
    {
      field: 'model',
      title: '模型',
      width: 150,
      slots: { default: 'model' },
    },
    {
      field: 'prompt_tokens',
      title: '输入',
      width: 88,
      slots: { default: 'prompt_tokens' },
    },
    {
      field: 'completion_tokens',
      title: '输出',
      width: 88,
      slots: { default: 'completion_tokens' },
    },
    {
      field: 'billed',
      title: '计费',
      width: 110,
      slots: { default: 'billed' },
    },
    {
      field: 'cache',
      title: '缓存',
      width: 120,
      slots: { default: 'cache' },
    },
    {
      field: 'reasoning_tokens',
      title: '推理',
      width: 80,
      slots: { default: 'reasoning_tokens' },
    },
    {
      field: 'effort',
      title: 'effort',
      width: 80,
      slots: { default: 'effort' },
    },
    {
      field: 'ttft_ms',
      title: 'TTFT',
      width: 80,
      slots: { default: 'ttft_ms' },
    },
    {
      field: 'latency_ms',
      title: '耗时',
      width: 80,
      slots: { default: 'latency_ms' },
    },
    {
      field: 'ok',
      title: '结果',
      width: 72,
      fixed: 'right',
      slots: { default: 'ok' },
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
  return (items || []).map((it) => ({
    ...it,
    label:
      kind === 'key'
        ? `${it.name || it.prefix || it.id || '—'}${it.prefix ? ` · ${it.prefix}` : ''}`
        : it.id || '—',
    success_rate: it.success_rate != null ? `${it.success_rate}%` : '—',
    billed: usageBilled(it),
  }))
}

watch(loading, (v) => {
  eventGridOptions.loading = v
})
watch(
  byKey,
  (v) => {
    keyGridOptions.data = v
  },
  { immediate: true },
)
watch(
  byModel,
  (v) => {
    modelGridOptions.data = v
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
  eventGridOptions.height = Math.max(360, v + 48)
})

function fmtRatio(v: any) {
  return v == null || v === '' ? '—' : `${v}%`
}

function cardStats() {
  const sum = summary.value
  const today = sum.today || {}
  const window = sum.window || {}
  const life = sum.lifetime || {}
  const cache = sum.cache || {}
  const cacheToday = cache.today || {}
  const cacheWin = cache.window || {}
  const cacheLife = cache.lifetime || {}
  return [
    {
      label: '今日请求',
      value: fmtNum(today.requests),
      sub: `成功 ${fmtNum(today.success)} · 失败 ${fmtNum(today.fail)}${today.success_rate != null ? ` · ${today.success_rate}%` : ''}`,
    },
    {
      label: '今日计费 token',
      value: fmtTokens(usageBilled(today)),
      sub: `输入 ${fmtNum(promptBilled(today))} · 输出 ${fmtNum(today.completion_tokens)} · 已扣缓存 ${fmtNum(today.cache_read_tokens || 0)}`,
      mono: true,
    },
    {
      label: '今日缓存命中',
      value: fmtRatio(cacheToday.token_hit_ratio),
      sub: `读 ${fmtNum(cacheToday.cache_read_tokens || 0)} / 输入 ${fmtNum(cacheToday.prompt_tokens || 0)} · 请求命中 ${fmtRatio(cacheToday.request_hit_ratio)}`,
      mono: true,
    },
    {
      label: `近 ${days.value} 天计费 token`,
      value: fmtTokens(usageBilled(window)),
      sub: `请求 ${fmtNum(window.requests)}${window.success_rate != null ? ` · 成功率 ${window.success_rate}%` : ''} · 已扣缓存 ${fmtNum(window.cache_read_tokens || 0)}`,
      mono: true,
    },
    {
      label: `近 ${days.value} 天缓存命中`,
      value: fmtRatio(cacheWin.token_hit_ratio),
      sub: `读 ${fmtNum(cacheWin.cache_read_tokens || 0)} / 输入 ${fmtNum(cacheWin.prompt_tokens || 0)} · 请求命中 ${fmtRatio(cacheWin.request_hit_ratio)}`,
      mono: true,
    },
    {
      label: '累计计费 token',
      value: fmtTokens(usageBilled(life)),
      sub: `请求 ${fmtNum(life.requests)} · 累计缓存读 ${fmtNum(cacheLife.cache_read_tokens || 0)} · 单位 k/M/B · 源 ${sum.source || '—'}`,
      mono: true,
    },
  ]
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
}

async function loadEvents(reset = false) {
  if (reset) eventsPage.value = 1
  const params = new URLSearchParams()
  params.set('page', String(eventsPage.value))
  params.set('page_size', String(eventsPageSize.value))
  // 明细默认不限 days 窗口（与旧台一致）；summary 仍按 days 筛选
  if (filters.q.trim()) params.set('q', filters.q.trim())
  // 后端 chat 存 openai_chat；UI 选项 openai → 映射
  const protocol =
    filters.protocol === 'openai' ? 'openai_chat' : filters.protocol
  if (protocol !== 'all') params.set('protocol', protocol)
  if (filters.ok !== 'all') params.set('ok', filters.ok)
  if (filters.stream !== 'all') params.set('stream', filters.stream)
  const data = await getUsageEvents(params.toString())
  events.value = data.items || data.events || []
  eventsTotal.value = data.total ?? data.count ?? events.value.length
  eventsSource.value = data.store_source || data.source || ''
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

function measureEventsHeight() {
  try {
    const el = eventsWrapRef.value
    if (!el) return
    const toolbar = el.querySelector('.page-toolbar') as HTMLElement | null
    const paginationH = 56
    const cardHead = 48
    const top = (toolbar?.offsetHeight || 40) + cardHead + 24
    // 明细区域：至少 240，尽量吃满视口剩余
    const rect = el.getBoundingClientRect()
    const avail = window.innerHeight - rect.top - top - paginationH - 24
    tableScrollY.value = Math.max(360, Math.min(820, avail))
  } catch {
    /* ignore */
  }
}

onMounted(() => {
  load()
  timer = window.setInterval(() => load(false), 20000)
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
        <Card
          v-for="(it, i) in cardStats()"
          :key="i"
          size="small"
          class="stat-item page-card"
        >
          <div class="label">{{ it.label }}</div>
          <div class="value" :class="{ mono: it.mono }">{{ it.value }}</div>
          <div class="sub">{{ it.sub }}</div>
        </Card>
      </div>

      <Card title="每日 token（已扣缓存）" size="small" class="page-card">
        <div v-if="!seriesBars().length" style="opacity: 0.55">暂无数据</div>
        <div v-else class="usage-bars">
          <div
            v-for="b in seriesBars()"
            :key="b.day"
            class="usage-bar"
            :title="`${b.day} · ${fmtTokens(b.tok)}（已扣缓存） · ${fmtNum(b.req)} 请求`"
          >
            <div class="usage-bar-fill" :style="{ height: b.h + '%' }" />
            <div class="usage-bar-label">{{ String(b.day || '').slice(5) }}</div>
            <div class="usage-bar-val">{{ fmtNum(b.tok) }}</div>
          </div>
        </div>
      </Card>

      <div class="usage-dim-grid">
        <Card title="按 API Key" size="small" class="page-card">
          <VxeGrid v-bind="keyGridOptions">
            <template #requests="{ row }">
              {{ fmtNum(row.requests) }}
            </template>
            <template #billed="{ row }">
              <span class="mono" title="已扣缓存">{{ fmtTokens(row.billed) }}</span>
            </template>
          </VxeGrid>
        </Card>
        <Card title="按模型" size="small" class="page-card">
          <VxeGrid v-bind="modelGridOptions">
            <template #requests="{ row }">
              {{ fmtNum(row.requests) }}
            </template>
            <template #billed="{ row }">
              <span class="mono" title="已扣缓存">{{ fmtTokens(row.billed) }}</span>
            </template>
          </VxeGrid>
        </Card>
      </div>

      <div ref="eventsWrapRef">
        <Card title="使用明细" size="small" class="page-card events-card">
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
              v-model:value="filters.stream"
              style="width: 110px"
              :options="[
                { value: 'all', label: '全部模式' },
                { value: '1', label: '流式' },
                { value: '0', label: '非流' },
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
            <Tag>
              共 {{ fmtNum(eventsTotal) }} 条
              <template v-if="eventsSource"> · 源 {{ eventsSource }}</template>
            </Tag>
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
            <template #ok="{ row }">
              <Tag :color="row.ok ? 'success' : 'error'">
                {{ row.ok ? '成功' : '失败' }}
              </Tag>
            </template>
          </VxeGrid>
        </Card>
      </div>
    </Spin>
  </Page>
</template>

<style scoped>

.usage-dim-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

@media (max-width: 960px) {
  .usage-dim-grid {
    grid-template-columns: 1fr;
  }
}

.ue-main {
  display: block;
  line-height: 1.3;
  white-space: nowrap;
}

.events-table :deep(td .mono) {
  font-variant-numeric: tabular-nums;
}

.ue-sub {
  display: block;
  font-size: 11px;
  opacity: 0.5;
  line-height: 1.25;
  margin-top: 1px;
}

.events-grid {
  min-height: 400px;
}
</style>
