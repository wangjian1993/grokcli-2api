<script setup lang="ts">
import { Page } from '@/components'
import { onMounted, reactive, ref } from 'vue'
import {
  Card,
  Form,
  FormItem,
  Input,
  InputNumber,
  InputPassword,
  Switch,
  Select,
  Button,
  Space,
  Tabs,
  TabPane,
  Divider,
  App as AntApp,
  message as staticMessage,
} from 'antdv-next'
import {
  changePassword,
  getCLIProxySettings,
  getSettings,
  getSub2ApiSettings,
  putCLIProxySettings,
  putModelHealth,
  putSettings,
  putSub2ApiSettings,
  putTokenMaintain,
  putAccountMode,
  testCLIProxy,
  testSub2Api,
} from '@/api/g2a'

let message = staticMessage
try {
  message = AntApp.useApp().message
} catch {
  /* outside App provider */
}
const loading = ref(false)
const saving = ref(false)
const form = reactive<Record<string, any>>({
  default_model: 'grok-4.5',
  account_mode: 'round_robin',
  token_maintain_enabled: true,
  model_health_enabled: true,
  auto_replenish_enabled: false,
  auto_replenish_min_accounts: 50,
  auto_replenish_count: 5,
  auto_replenish_interval_sec: 120,
  sse_keepalive_sec: 4,
  affinity_ttl_sec: 0,
  outbound_proxy_enabled: true,
  outbound_proxy_list: '',
  outbound_proxy_strategy: 'round_robin',
  soft_model_block_ttl_sec: undefined as number | undefined,
  durable_model_block_ttl_sec: undefined as number | undefined,
  max_failover_attempts: undefined as number | undefined,
})
const pw = reactive({ current_password: '', new_password: '', confirm_password: '' })
const cpa = reactive<Record<string, any>>({
  enabled: false,
  base_url: '',
  token: '',
  auto_push_on_register: false,
  upstream: 'cli-chat-proxy',
})
const s2a = reactive<Record<string, any>>({
  enabled: false,
  base_url: '',
  token: '',
  auto_push_on_register: false,
  group_id: '',
})

function applySettings(s: any) {
  if (!s) return
  form.default_model = s.default_model || form.default_model
  form.account_mode = s.account_mode || form.account_mode
  form.token_maintain_enabled = s.token_maintain_enabled !== false
  form.model_health_enabled = s.model_health_enabled !== false
  form.auto_replenish_enabled = !!s.auto_replenish_enabled
  if (s.auto_replenish_min_accounts != null) {
    form.auto_replenish_min_accounts = Number(s.auto_replenish_min_accounts)
  }
  if (s.auto_replenish_count != null) {
    form.auto_replenish_count = Number(s.auto_replenish_count)
  }
  if (s.auto_replenish_interval_sec != null) {
    form.auto_replenish_interval_sec = Number(s.auto_replenish_interval_sec)
  }
  form.sse_keepalive_sec = s.sse_keepalive_sec ?? s.sse_keepalive ?? form.sse_keepalive_sec
  form.affinity_ttl_sec = s.affinity_ttl_sec ?? form.affinity_ttl_sec
  const pol = s.pool_policy || s.policy || {}
  form.soft_model_block_ttl_sec = pol.soft_model_block_ttl_sec
  form.durable_model_block_ttl_sec = pol.durable_model_block_ttl_sec
  form.max_failover_attempts = pol.max_failover_attempts
  const ob = s.outbound_proxy_config || s.outbound_proxy || {}
  form.outbound_proxy_enabled = ob.enabled !== false
  form.outbound_proxy_list = Array.isArray(ob.proxies)
    ? ob.proxies.join('\n')
    : ob.proxy_list || ob.list || ''
  form.outbound_proxy_strategy = ob.strategy || 'round_robin'
  // merge flat keys
  for (const k of Object.keys(s)) {
    if (form[k] === undefined && typeof s[k] !== 'object') form[k] = s[k]
  }
}

async function load() {
  loading.value = true
  try {
    const s = await getSettings()
    applySettings(s.settings || s)
    try {
      const c = await getCLIProxySettings()
      Object.assign(cpa, c.config || c || {})
    } catch {
      /* optional */
    }
    try {
      const g = await getSub2ApiSettings()
      Object.assign(s2a, g.config || g || {})
    } catch {
      /* optional */
    }
  } catch (e: any) {
    message.error(e?.message || '加载设置失败')
  } finally {
    loading.value = false
  }
}

