<script setup lang="ts">
import { Page } from '@/components'
import { withDefaultVxeGridOptions } from '@/components/vxe-table'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  Card,
  Button,
  Tag,
  Input,
  RadioGroup,
  Dropdown,
  Menu,
  MenuItem,
  MenuDivider,
  Tooltip,
  App as AntApp,
  message as staticMessage,
} from 'antdv-next'
import {
  ReloadOutlined,
  DeleteOutlined,
  ThunderboltOutlined,
  DownOutlined,
  PlayCircleOutlined,
} from '@antdv-next/icons'
import {
  clearCooldown,
  deleteAccountsBatch,
  exportSSO,
  getAccounts,
  getAccountsQuota,
  kickAccount,
  probeAll,
  probeBatch,
  pushCLIProxy,
  pushSub2Api,
  refreshAccounts,
  setAccountEnabled,
  api,
} from '@/api/g2a'
import {
  calcQuotaUsage,
  fmtAge,
  fmtCooldown,
  fmtExpiry,
  fmtNum,
  fmtTimeShort,
  hasQuotaInfo,
  planLabel,
  planTagColor,
  resolveAccountPlan,
  type QuotaUsage,
} from '@/utils/g2a/format'
import { VxeGrid } from 'vxe-table'
import type { VxeGridListeners, VxeGridProps } from 'vxe-table'

let message = staticMessage
let modal: any = null
try {
  const appCtx = AntApp.useApp()
  message = appCtx.message
  modal = appCtx.modal
} catch {
  /* outside App provider */
}

const router = useRouter()
const loading = ref(false)
const rows = ref<any[]>([])
const selected = ref<string[]>([])
const statusFilter = ref('live')
const poolCounts = ref<Record<string, number>>({
  all: 0,
  live: 0,
  cooldown: 0,
  expired: 0,
  disabled: 0,
  quota_disabled: 0,
  model_blocked: 0,
})

function formatStatusLabel(name: string, count: number | undefined) {
  const n = Number(count)
  if (Number.isFinite(n) && n >= 0) return `${name} ${n}`
  return name
}

const statusFilterOptions = computed(() => {
  const c = poolCounts.value
  return [
    { value: 'all', label: formatStatusLabel('全部', c.all) },
    { value: 'live', label: formatStatusLabel('可轮询', c.live) },
    { value: 'cooldown', label: formatStatusLabel('冷却', c.cooldown) },
    { value: 'expired', label: formatStatusLabel('过期', c.expired) },
    { value: 'disabled', label: formatStatusLabel('禁用', c.disabled) },
    { value: 'quota_disabled', label: formatStatusLabel('额度冷却', c.quota_disabled) },
    { value: 'model_blocked', label: formatStatusLabel('模型封禁', c.model_blocked) },
  ]
})

function ingestPoolCounts(data: any) {
  const p = data?.pool || data?.Pool || null
  if (!p || typeof p !== 'object') {
    // When pool missing, still show filtered total for current tab if useful
    if (statusFilter.value === 'all' && data?.total != null) {
      poolCounts.value = { ...poolCounts.value, all: Number(data.total) || 0 }
    }
    return
  }
  const all = Number(p.total ?? data?.total ?? 0) || 0
  poolCounts.value = {
    all,
    live: Number(p.live ?? p.rotatable ?? 0) || 0,
    cooldown: Number(p.in_cooldown ?? 0) || 0,
    expired: Number(p.expired ?? 0) || 0,
    disabled: Number(p.disabled ?? 0) || 0,
    quota_disabled: Number(p.quota_disabled ?? 0) || 0,
    model_blocked: Number(p.model_blocked ?? 0) || 0,
  }
}
const q = ref('')
const page = ref(1)
const pageSize = ref(50)
const total = ref(0)
const quotaMap = ref<Record<string, any>>({})
const tableScrollY = ref(420)
const pageWrapRef = ref<HTMLElement | null>(null)
let hotTimer: number | undefined
let resizeObs: ResizeObserver | undefined

