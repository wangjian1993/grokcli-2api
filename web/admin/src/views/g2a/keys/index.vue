<script setup lang="ts">
import { Page } from '@/components'
import { withDefaultVxeGridOptions } from '@/components/vxe-table'
import { onMounted, reactive, ref, watch } from 'vue'
import {
  Card,
  Button,
  Space,
  Tag,
  Modal,
  Form,
  FormItem,
  Input,
  App as AntApp,
  message as staticMessage,
} from 'antdv-next'
import { PlusOutlined, ReloadOutlined } from '@antdv-next/icons'
import { createKey, deleteKey, getKeys, patchKey, regenerateKey } from '@/api/g2a'
import { fmtTime } from '@/utils/g2a/format'
import { VxeGrid } from 'vxe-table'
import type { VxeGridProps } from 'vxe-table'

let message = staticMessage
let modal: any = null
try {
  const appCtx = AntApp.useApp()
  message = appCtx.message
  modal = appCtx.modal
} catch {
  /* outside App provider */
}

const loading = ref(false)
const rows = ref<any[]>([])
const open = ref(false)
const form = reactive({ name: '', note: '' })

const gridOptions = withDefaultVxeGridOptions({
  size: 'small',
  border: 'inner',
  height: 520,
  showOverflow: true,
  loading: false,
  data: [] as any[],
  columns: [
    {
      field: 'name',
      title: '名称',
      minWidth: 160,
      align: 'left',
      headerAlign: 'left',
      slots: { default: 'name' },
    },
    {
      field: 'prefix',
      title: '前缀',
      width: 140,
      slots: { default: 'prefix' },
    },
    {
      field: 'enabled',
      title: '状态',
      width: 100,
      slots: { default: 'enabled' },
    },
    {
      field: 'request_count',
      title: '请求',
      width: 100,
    },
    {
      field: 'created_at',
      title: '创建时间',
      width: 170,
      formatter: ({ cellValue }) => fmtTime(cellValue),
    },
    {
      field: 'actions',
      title: '操作',
      width: 280,
      fixed: 'right',
      slots: { default: 'actions' },
    },
  ] as VxeGridProps['columns'],
  pagerConfig: {
    enabled: true,
    pageSize: 20,
    pageSizes: [10, 20, 30, 50],
    background: true,
  },
  toolbarConfig: { enabled: false },
  proxyConfig: { enabled: false },
  rowConfig: { keyField: 'id', isHover: true },
})

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

async function load() {
  loading.value = true
  try {
    const data = await getKeys()
    rows.value = data.keys || []
  } catch (e: any) {
    message.error(e?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

async function onCreate() {
  try {
    const res = await createKey({ name: form.name || 'default', note: form.note })
    message.success('已创建')
    const secret = res?.key || res?.secret || res?.api_key
    if (secret) {
      modal.info({
        title: '请立即复制完整 Key',
        content: secret,
        okText: '已复制 / 关闭',
      })
      try {
        await navigator.clipboard.writeText(secret)
      } catch {
        /* ignore */
      }
    }
    open.value = false
    form.name = ''
    form.note = ''
    await load()
  } catch (e: any) {
    message.error(e?.message || '创建失败')
  }
}

async function copyKey(record: any) {
  let secret = record.secret || record.key
  if (!secret) {
    try {
      const res = await regenerateKey(record.id)
      secret = res?.key || res?.secret || res?.api_key
      message.success('已重新生成')
      await load()
    } catch (e: any) {
      message.error(e?.message || '重新生成失败')
      return
    }
  }
  if (!secret) {
    message.warning('无完整 Key')
    return
  }
  try {
    await navigator.clipboard.writeText(secret)
    message.success('已复制')
  } catch {
    modal.info({ title: 'Key', content: secret })
  }
}

async function toggle(record: any) {
  try {
    await patchKey(record.id, { enabled: !record.enabled })
    message.success(record.enabled ? '已停用' : '已启用')
    await load()
  } catch (e: any) {
    message.error(e?.message || '操作失败')
  }
}

function remove(record: any) {
  modal.confirm({
    title: `删除 Key「${record.name}」？`,
    okType: 'danger',
    async onOk() {
      await deleteKey(record.id)
      message.success('已删除')
      await load()
    },
  })
}

onMounted(load)
</script>

<template>
  <Page auto-content-height>
    <div class="g2a-page">
      <Card class="page-card">
        <div class="page-toolbar">
          <Button type="primary" @click="open = true">
            <template #icon><PlusOutlined /></template>
            创建 Key
          </Button>
          <Button @click="load">
            <template #icon><ReloadOutlined /></template>
            刷新
          </Button>
        </div>
        <VxeGrid v-bind="gridOptions">
          <template #name="{ row }">
            <div>{{ row.name }}</div>
            <div style="font-size: 12px; opacity: 0.55">{{ row.note }}</div>
          </template>
          <template #prefix="{ row }">
            <span class="mono">{{ row.prefix }}…</span>
          </template>
          <template #enabled="{ row }">
            <Tag :color="row.enabled ? 'success' : 'default'">
              {{ row.enabled ? '启用' : '停用' }}
            </Tag>
          </template>
          <template #actions="{ row }">
            <Space>
              <Button size="small" type="primary" @click="copyKey(row)">复制</Button>
              <Button size="small" @click="toggle(row)">
                {{ row.enabled ? '停用' : '启用' }}
              </Button>
              <Button size="small" danger @click="remove(row)">删除</Button>
            </Space>
          </template>
        </VxeGrid>
      </Card>

      <Modal v-model:open="open" title="创建 API Key" ok-text="创建" @ok="onCreate">
        <Form layout="vertical">
          <FormItem label="名称">
            <Input v-model:value="form.name" placeholder="default" />
          </FormItem>
          <FormItem label="备注">
            <Input v-model:value="form.note" placeholder="可选" />
          </FormItem>
        </Form>
      </Modal>
    </div>
  </Page>
</template>