function buildBody() {
  const body: Record<string, any> = {
    default_model: form.default_model,
    account_mode: form.account_mode,
    token_maintain_enabled: form.token_maintain_enabled,
    model_health_enabled: form.model_health_enabled,
    auto_replenish_enabled: !!form.auto_replenish_enabled,
    auto_replenish_min_accounts: Number(form.auto_replenish_min_accounts ?? 50),
    auto_replenish_count: Number(form.auto_replenish_count ?? 5),
    auto_replenish_interval_sec: Number(form.auto_replenish_interval_sec ?? 120),
    sse_keepalive_sec: form.sse_keepalive_sec,
    affinity_ttl_sec: form.affinity_ttl_sec,
    outbound_proxy_config: {
      enabled: form.outbound_proxy_enabled,
      strategy: form.outbound_proxy_strategy,
      proxies: String(form.outbound_proxy_list || '')
        .split(/\n+/)
        .map((x) => x.trim())
        .filter(Boolean),
    },
    pool_policy: {
      soft_model_block_ttl_sec: form.soft_model_block_ttl_sec,
      durable_model_block_ttl_sec: form.durable_model_block_ttl_sec,
      max_failover_attempts: form.max_failover_attempts,
    },
  }
  return body
}

async function save() {
  saving.value = true
  try {
    await putSettings(buildBody())
    try {
      await putTokenMaintain(!!form.token_maintain_enabled)
    } catch {
      /* ignore */
    }
    try {
      await putModelHealth(!!form.model_health_enabled)
    } catch {
      /* ignore */
    }
    try {
      await putAccountMode(String(form.account_mode || 'round_robin'))
    } catch {
      /* ignore */
    }
    message.success('设置已保存')
    await load()
  } catch (e: any) {
    message.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function savePw() {
  try {
    await changePassword({ ...pw })
    message.success('密码已更新')
    pw.current_password = ''
    pw.new_password = ''
    pw.confirm_password = ''
  } catch (e: any) {
    message.error(e?.message || '改密失败')
  }
}

async function saveCpa() {
  try {
    await putCLIProxySettings({ ...cpa })
    message.success('CLIProxyAPI 配置已保存')
  } catch (e: any) {
    message.error(e?.message || '保存失败')
  }
}

async function saveS2a() {
  try {
    await putSub2ApiSettings({ ...s2a })
    message.success('sub2api 配置已保存')
  } catch (e: any) {
    message.error(e?.message || '保存失败')
  }
}

onMounted(load)
</script>

<template>
  <Page auto-content-height>
  <Card :loading="loading" class="page-card">
    <Tabs>
      <TabPane key="runtime" tab="运行参数">
        <Form layout="vertical" style="max-width: 720px">
          <FormItem label="默认模型">
            <Input v-model:value="form.default_model" class="mono" />
          </FormItem>
          <FormItem label="账号轮询模式">
            <Select
              v-model:value="form.account_mode"
              :options="[
                { value: 'round_robin', label: 'round_robin' },
                { value: 'least_used', label: 'least_used' },
                { value: 'random', label: 'random' },
              ]"
            />
          </FormItem>
          <FormItem label="SSE keepalive（秒）">
            <InputNumber v-model:value="form.sse_keepalive_sec" :min="0" style="width: 100%" />
          </FormItem>
          <FormItem label="会话粘性 TTL（秒，0=默认）">
            <InputNumber v-model:value="form.affinity_ttl_sec" :min="0" style="width: 100%" />
          </FormItem>
          <FormItem label="Token 自动续期">
            <Switch v-model:checked="form.token_maintain_enabled" />
          </FormItem>
          <FormItem label="模型健康探测">
            <Switch v-model:checked="form.model_health_enabled" />
          </FormItem>
          <Divider>自动补号</Divider>
          <FormItem label="启用自动补号">
            <Switch v-model:checked="form.auto_replenish_enabled" />
          </FormItem>
          <FormItem label="可轮询账号阈值（低于此数触发）">
            <InputNumber
              v-model:value="form.auto_replenish_min_accounts"
              :min="0"
              :max="100000"
              style="width: 100%"
            />
          </FormItem>
          <FormItem label="单次补号数量">
            <InputNumber
              v-model:value="form.auto_replenish_count"
              :min="1"
              :max="10000"
              style="width: 100%"
            />
          </FormItem>
          <FormItem label="检查间隔（秒）">
            <InputNumber
              v-model:value="form.auto_replenish_interval_sec"
              :min="30"
              :max="86400"
              style="width: 100%"
            />
          </FormItem>
          <Divider>池策略</Divider>
          <FormItem label="软封禁 TTL（秒）">
            <InputNumber v-model:value="form.soft_model_block_ttl_sec" style="width: 100%" />
          </FormItem>
          <FormItem label="硬封禁 TTL（秒）">
            <InputNumber v-model:value="form.durable_model_block_ttl_sec" style="width: 100%" />
          </FormItem>
          <FormItem label="最大 failover 次数">
            <InputNumber v-model:value="form.max_failover_attempts" style="width: 100%" />
          </FormItem>
          <Divider>出站代理</Divider>
          <FormItem label="启用出站代理">
            <Switch v-model:checked="form.outbound_proxy_enabled" />
          </FormItem>
          <FormItem label="策略">
            <Select
              v-model:value="form.outbound_proxy_strategy"
              :options="[
                { value: 'round_robin', label: 'round_robin（账号粘性哈希）' },
                { value: 'random', label: 'random' },
              ]"
            />
          </FormItem>
          <FormItem label="代理列表（每行一个）">
            <Input.TextArea v-model:value="form.outbound_proxy_list" :rows="5" class="mono" />
          </FormItem>
          <Button type="primary" :loading="saving" @click="save">保存运行设置</Button>
        </Form>
      </TabPane>

      <TabPane key="password" tab="改密">
        <Form layout="vertical" style="max-width: 420px">
          <FormItem label="当前密码">
            <InputPassword v-model:value="pw.current_password" />
          </FormItem>
          <FormItem label="新密码">
            <InputPassword v-model:value="pw.new_password" />
          </FormItem>
          <FormItem label="确认新密码">
            <InputPassword v-model:value="pw.confirm_password" />
          </FormItem>
          <Button type="primary" @click="savePw">更新密码</Button>
        </Form>
      </TabPane>

      <TabPane key="cpa" tab="CLIProxyAPI">
        <Form layout="vertical" style="max-width: 640px">
          <FormItem label="启用">
            <Switch v-model:checked="cpa.enabled" />
          </FormItem>
          <FormItem label="Base URL">
            <Input v-model:value="cpa.base_url" class="mono" />
          </FormItem>
          <FormItem label="Token">
            <InputPassword v-model:value="cpa.token" />
          </FormItem>
          <FormItem label="upstream">
            <Input v-model:value="cpa.upstream" class="mono" />
          </FormItem>
          <FormItem label="注册成功自动推送">
            <Switch v-model:checked="cpa.auto_push_on_register" />
          </FormItem>
          <Space>
            <Button type="primary" @click="saveCpa">保存</Button>
            <Button
              @click="
                async () => {
                  try {
                    const r = await testCLIProxy()
                    message.success(r.message || '测试成功')
                  } catch (e: any) {
                    message.error(e?.message || '测试失败')
                  }
                }
              "
            >
              测试连接
            </Button>
          </Space>
        </Form>
      </TabPane>

      <TabPane key="s2a" tab="sub2api">
        <Form layout="vertical" style="max-width: 640px">
          <FormItem label="启用">
            <Switch v-model:checked="s2a.enabled" />
          </FormItem>
          <FormItem label="Base URL">
            <Input v-model:value="s2a.base_url" class="mono" />
          </FormItem>
          <FormItem label="Token">
            <InputPassword v-model:value="s2a.token" />
          </FormItem>
          <FormItem label="Group ID">
            <Input v-model:value="s2a.group_id" class="mono" />
          </FormItem>
          <FormItem label="注册成功自动推送">
            <Switch v-model:checked="s2a.auto_push_on_register" />
          </FormItem>
          <Space>
            <Button type="primary" @click="saveS2a">保存</Button>
            <Button
              @click="
                async () => {
                  try {
                    const r = await testSub2Api()
                    message.success(r.message || '测试成功')
                  } catch (e: any) {
                    message.error(e?.message || '测试失败')
                  }
                }
              "
            >
              测试连接
            </Button>
          </Space>
        </Form>
      </TabPane>
    </Tabs>
  </Card>
  </Page>
</template>