const gridOptions = withDefaultVxeGridOptions({
  size: 'small',
  border: 'inner',
  height: 420,
  // 关闭溢出截断，行高随邮箱/标签等内容自适应
  showOverflow: false,
  showHeaderOverflow: true,
  loading: false,
  data: [] as any[],
  columns: [
    { type: 'checkbox', width: 42, fixed: 'left' },
    {
      field: 'identity',
      title: '账号',
      minWidth: 200,
      fixed: 'left',
      align: 'left',
      headerAlign: 'left',
      showOverflow: false,
      className: 'col-identity',
      slots: { default: 'identity' },
    },
    {
      field: 'status',
      title: '状态',
      width: 148,
      showOverflow: false,
      slots: { default: 'status' },
    },
    {
      field: 'quota',
      title: '额度',
      minWidth: 200,
      width: 220,
      align: 'left',
      headerAlign: 'left',
      showOverflow: false,
      slots: { default: 'quota' },
    },
    {
      field: 'usage',
      title: '请求',
      width: 120,
      slots: { default: 'usage' },
    },
    {
      field: 'expires',
      title: '过期',
      width: 148,
      slots: { default: 'expires' },
    },
    {
      field: 'actions',
      title: '操作',
      width: 200,
      fixed: 'right',
      showOverflow: false,
      slots: { default: 'actions' },
    },
  ] as VxeGridProps['columns'],
  checkboxConfig: {
    highlight: true,
    range: true,
  },
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
  rowConfig: {
    keyField: 'id',
    isHover: true,
    // 不设 height，行高由内容撑开
  },
  cellConfig: {
    // 允许换行时单元格高度自适应
    height: 'auto',
  },
})


const gridEvents: VxeGridListeners = {
  checkboxChange() {
    syncSelected()
  },
  checkboxAll() {
    syncSelected()
  },
  pageChange({ currentPage, pageSize: ps }) {
    page.value = currentPage
    pageSize.value = ps
    load(false)
  },
}

const gridRef = ref<InstanceType<typeof VxeGrid> | null>(null)

function syncSelected() {
  const $grid = gridRef.value
  if (!$grid) return
  const records = $grid.getCheckboxRecords?.() || []
  selected.value = records.map((r: any) => String(r.id)).filter(Boolean)
}

watch(loading, (v) => {
  gridOptions.loading = v
})
watch(
  rows,
  (v) => {
    gridOptions.data = v
  },
  { immediate: true },
)
watch(total, (v) => {
  if (gridOptions.pagerConfig) gridOptions.pagerConfig.total = v
})
watch(page, (v) => {
  if (gridOptions.pagerConfig) gridOptions.pagerConfig.currentPage = v
})
watch(pageSize, (v) => {
  if (gridOptions.pagerConfig) gridOptions.pagerConfig.pageSize = v
})
watch(tableScrollY, (v) => {
  gridOptions.height = v + 48
})

function poolOf(a: any): Record<string, any> {
  return (a && (a._pool || a.pool)) || {}
}

function statusOf(a: any) {
  const p = poolOf(a)
  const enabled = p.enabled !== false && a.enabled !== false && !a.disabled
  if (!enabled || p.pool_status === 'disabled') return 'disabled'
  if (
    p.pool_status === 'expired' ||
    a.expired ||
    p.token_expired_at ||
    ['failed', 'expired', 'sso_failed', 'no_sso_removed', 'no_sso_deleted', 'sso_attempt'].includes(
      String(p.last_renew_status || ''),
    )
  ) {
    return 'expired'
  }
  if (p.disabled_for_quota || p.pool_status === 'quota_disabled') return 'quota_disabled'
  const remain = Number(p.cooldown_remaining_sec || 0) || 0
  if (
    p.in_cooldown === true ||
    p.pool_status === 'cooldown' ||
    remain > 0 ||
    p.cooldown_until
  ) {
    if (p.pool_status === 'cooldown' || p.in_cooldown || remain > 0) return 'cooldown'
    const until = Number(p.cooldown_until)
    if (Number.isFinite(until)) {
      const sec = until > 1e12 ? until / 1000 : until
      if (sec > Date.now() / 1000) return 'cooldown'
    }
  }
  const blockedIds = Array.isArray(p.blocked_model_ids)
    ? p.blocked_model_ids
    : p.blocked_models && typeof p.blocked_models === 'object'
      ? Object.keys(p.blocked_models)
      : []
  if (blockedIds.length > 0 || p.pool_status === 'model_blocked' || a.model_blocked) {
    return 'model_blocked'
  }
  return 'live'
}

