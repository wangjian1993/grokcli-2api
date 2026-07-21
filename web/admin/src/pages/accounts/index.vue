<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Input,
  InputNumber,
  Select,
  Modal,
  Form,
  FormItem,
  Switch,
  Upload,
  Tabs,
  TabPane,
  Progress,
  App as AntApp,
  Typography,
  message as staticMessage,
} from 'antdv-next'
import {
  ReloadOutlined,
  DeleteOutlined,
  ThunderboltOutlined,
  CloudUploadOutlined,
  ImportOutlined,
  ExportOutlined,
  PlayCircleOutlined,
  StopOutlined,
} from '@antdv-next/icons'
import {
  clearCooldown,
  deleteAccountsBatch,
  exportSSO,
  getAccounts,
  getAccountsQuota,
  getRegBatch,
  getRegConfig,
  getRegSessions,
  kickAccount,
  probeAll,
  probeBatch,
  pushCLIProxy,
  pushSub2Api,
  putRegConfig,
  refreshAccounts,
  setAccountEnabled,
  startRegister,
  stopRegister,
  testRegProxy,
  api,
} from '@/api'
import { fmtTime } from '@/utils/format'

let message = staticMessage
let modal: any = null
try {
  const appCtx = AntApp.useApp()
  message = appCtx.message
  modal = appCtx.modal
} catch {
  /* outside App provider */
}
const { Text, Paragraph } = Typography
const loading = ref(false)
const rows = ref<any[]>([])
const selected = ref<string[]>([])
const statusFilter = ref('all')
const q = ref('')
const page = ref(1)
const pageSize = ref(50)
const total = ref(0)
const quotaMap = ref<Record<string, any>>({})
const regOpen = ref(false)
const regBusy = ref(false)
const regProgress = ref<any>(null)
let pollTimer: number | undefined
let hotTimer: number | undefined

const regForm = reactive<Record<string, any>>({
  count: 1,
  concurrency: 1,
  captcha_provider: 'local',
  mail_provider: 'moemail',
  mail_api_key: '',
  proxy_list: '',
})

const columns = [
  { title: '邮箱 / ID', key: 'identity', width: 220 },
  { title: '状态', key: 'status', width: 120 },
  { title: '额度', key: 'quota', width: 140 },
  { title: '请求', key: 'usage', width: 120 },
  { title: '冷却', key: 'cooldown', width: 140 },
  { title: '操作', key: 'actions', width: 260 },
]

const filteredHint = computed(() => {
  if (statusFilter.value === 'all') return `共 ${total.value || rows.value.length}`
  return `筛选 ${statusFilter.value} · 本页 ${rows.value.length}`
})

function statusOf(a: any) {
  if (a.enabled === false || a.disabled) return 'disabled'
  if (a.expired) return 'expired'
  if (a.cooldown_until || a.in_cooldown) return 'cooldown'
  if (a.quota_disabled) return 'quota_disabled'
  if (a.model_blocked) return 'model_blocked'
  return 'live'
}

function statusColor(s: string) {
  if (s === 'live') return 'success'
  if (s === 'cooldown') return 'warning'
  if (s === 'expired' || s === 'disabled') return 'error'
  return 'default'
}

function onSelect(keys: any[]) {
  selected.value = keys.map(String)
}
function onPage(p: number, ps: number) {
  page.value = p
  pageSize.value = ps
  load(false)
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
  } catch (e: any) {
    message.error(e?.message || '加载账号失败')
  } finally {
    loading.value = false
  }
}

