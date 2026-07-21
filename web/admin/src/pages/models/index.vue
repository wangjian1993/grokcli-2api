<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Card, Table, Button, Space, Tag, App as AntApp , message as staticMessage } from 'antdv-next'
import { CloudSyncOutlined, ReloadOutlined } from '@antdv-next/icons'
import { getModels, getStatus, syncModels } from '@/api'

let message = staticMessage
try {
  message = AntApp.useApp().message
} catch {
  /* outside App provider */
}
const loading = ref(false)
const models = ref<any[]>([])
const health = ref<any>({})

const columns = [
  { title: '模型 ID', dataIndex: 'id', key: 'id' },
  { title: '名称', dataIndex: 'name', key: 'name' },
  { title: '来源', dataIndex: 'source', key: 'source' },
  { title: '状态', key: 'status', width: 120 },
]

async function load() {
  loading.value = true
  try {
    const [m, st] = await Promise.all([getModels(), getStatus().catch(() => ({}))])
    const list = m.models || m.data || m.items || (Array.isArray(m) ? m : [])
    models.value = list.map((x: any) => ({
      id: x.id || x.model || x.name,
      name: x.name || x.id,
      source: x.source || x.owned_by || '—',
      raw: x,
    }))
    health.value = st.model_health || {}
  } catch (e: any) {
    message.error(e?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

async function sync() {
  loading.value = true
  try {
    const r = await syncModels()
    message.success(`已同步 ${r.count ?? r.synced ?? (r.models || []).length ?? ''} 个模型`)
    await load()
  } catch (e: any) {
    message.error(e?.message || '同步失败')
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <Card class="page-card">
    <div class="page-toolbar">
      <Button type="primary" @click="sync">
        <template #icon><CloudSyncOutlined /></template>
        同步上游模型
      </Button>
      <Button @click="load">
        <template #icon><ReloadOutlined /></template>
        刷新
      </Button>
      <Tag>{{ health.running ? '探测运行中' : health.enabled ? '探测已启用' : '探测 —' }}</Tag>
    </div>
    <Table
      :loading="loading"
      :data-source="models"
      :columns="columns"
      row-key="id"
      size="middle"
      :pagination="{ pageSize: 30 }"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'id'">
          <span class="mono">{{ record.id }}</span>
        </template>
        <template v-else-if="column.key === 'status'">
          <Tag color="processing">目录</Tag>
        </template>
      </template>
    </Table>
  </Card>
</template>