const STATUS_LABEL: Record<string, string> = {
  live: '轮询中',
  cooldown: '冷却中',
  expired: '过期',
  disabled: '已禁用',
  quota_disabled: '额度冷却',
  model_blocked: '模型封禁',
}

function statusColor(s: string) {
  if (s === 'live') return 'success'
  if (s === 'cooldown' || s === 'model_blocked' || s === 'quota_disabled') return 'warning'
  if (s === 'expired' || s === 'disabled') return 'error'
  return 'default'
}

function statusTip(a: any) {
  const p = poolOf(a)
  const parts: string[] = []
  if (p.cooldown_reason) parts.push(String(p.cooldown_reason))
  if (p.cooldown_code) parts.push(`code=${p.cooldown_code}`)
  if (p.cooldown_model) parts.push(`model=${p.cooldown_model}`)
  if (p.disabled_reason) parts.push(String(p.disabled_reason))
  if (p.last_error) parts.push(String(p.last_error).slice(0, 80))
  if (p.last_renew_error) parts.push(String(p.last_renew_error).slice(0, 80))
  return parts.filter(Boolean).join(' · ') || undefined
}

function resolveQuota(a: any) {
  const p = poolOf(a)
  const live = quotaMap.value[a.id]
  const poolQ = p.last_quota && typeof p.last_quota === 'object' ? p.last_quota : null
  if (live && hasQuotaInfo(live)) return live
  if (poolQ && hasQuotaInfo(poolQ)) return poolQ
  return live || poolQ || null
}

function usageOf(a: any) {
  const p = poolOf(a)
  return {
    success: p.success_count ?? a.success_count ?? 0,
    fail: p.fail_count ?? a.fail_count ?? 0,
    total: p.request_count ?? a.request_count ?? 0,
  }
}

function cooldownOf(a: any) {
  const p = poolOf(a)
  const st = statusOf(a)
  if (st !== 'cooldown' && st !== 'quota_disabled') return ''
  return fmtCooldown(p.cooldown_until, p.cooldown_remaining_sec)
}

function planOf(a: any): string {
  const q = resolveQuota(a)
  return resolveAccountPlan(q, a)
}

function quotaView(a: any): {
  q: any
  usage: QuotaUsage
  pill: { text: string; color: string }
  age: string
  reason: string
  empty: boolean
} {
  const q = resolveQuota(a)
  const p = poolOf(a)
  if (!q || (!hasQuotaInfo(q) && !q.error)) {
    return {
      q: null,
      usage: calcQuotaUsage(null),
      pill: { text: '未查询', color: 'default' },
      age: '',
      reason: '',
      empty: true,
    }
  }
  if (q.error && !hasQuotaInfo(q)) {
    return {
      q,
      usage: calcQuotaUsage(null),
      pill: { text: '未查询', color: 'default' },
      age: '',
      reason: String(q.error).slice(0, 80),
      empty: true,
    }
  }
  const usage = calcQuotaUsage(q, a)
  const exhausted =
    !!(q.exhausted || q.auto_disabled) || !!p.disabled_for_quota
  let pill = { text: '可用', color: 'success' }
  if (exhausted) pill = { text: '已耗尽', color: 'error' }
  else if (p.enabled === false || a.enabled === false)
    pill = { text: '禁用', color: 'default' }
  else if (usage.pct != null && usage.pct >= 90)
    pill = { text: '将尽', color: 'warning' }
  const age = fmtAge(q.fetched_at || q.at)
  const reason = exhausted
    ? String(p.disabled_reason || q.exhaust_reason || '').slice(0, 80)
    : ''
  return { q, usage, pill, age, reason, empty: false }
}

function meterColor(pct: number | null): string {
  if (pct == null) return 'var(--ant-color-success, #52c41a)'
  if (pct >= 90) return 'var(--ant-color-error, #ff4d4f)'
  if (pct >= 70) return 'var(--ant-color-warning, #faad14)'
  return 'var(--ant-color-success, #52c41a)'
}

function emailOf(a: any): string {
  return a.email || a.credentials_email || '—'
}