async function loadQuota(force = false) {
  try {
    const data = await getAccountsQuota(force)
    const items = data.items || data.quotas || data.accounts || []
    const map: Record<string, any> = {}
    for (const it of items) {
      const id = it.account_id || it.id
      if (id) map[id] = it
    }
    quotaMap.value = map
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

async function onImportFile(file: File) {
  const fd = new FormData()
  fd.append('file', file)
  try {
    await api('/accounts/import-file', { method: 'POST', body: fd })
    message.success('导入已提交')
    await load(true)
  } catch (e: any) {
    message.error(e?.message || '导入失败')
  }
  return false
}

async function openReg() {
  regOpen.value = true
  try {
    const cfg = await getRegConfig()
    Object.assign(regForm, cfg.config || cfg || {})
  } catch {
    /* ignore */
  }
}

async function saveRegCfg() {
  try {
    await putRegConfig({ ...regForm })
    message.success('注册配置已保存')
  } catch (e: any) {
    message.error(e?.message || '保存失败')
  }
}

async function doTestProxy() {
  try {
    const r = await testRegProxy({
      proxy_list: regForm.proxy_list,
      proxies: String(regForm.proxy_list || '')
        .split(/\n/)
        .map((x: string) => x.trim())
        .filter(Boolean),
    })
    message.success(r.message || '代理测试完成')
  } catch (e: any) {
    message.error(e?.message || '代理测试失败')
  }
}

async function doStartReg() {
  regBusy.value = true
  try {
    const body = {
      count: regForm.count,
      concurrency: regForm.concurrency,
      captcha_provider: regForm.captcha_provider,
      mail_provider: regForm.mail_provider,
      mail_api_key: regForm.mail_api_key,
      proxy_list: regForm.proxy_list,
    }
    const r = await startRegister(body)
    message.success('注册任务已启动')
    regProgress.value = r
    startPoll(r.batch_id || r.session_id)
  } catch (e: any) {
    message.error(e?.message || '启动失败')
  } finally {
    regBusy.value = false
  }
}

function startPoll(batchId?: string) {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = window.setInterval(async () => {
    try {
      if (batchId) {
        regProgress.value = await getRegBatch(batchId)
      } else {
        regProgress.value = await getRegSessions()
      }
      const st = regProgress.value?.status || regProgress.value?.state
      if (st && /done|completed|failed|stopped|success/i.test(String(st))) {
        if (pollTimer) clearInterval(pollTimer)
        await load(true)
      }
    } catch {
      /* ignore */
    }
  }, 1500)
}

async function doStopReg() {
  try {
    await stopRegister()
    message.success('已请求停止')
  } catch (e: any) {
    message.error(e?.message || '停止失败')
  }
}

onMounted(async () => {
  await load(true)
  await loadQuota(false)
  hotTimer = window.setInterval(() => load(false), 20000)
})
onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
  if (hotTimer) clearInterval(hotTimer)
})
</script>

