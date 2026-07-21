<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { Card, Table, Button, Select, Input, Tag, App as AntApp , message as staticMessage } from 'antdv-next'
import { ReloadOutlined, SearchOutlined } from '@antdv-next/icons'
import { getLogActions, getLogs } from '@/api'
import { fmtTime } from '@/utils/format'

let message = staticMessage
try {
  message = AntApp.useApp().message
} catch {
  /* outside App provider */
}
const loading = ref(false)
const rows = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(50)
const actions = ref<{ value: string; label: string }[]>([{ value: 'all', label: '全部动作' }])
const filters = reactive({ action: 'all', q: '' })

const columns = [
  { title: '时间', dataIndex: 'created_at', key: 'created_at', width: 170 },
  { title: '动作', dataIndex: 'action', key: 'action', width: 140 },
  { title: '状态', dataIndex: 'status', key: 'status', width: 100 },
  { title: '摘要', dataIndex: 'message', key: 'message' },
  { title: '详情', dataIndex: 'detail', key: 'detail', ellipsis: true },
]

async function loadActions() {
  try {
    const data = await getLogActions()
    const list = data.actions || data.items || []
    actions.value = [
      { value: 'all', label: '全部动作' },
      ...list.map((a: any) => ({
        value: typeof a === 'string' ? a : a.action || a.id,
        label: typeof a === 'string' ? a : a.label || a.action || a.id,
      })),
    ]
  } catch {
    /* ignore */
  }
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
    if (filters.action !== 'all') params.set('action', filters.action)
    if (filters.q.trim()) params.set('q', filters.q.trim())
    const data = await getLogs(params.toString())
    rows.value = data.items || data.logs || []
    total.value = data.total ?? rows.value.length
  } catch (e: any) {
    message.error(e?.message || '加载日志失败')
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await loadActions()
  await load(true)
})
</script>

<template>
  <Card class="page-card">
    <div class="page-toolbar">
      <Select
        v-model:value="filters.action"
        style="width: 180px"
        :options="actions"
        @change="() => load(true)"
      />
      <Input
        v-model:value="filters.q"
        placeholder="关键词"
        style="max-width: 240px"
        allow-clear
        @press-enter="() => load(true)"
      />
      <Button type="primary" @click="() => load(true)">
        <template #icon><SearchOutlined /></template>
        查询
      </Button>
      <Button @click="() => load(false)">
        <template #icon><ReloadOutlined /></template>
        刷新
      </Button>
    </div>
    <Table
      :loading="loading"
      :data-source="rows"
      :columns="columns"
      row-key="id"
      size="middle"
      :pagination="{
        current: page,
        pageSize,
        total,
        showSizeChanger: true,
        onChange: onPage,
      }"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'created_at'">
          {{ fmtTime(record.created_at || record.ts) }}
        </template>
        <template v-else-if="column.key === 'status'">
          <Tag
            :color="
              /ok|success|done/i.test(String(record.status || record.level || ''))
                ? 'success'
                : /fail|error/i.test(String(record.status || record.level || ''))
                  ? 'error'
                  : 'default'
            "
          >
            {{ record.status || record.level || '—' }}
          </Tag>
        </template>
        <template v-else-if="column.key === 'message'">
          {{ record.message || record.summary || record.title || '—' }}
        </template>
        <template v-else-if="column.key === 'detail'">
          <span class="mono" style="font-size: 12px">
            {{
              typeof record.detail === 'string'
                ? record.detail
                : record.detail
                  ? JSON.stringify(record.detail)
                  : record.error || ''
            }}
          </span>
        </template>
      </template>
    </Table>
  </Card>
</template>