function shortId(id: unknown): string {
  const s = String(id || '')
  if (s.length <= 14) return s
  return s.slice(0, 8) + '…' + s.slice(-4)
}

function expiresMain(a: any): string {
  const v = a.expires_at
  if (v == null || v === '') return '—'
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return fmtTimeShort(v)
  const sec = n > 1e12 ? Math.floor(n / 1000) : Math.floor(n)
  const now = Math.floor(Date.now() / 1000)
  if (sec <= now) return '已过期'
  // 短日期 + 剩余
  return fmtTimeShort(sec)
}

function expiresSub(a: any): string {
  const full = fmtExpiry(a.expires_at)
  if (full === '—' || full.startsWith('已过期')) return ''
  // 只取「剩 xm」部分
  const m = full.match(/剩\s+(.+)$/)
  return m ? `剩 ${m[1]}` : ''
}

async function load(reset = false) {
  if (reset) page.value = 1
  loading.value = true
  try {
    const params = new URLSearchParams()
    params.set('page', String(page.value))
    params.set('page_size', String(pageSize.value))
    if (q.value.trim()) params.set('q', q.value.trim())
    if (statusFilter.value !== 'all') params.set('status', statusFilter.value)
    const data = await getAccounts(params.toString())
    const list = data.accounts || data.items || data.data || []
    rows.value = list
    total.value = data.total ?? data.count ?? list.length
    ingestPoolCounts(data)
    const map: Record<string, any> = { ...quotaMap.value }
    for (const a of list) {
      const lq = a?._pool?.last_quota || a?.pool?.last_quota
      if (lq && hasQuotaInfo(lq) && a.id) map[a.id] = { ...lq, account_id: a.id }
    }
    quotaMap.value = map
    void loadQuota(
      false,
      list.map((x: any) => String(x.id)).filter(Boolean),
    )
  } catch (e: any) {
    message.error(e?.message || '加载账号失败')
  } finally {
    loading.value = false
    await nextTick()
    measureTableHeight()
  }
}

function ingestQuotaPayload(data: any) {
  const items =
    data?.results || data?.items || data?.quotas || data?.accounts || data?.data || []
  const list = Array.isArray(items) ? items : []
  const map: Record<string, any> = { ...quotaMap.value }
  for (const it of list) {
    if (!it || typeof it !== 'object') continue
    const id = it.account_id || it.id
    if (!id) continue
    const snap =
      it.last_quota && typeof it.last_quota === 'object' && hasQuotaInfo(it.last_quota)
        ? { ...it.last_quota, ...it, account_id: id }
        : it
    if (hasQuotaInfo(snap) || snap.error) map[id] = snap
  }
  quotaMap.value = map
}

async function loadQuota(force = false, ids?: string[]) {
  try {
    const scope = ids?.length
      ? ids
      : rows.value.map((x) => String(x.id)).filter(Boolean)
    const data = await getAccountsQuota(force, {
      cached: !force,
      ids: scope.length ? scope : undefined,
    })
    ingestQuotaPayload(data)
  } catch (e: any) {
    if (force) message.warning(e?.message || '额度刷新失败')
  }
}

async function onProbeSelected() {
  if (!selected.value.length) {
    message.warning('请先选择账号')
    return
  }
  try {
    await probeBatch(selected.value)
    message.success('已提交测活')
    await load()
  } catch (e: any) {
    message.error(e?.message || '测活失败')
  }
}

async function onProbeAll() {
  modal.confirm({
    title: '对全部账号测活？',
    async onOk() {
      await probeAll()
      message.success('已提交全量测活')
    },
  })
}

async function onRefreshTokens() {
  try {
    await refreshAccounts(selected.value.length ? selected.value : undefined)
    message.success('已提交续期')
  } catch (e: any) {
    message.error(e?.message || '续期失败')
  }
}

async function onDeleteSelected() {
  if (!selected.value.length) return
  modal.confirm({
    title: `删除选中的 ${selected.value.length} 个账号？`,
    okType: 'danger',
    async onOk() {
      await deleteAccountsBatch(selected.value)
      selected.value = []
      message.success('已删除')
      await load()
    },
  })
}