<template>
  <Card class="page-card">
    <div class="page-toolbar">
      <Select
        v-model:value="statusFilter"
        style="width: 140px"
        :options="[
          { value: 'all', label: '全部' },
          { value: 'live', label: '可轮询' },
          { value: 'cooldown', label: '冷却' },
          { value: 'expired', label: '过期' },
          { value: 'disabled', label: '禁用' },
          { value: 'quota_disabled', label: '额度禁用' },
        ]"
        @change="() => load(true)"
      />
      <Input
        v-model:value="q"
        placeholder="搜索邮箱 / id"
        style="max-width: 220px"
        allow-clear
        @press-enter="() => load(true)"
      />
      <Button type="primary" @click="() => load(true)">
        <template #icon><ReloadOutlined /></template>
        刷新
      </Button>
      <Button @click="() => loadQuota(true)">刷额度</Button>
      <Button @click="onProbeSelected">
        <template #icon><ThunderboltOutlined /></template>
        测活选中
      </Button>
      <Button @click="onProbeAll">全量测活</Button>
      <Button @click="onRefreshTokens">续期</Button>
      <Button danger @click="onDeleteSelected">
        <template #icon><DeleteOutlined /></template>
        删除选中
      </Button>
      <Button @click="onExportSso">
        <template #icon><ExportOutlined /></template>
        导出 SSO
      </Button>
      <Upload :before-upload="onImportFile" :show-upload-list="false">
        <Button>
          <template #icon><ImportOutlined /></template>
          导入文件
        </Button>
      </Upload>
      <Button @click="() => onPush('cpa')">
        <template #icon><CloudUploadOutlined /></template>
        推 CPA
      </Button>
      <Button @click="() => onPush('s2a')">推 sub2api</Button>
      <Button type="dashed" @click="openReg">
        <template #icon><PlayCircleOutlined /></template>
        协议注册
      </Button>
      <Tag>{{ filteredHint }} · 已选 {{ selected.length }}</Tag>
    </div>

    <Table
      :loading="loading"
      :data-source="rows"
      :columns="columns"
      row-key="id"
      size="small"
      :row-selection="{
        selectedRowKeys: selected,
        onChange: onSelect,
      }"
      :pagination="{
        current: page,
        pageSize,
        total,
        showSizeChanger: true,
        onChange: onPage,
      }"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'identity'">
          <div class="mono">{{ record.email || record.credentials_email || '—' }}</div>
          <div style="font-size: 11px; opacity: 0.55" class="mono">{{ record.id }}</div>
        </template>
        <template v-else-if="column.key === 'status'">
          <Tag :color="statusColor(statusOf(record))">{{ statusOf(record) }}</Tag>
          <Tag v-if="record.enabled === false" color="default">off</Tag>
        </template>
        <template v-else-if="column.key === 'quota'">
          <span class="mono" style="font-size: 12px">
            {{
              quotaMap[record.id]
                ? `${quotaMap[record.id].remaining ?? quotaMap[record.id].left ?? '—'} / ${quotaMap[record.id].limit ?? quotaMap[record.id].total ?? '—'}`
                : record.quota_label || '—'
            }}
          </span>
        </template>
        <template v-else-if="column.key === 'usage'">
          {{ record.success_count || 0 }}√ / {{ record.fail_count || 0 }}× ·
          {{ record.request_count || 0 }}
        </template>
        <template v-else-if="column.key === 'cooldown'">
          <span v-if="record.cooldown_until">{{ fmtTime(record.cooldown_until) }}</span>
          <span v-else style="opacity: 0.45">—</span>
        </template>
        <template v-else-if="column.key === 'actions'">
          <Space wrap>
            <Button
              size="small"
              @click="
                async () => {
                  await setAccountEnabled(record.id, record.enabled === false)
                  message.success('已更新')
                  load()
                }
              "
            >
              {{ record.enabled === false ? '启用' : '禁用' }}
            </Button>
            <Button
              size="small"
              @click="
                async () => {
                  await kickAccount(record.id)
                  message.success('已踢出')
                  load()
                }
              "
            >
              踢出
            </Button>
            <Button
              size="small"
              @click="
                async () => {
                  await clearCooldown(record.id)
                  message.success('已清冷却')
                  load()
                }
              "
            >
              清冷却
            </Button>
          </Space>
        </template>
      </template>
    </Table>
  </Card>

  <Modal
    v-model:open="regOpen"
    title="协议注册"
    width="720px"
    :footer="null"
    destroy-on-close
  >
    <Tabs>
      <TabPane key="cfg" tab="配置与启动">
        <Form layout="vertical">
          <FormItem label="数量">
            <InputNumber v-model:value="regForm.count" :min="1" :max="200" style="width: 100%" />
          </FormItem>
          <FormItem label="并发">
            <InputNumber v-model:value="regForm.concurrency" :min="1" :max="10" style="width: 100%" />
          </FormItem>
          <FormItem label="验证码">
            <Select
              v-model:value="regForm.captcha_provider"
              :options="[
                { value: 'local', label: 'local (inline solver)' },
                { value: 'capsolver', label: 'capsolver' },
                { value: 'yescaptcha', label: 'yescaptcha' },
              ]"
            />
          </FormItem>
          <FormItem label="邮箱服务">
            <Select
              v-model:value="regForm.mail_provider"
              :options="[
                { value: 'moemail', label: 'moemail' },
                { value: 'yyds', label: 'yyds' },
                { value: 'gptmail', label: 'gptmail' },
                { value: 'cfmail', label: 'cfmail' },
              ]"
            />
          </FormItem>
          <FormItem label="邮箱 API Key">
            <Input v-model:value="regForm.mail_api_key" class="mono" />
          </FormItem>
          <FormItem label="注册代理（每行一个）">
            <Input.TextArea v-model:value="regForm.proxy_list" :rows="4" class="mono" />
          </FormItem>
          <Space wrap>
            <Button @click="saveRegCfg">保存配置</Button>
            <Button @click="doTestProxy">测试代理</Button>
            <Button type="primary" :loading="regBusy" @click="doStartReg">
              <template #icon><PlayCircleOutlined /></template>
              开始注册
            </Button>
            <Button danger @click="doStopReg">
              <template #icon><StopOutlined /></template>
              停止
            </Button>
          </Space>
        </Form>
      </TabPane>
      <TabPane key="prog" tab="进度">
        <Paragraph v-if="!regProgress" type="secondary">暂无运行中的任务</Paragraph>
        <div v-else>
          <Tag>{{ regProgress.status || regProgress.state || 'running' }}</Tag>
          <Progress
            v-if="regProgress.total"
            :percent="
              Math.round(
                (100 * Number(regProgress.done || regProgress.success || 0)) /
                  Number(regProgress.total || 1),
              )
            "
          />
          <pre class="guide-pre mono" style="max-height: 320px; overflow: auto">{{
            JSON.stringify(regProgress, null, 2)
          }}</pre>
        </div>
      </TabPane>
    </Tabs>
  </Modal>
</template>
