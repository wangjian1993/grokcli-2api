<script setup lang="ts">
import { Page } from '@/components'
import { withDefaultVxeGridOptions } from '@/components/vxe-table'
import { onMounted, ref, watch } from 'vue'
import { Card, Button, Tag, App as AntApp, message as staticMessage } from 'antdv-next'
import { CloudSyncOutlined, ReloadOutlined } from '@antdv-next/icons'
import { getModels, getStatus, syncModels } from '@/api/g2a'
import { VxeGrid } from 'vxe-table'
import type { VxeGridProps } from 'vxe-table'

let message = staticMessage
try {
  message = AntApp.useApp().message
} catch {
  /* outside App provider */
}

const loading = ref(false)
const models = ref<any[]>([])
const health = ref<any>({})

const gridOptions = withDefaultVxeGridOptions({
  size: 'small',
  border: 'inner',
  height: 520,
  showOverflow: true,
  loading: false,
  data: [] as any[],
  columns: [
    {
      field: 'id',
      title: '模型 ID',
      minWidth: 200,
      align: 'left',
      headerAlign: 'left',
      slots: { default: 'id' },
    },
    {
      field: 'name',
      title: '名称',
      minWidth: 160,
      align: 'left',
      headerAlign: 'left',
    },
    {
      field: 'source',
      title: '来源',
      minWidth: 120,
    },
    {
      field: 'status',
      title: '状态',
      width: 120,
      slots: { default: 'status' },
    },
  ] as VxeGridProps['columns'],
  pagerConfig: {
    enabled: true,
    pageSize: 30,
    pageSizes: [10, 20, 30, 50, 100],
    background: true,
  },
  toolbarConfig: {
    enabled: false,
  },
  proxyConfig: {
    enabled: false,
  },
  rowConfig: {
    keyField: 'id',
    isHover: true,
  },
})

watch(loading, (v) => {
  gridOptions.loading = v
})
watch(
  models,
  (v) => {
    gridOptions.data = v
  },
  { immediate: true },
)

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
  <Page auto-content-height>
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
      <VxeGrid v-bind="gridOptions">
        <template #id="{ row }">
          <span class="mono">{{ row.id }}</span>
        </template>
        <template #status>
          <Tag color="processing">目录</Tag>
        </template>
      </VxeGrid>
    </Card>
  </Page>
</template>