async function onExportSso() {
  try {
    const data = await exportSSO(selected.value.length ? selected.value : undefined)
    const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2)
    const blob = new Blob([text], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'accounts-sso.json'
    a.click()
    URL.revokeObjectURL(url)
    message.success('已导出 SSO JSON')
  } catch (e: any) {
    message.error(e?.message || '导出失败')
  }
}

async function onPush(kind: 'cpa' | 's2a') {
  const body = selected.value.length ? { account_ids: selected.value } : { all: true }
  try {
    if (kind === 'cpa') await pushCLIProxy(body)
    else await pushSub2Api(body)
    message.success('已提交推送')
  } catch (e: any) {
    message.error(e?.message || '推送失败')
  }
}

const importFileRef = ref<HTMLInputElement | null>(null)

function triggerImportFile() {
  importFileRef.value?.click()
}

async function onImportFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const fd = new FormData()
  fd.append('file', file)
  try {
    await api('/accounts/import-file', { method: 'POST', body: fd })
    message.success('导入已提交')
    await load(true)
  } catch (err: any) {
    message.error(err?.message || '导入失败')
  }
}

function measureTableHeight() {
  try {
    const el = pageWrapRef.value
    if (!el) return
    const toolbar = el.querySelector('.page-toolbar') as HTMLElement | null
    const paginationH = 56
    const cardPad = 48
    const top = (toolbar?.offsetHeight || 48) + cardPad
    const avail = el.clientHeight - top - paginationH
    tableScrollY.value = Math.max(240, avail)
  } catch {
    /* ignore */
  }
}

onMounted(async () => {
  await load(true)
  hotTimer = window.setInterval(() => load(false), 20000)
  await nextTick()
  measureTableHeight()
  window.addEventListener('resize', measureTableHeight)
  if (typeof ResizeObserver !== 'undefined' && pageWrapRef.value) {
    resizeObs = new ResizeObserver(() => measureTableHeight())
    resizeObs.observe(pageWrapRef.value)
  }
})
onUnmounted(() => {
  if (hotTimer) clearInterval(hotTimer)
  window.removeEventListener('resize', measureTableHeight)
  resizeObs?.disconnect()
})
</script>

