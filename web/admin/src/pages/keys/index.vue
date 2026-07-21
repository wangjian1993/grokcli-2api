<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import {
  Card,
  Table,
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
import { createKey, deleteKey, getKeys, patchKey, regenerateKey } from '@/api'
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
const loading = ref(false)
const rows = ref<any[]>([])
const open = ref(false)
const form = reactive({ name: '', note: '' })

const columns = [
  {
    title: '名称',
    dataIndex: 'name',
    key: 'name',
    customRender: ({ record }: any) =>
      `${record.name || '—'}${record.note ? `\n${record.note}` : ''}`,
  },
  {
    title: '前缀',
    dataIndex: 'prefix',
    key: 'prefix',
    customRender: ({ text }: any) => (text ? `${text}…` : '—'),
  },
  {
    title: '状态',
    dataIndex: 'enabled',
    key: 'enabled',
  },
  { title: '请求', dataIndex: 'request_count', key: 'request_count' },
  {
    title: '创建时间',
    dataIndex: 'created_at',
    key: 'created_at',
    customRender: ({ text }: any) => fmtTime(text),
  },
  { title: '操作', key: 'actions', width: 280 },
]

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
    <Table
      :loading="loading"
      :data-source="rows"
      :columns="columns"
      row-key="id"
      :pagination="{ pageSize: 20 }"
      size="middle"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'name'">
          <div>{{ record.name }}</div>
          <div style="font-size: 12px; opacity: 0.55">{{ record.note }}</div>
        </template>
        <template v-else-if="column.key === 'prefix'">
          <span class="mono">{{ record.prefix }}…</span>
        </template>
        <template v-else-if="column.key === 'enabled'">
          <Tag :color="record.enabled ? 'success' : 'default'">
            {{ record.enabled ? '启用' : '停用' }}
          </Tag>
        </template>
        <template v-else-if="column.key === 'actions'">
          <Space>
            <Button size="small" type="primary" @click="copyKey(record)">复制</Button>
            <Button size="small" @click="toggle(record)">
              {{ record.enabled ? '停用' : '启用' }}
            </Button>
            <Button size="small" danger @click="remove(record)">删除</Button>
          </Space>
        </template>
      </template>
    </Table>
  </Card>

  <Modal v-model:open="open" title="创建 API Key" @ok="onCreate" ok-text="创建">
    <Form layout="vertical">
      <FormItem label="名称">
        <Input v-model:value="form.name" placeholder="default" />
      </FormItem>
      <FormItem label="备注">
        <Input v-model:value="form.note" placeholder="可选" />
      </FormItem>
    </Form>
  </Modal>
</template>