<template>
  <Page auto-content-height>
    <div ref="pageWrapRef" class="g2a-page g2a-accounts-page">
      <Card class="page-card accounts-card" :bordered="false">
        <div class="page-toolbar accounts-toolbar">
          <RadioGroup
            v-model:value="statusFilter"
            :options="statusFilterOptions"
            option-type="button"
            button-style="solid"
            @change="() => load(true)"
          />
          <Input
            v-model:value="q"
            placeholder="搜索邮箱 / id"
            style="max-width: 220px"
            allow-clear
            @press-enter="() => load(true)"
          />
          <div class="toolbar-actions">
            <Button type="primary" @click="() => load(true)">
              <template #icon><ReloadOutlined /></template>
              刷新
            </Button>
            <Button @click="() => loadQuota(true)">刷额度</Button>
            <Button @click="onProbeSelected">
              <template #icon><ThunderboltOutlined /></template>
              测活
            </Button>
            <Button danger @click="onDeleteSelected">
              <template #icon><DeleteOutlined /></template>
              删除
            </Button>
            <Button type="dashed" @click="router.push('/accounts/register')">
              <template #icon><PlayCircleOutlined /></template>
              协议注册
            </Button>
            <Dropdown :trigger="['click']" placement="bottomRight">
              <Button>
                更多
                <DownOutlined />
              </Button>
              <template #popupRender>
                <Menu class="accounts-more-menu">
                  <MenuItem key="probe-all" @click="onProbeAll">全量测活</MenuItem>
                  <MenuItem key="renew" @click="onRefreshTokens">续期 Token</MenuItem>
                  <MenuDivider />
                  <MenuItem key="export" @click="onExportSso">导出 SSO</MenuItem>
                  <MenuItem key="import" @click="triggerImportFile">导入文件</MenuItem>
                  <MenuDivider />
                  <MenuItem key="push-cpa" @click="() => onPush('cpa')">推送 CPA</MenuItem>
                  <MenuItem key="push-s2a" @click="() => onPush('s2a')">推送 sub2api</MenuItem>
                </Menu>
              </template>
            </Dropdown>
            <input
              ref="importFileRef"
              type="file"
              accept=".json,.txt,.csv,application/json,text/plain"
              class="hidden-file-input"
              @change="onImportFileChange"
            />
          </div>
        </div>

        <VxeGrid ref="gridRef" class="accounts-grid" v-bind="gridOptions" v-on="gridEvents">
          <template #identity="{ row }">
            <div class="identity-cell">
              <div class="mono identity-email" :title="emailOf(row)">
                {{ emailOf(row) }}
              </div>
              <div class="identity-meta">
                <span class="mono identity-id" :title="String(row.id || '')">
                  {{ shortId(row.id) }}
                </span>
                <Tag
                  v-if="planOf(row)"
                  :color="planTagColor(planOf(row))"
                  class="plan-tag"
                >
                  {{ planLabel(planOf(row)) }}
                </Tag>
                <Tag v-if="row.has_sso" color="processing" class="flag-tag">SSO</Tag>
                <Tag v-if="row.has_refresh_token" color="success" class="flag-tag">
                  可续期
                </Tag>
              </div>
            </div>
          </template>

          <template #status="{ row }">
            <div class="status-cell">
              <Tooltip :title="statusTip(row)">
                <Tag :color="statusColor(statusOf(row))" class="status-tag">
                  {{ STATUS_LABEL[statusOf(row)] || statusOf(row) }}
                </Tag>
              </Tooltip>
              <div
                v-if="cooldownOf(row)"
                class="status-sub mono"
                :title="cooldownOf(row)"
              >
                {{ cooldownOf(row) }}
              </div>
              <div
                v-else-if="statusTip(row)"
                class="status-sub muted"
                :title="statusTip(row)"
              >
                {{ statusTip(row) }}
              </div>
            </div>
          </template>

          <template #quota="{ row }">
            <div class="quota-cell">
              <template v-if="quotaView(row).empty">
                <span class="muted">{{ quotaView(row).pill.text }}</span>
                <div v-if="quotaView(row).reason" class="quota-sub muted" :title="quotaView(row).reason">
                  {{ quotaView(row).reason }}
                </div>
              </template>
              <template v-else>
                <div class="quota-head">
                  <Tag :color="quotaView(row).pill.color" class="quota-pill">
                    {{ quotaView(row).pill.text }}
                  </Tag>
                  <span class="mono quota-text" :title="quotaView(row).usage.text">
                    {{ quotaView(row).usage.text }}
                  </span>
                </div>
                <div
                  v-if="quotaView(row).usage.weeklyText"
                  class="quota-sub mono"
                  :title="quotaView(row).usage.weeklyText"
                >
                  {{ quotaView(row).usage.weeklyText }}
                </div>
                <div
                  v-if="quotaView(row).usage.pct != null"
                  class="quota-meter"
                  :title="`已使用 ${quotaView(row).usage.pct}%`"
                >
                  <div
                    class="quota-meter-fill"
                    :style="{
                      width: quotaView(row).usage.pct + '%',
                      background: meterColor(quotaView(row).usage.pct),
                    }"
                  />
                </div>
                <div class="quota-foot">
                  <span v-if="quotaView(row).reason" class="quota-sub muted" :title="quotaView(row).reason">
                    {{ quotaView(row).reason }}
                  </span>
                  <span v-if="quotaView(row).age" class="quota-age muted">
                    {{ quotaView(row).age }}
                  </span>
                </div>
              </template>
            </div>
          </template>

          <template #usage="{ row }">
            <div class="usage-cell mono">
              <div class="usage-line">
                <span class="ok">{{ fmtNum(usageOf(row).success) }}</span>
                <span class="muted">/</span>
                <span class="bad">{{ fmtNum(usageOf(row).fail) }}</span>
              </div>
              <div class="usage-total muted">共 {{ fmtNum(usageOf(row).total) }}</div>
            </div>
          </template>

          <template #expires="{ row }">
            <div class="expires-cell mono">
              <div
                :class="{
                  'exp-bad': expiresMain(row) === '已过期',
                }"
              >
                {{ expiresMain(row) }}
              </div>
              <div v-if="expiresSub(row)" class="expires-sub muted">
                {{ expiresSub(row) }}
              </div>
            </div>
          </template>

          <template #actions="{ row }">
            <div class="actions-cell">
              <Button
                size="small"
                type="link"
                @click="
                  async () => {
                    await setAccountEnabled(
                      row.id,
                      row.enabled === false || poolOf(row).enabled === false,
                    )
                    message.success('已更新')
                    load()
                  }
                "
              >
                {{
                  row.enabled === false || poolOf(row).enabled === false
                    ? '启用'
                    : '禁用'
                }}
              </Button>
              <Button
                size="small"
                type="link"
                @click="
                  async () => {
                    await kickAccount(row.id)
                    message.success('已踢出')
                    load()
                  }
                "
              >
                踢出
              </Button>
              <Button
                size="small"
                type="link"
                @click="
                  async () => {
                    await clearCooldown(row.id)
                    message.success('已清冷却')
                    load()
                  }
                "
              >
                清冷却
              </Button>
            </div>
          </template>
        </VxeGrid>
      </Card>
    </div>
  </Page>
</template>

<style scoped>
.g2a-accounts-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.accounts-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  margin-bottom: 0;
}

.accounts-card :deep(.ant-card-body) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding-bottom: 12px;
}

.accounts-grid {
  flex: 1;
  min-height: 0;
}

.identity-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 2px 0;
  line-height: 1.35;
  text-align: left;
}

.identity-email {
  font-size: 13px;
  font-weight: 500;
  white-space: normal;
  word-break: break-all;
  color: var(--ant-color-text, inherit);
}

.identity-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;
}

.identity-id {
  font-size: 11px;
  opacity: 0.5;
}

.plan-tag,
.flag-tag,
.status-tag,
.quota-pill {
  margin: 0 !important;
  line-height: 18px;
  font-size: 12px;
  padding-inline: 6px;
}

.flag-tag {
  opacity: 0.9;
}

.status-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 2px 0;
}

.status-sub {
  font-size: 11px;
  line-height: 1.3;
  max-width: 132px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.quota-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 2px 0;
  text-align: left;
  min-width: 0;
}

.quota-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.quota-text {
  font-size: 12px;
  line-height: 1.35;
  word-break: break-all;
}

.quota-sub {
  font-size: 11px;
  line-height: 1.3;
  opacity: 0.65;
}

.quota-meter {
  height: 4px;
  border-radius: 2px;
  background: rgba(127, 127, 127, 0.18);
  overflow: hidden;
  width: 100%;
  max-width: 200px;
}

.quota-meter-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.25s ease;
}

.quota-foot {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  align-items: center;
}

.quota-age {
  font-size: 11px;
  margin-left: auto;
}

.usage-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  font-size: 12px;
  line-height: 1.3;
}

.usage-line .ok {
  color: var(--ant-color-success, #52c41a);
  font-weight: 600;
}

.usage-line .bad {
  color: var(--ant-color-error, #ff4d4f);
  font-weight: 600;
}

.usage-total {
  font-size: 11px;
}

.expires-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  font-size: 12px;
  line-height: 1.35;
}

.expires-sub {
  font-size: 11px;
}

.exp-bad {
  color: var(--ant-color-error, #ff4d4f);
  font-weight: 600;
}

.actions-cell {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0 2px;
}

.actions-cell :deep(.ant-btn) {
  padding-inline: 4px;
  height: 24px;
  font-size: 12px;
}

.muted {
  opacity: 0.55;
}

.accounts-grid :deep(.vxe-body--column) {
  vertical-align: middle;
}

.accounts-grid :deep(.vxe-body--column.col-identity) {
  vertical-align: top;
}

.accounts-grid :deep(.vxe-body--row .vxe-cell) {
  max-height: none !important;
  height: auto !important;
  white-space: normal;
  padding-top: 8px;
  padding-bottom: 8px;
}

.accounts-grid :deep(.vxe-cell--wrapper) {
  max-height: none !important;
  height: auto !important;
}

.accounts-toolbar {
  justify-content: flex-start;
  row-gap: 10px;
}

.toolbar-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.hidden-file-input {
  display: none;
}

.accounts-more-menu {
  min-width: 148px;
}
</style>
