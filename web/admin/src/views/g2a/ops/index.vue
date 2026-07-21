<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { Page } from '@/components';
import {
  App as AntApp,
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Row,
  Space,
  Switch,
  Tag,
  Typography,
  message as staticMessage,
} from 'antdv-next';
import {
  CloudServerOutlined,
  HeartOutlined,
  ReloadOutlined,
  SettingOutlined,
  TeamOutlined,
  ThunderboltOutlined,
} from '@antdv-next/icons';

import {
  getModelHealth,
  getStatus,
  getUpstreamStatus,
  probeAll,
  putModelHealth,
  putTokenMaintain,
  refreshAccounts,
  runAutoReplenish,
  runMaintainer,
} from '@/api/g2a';
import { fmtTime } from '@/utils/g2a/format';

defineOptions({ name: 'G2aOps' });

let message = staticMessage;
try {
  message = AntApp.useApp().message;
} catch {
  /* outside App provider */
}

const router = useRouter();
const loading = ref(false);
const status = ref<Record<string, any>>({});
const upstream = ref<Record<string, any> | null>(null);
const modelHealth = ref<Record<string, any> | null>(null);
const actionLog = ref<string[]>([]);

const busy = ref({
  maintainer: false,
  refreshTokens: false,
  probe: false,
  autoReplenish: false,
  upstream: false,
  toggleTm: false,
  toggleMh: false,
});

let pollTimer: ReturnType<typeof setInterval> | null = null;

function pushLog(line: string) {
  const ts = new Date().toLocaleTimeString();
  actionLog.value = [`[${ts}] ${line}`, ...actionLog.value].slice(0, 40);
}

function tagOf(running?: boolean, enabled?: boolean) {
  if (running) return { color: 'success', text: '运行中' };
  if (enabled === false) return { color: 'default', text: '已关闭' };
  if (enabled) return { color: 'processing', text: '已启用' };
  return { color: 'default', text: '未知' };
}

const tm = computed(() => status.value.token_maintainer || {});
const mh = computed(() => modelHealth.value || status.value.model_health || {});
const ar = computed(() => status.value.auto_replenish || {});
const settings = computed(() => status.value.settings || {});

const tmRunning = computed(
  () => !!(tm.value.running || tm.value.cluster_running || tm.value.leader_running),
);
const mhRunning = computed(
  () => !!(mh.value.running || mh.value.cluster_running || mh.value.leader_running || mh.value.job?.running),
);
const arRunning = computed(
  () => !!(ar.value.running || ar.value.cluster_running || ar.value.leader_running),
);

const tmEnabled = computed(() => {
  if (tm.value.enabled != null) return !!tm.value.enabled;
  return settings.value.token_maintain_enabled !== false;
});
const mhEnabled = computed(() => {
  if (mh.value.enabled != null) return !!mh.value.enabled;
  return settings.value.model_health_enabled !== false;
});
const arEnabled = computed(() => {
  if (ar.value.enabled != null) return !!ar.value.enabled;
  return !!settings.value.auto_replenish_enabled;
});

async function load(opts: { quiet?: boolean } = {}) {
  if (!opts.quiet) loading.value = true;
  try {
    const [st, mhSt] = await Promise.all([
      getStatus(),
      getModelHealth().catch(() => null),
    ]);
    status.value = st || {};
    if (mhSt) modelHealth.value = mhSt;
  } catch (e: any) {
    if (!opts.quiet) message.error(e?.message || '加载失败');
  } finally {
    if (!opts.quiet) loading.value = false;
  }
}

async function doRunMaintainer() {
  busy.value.maintainer = true;
  try {
    const r = await runMaintainer(true);
    pushLog(
      `Token 续期周期：${r?.ok === false ? '失败' : '已触发'}` +
        (r?.message ? ` · ${r.message}` : ''),
    );
    message.success('已触发 Token 续期周期');
    await load({ quiet: true });
  } catch (e: any) {
    message.error(e?.message || '触发失败');
    pushLog(`Token 续期失败：${e?.message || e}`);
  } finally {
    busy.value.maintainer = false;
  }
}

async function doRefreshTokens() {
  busy.value.refreshTokens = true;
  try {
    const r = await refreshAccounts();
    const n =
      r?.refreshed ??
      r?.refresh?.refreshed ??
      (Array.isArray(r?.results) ? r.results.filter((x: any) => x?.ok && !x?.skipped).length : null);
    pushLog(`强制刷新 Token：${n != null ? n + ' 个账号' : '完成'}`);
    message.success(`Token 已刷新${n != null ? `：${n} 个账号` : ''}`);
    await load({ quiet: true });
  } catch (e: any) {
    message.error(e?.message || '刷新失败');
    pushLog(`强制刷新失败：${e?.message || e}`);
  } finally {
    busy.value.refreshTokens = false;
  }
}

async function doProbeAll() {
  busy.value.probe = true;
  pushLog('全部账号模型探测：已启动…');
  try {
    let r: any = await probeAll();
    const startedAt = Date.now();
    const deadline = Date.now() + 50 * 60 * 1000;
    while (true) {
      const job = r?.running != null ? r : r?.job || r;
      const running = !!(job && job.running);
      if (!running) {
        r = job || r;
        break;
      }
      if (Date.now() > deadline) throw new Error('探测超时（>50min）');
      const elapsed = Math.round((Date.now() - startedAt) / 1000);
      const probed = job?.probed ?? job?.count ?? 0;
      pushLog(`探测进行中… ${elapsed}s · 已探测 ${probed}`);
      await new Promise((res) => setTimeout(res, 2500));
      try {
        const st = await getModelHealth();
        modelHealth.value = st;
        r = st?.job || st?.last || st;
        if (st?.sweep && r && !r.sweep) r.sweep = st.sweep;
      } catch {
        /* keep polling */
      }
    }
    const okN = r?.available_count ?? r?.available ?? 0;
    const totalN = r?.count ?? r?.probed ?? 0;
    pushLog(`探测完成：可用 ${okN}/${totalN}`);
    if (r?.error && totalN === 0) message.error(String(r.error));
    else if (totalN === 0) message.warning('探测完成：0 个账号被选中');
    else message.success(`探测完成：${okN}/${totalN} 可用`);
    await load({ quiet: true });
  } catch (e: any) {
    message.error(e?.message || '探测失败');
    pushLog(`探测失败：${e?.message || e}`);
  } finally {
    busy.value.probe = false;
  }
}

async function doAutoReplenish() {
  busy.value.autoReplenish = true;
  try {
    const r = await runAutoReplenish();
    status.value = {
      ...status.value,
      auto_replenish: { ...(status.value.auto_replenish || {}), ...r },
    };
    if (r?.triggered) {
      message.success('已触发自动补号');
      pushLog(`自动补号：已触发 · 数量 ${r?.replenish_count ?? r?.count ?? '—'}`);
    } else if (r?.skipped === 'above_threshold') {
      message.info('可轮询账号充足，无需补号');
      pushLog(
        `自动补号：跳过（充足）· 可轮询 ${r?.rotatable_count ?? '—'}/${r?.account_count ?? '—'}`,
      );
    } else if (r?.skipped === 'registration_busy') {
      message.warning('已有注册任务进行中');
      pushLog('自动补号：跳过（注册进行中）');
    } else if (r?.skipped === 'disabled') {
      message.warning('自动补号未启用（可在系统设置开启）');
      pushLog('自动补号：未启用');
    } else if (r?.skipped === 'start_failed') {
      message.error(r?.result?.error || '启动注册失败');
      pushLog(`自动补号：启动失败 · ${r?.result?.error || ''}`);
    } else {
      message.info(r?.skipped ? `已跳过：${r.skipped}` : '检查完成');
      pushLog(`自动补号：${r?.skipped || '检查完成'}`);
    }
    await load({ quiet: true });
  } catch (e: any) {
    message.error(e?.message || '检查失败');
    pushLog(`自动补号失败：${e?.message || e}`);
  } finally {
    busy.value.autoReplenish = false;
  }
}

async function doUpstream(force = true) {
  busy.value.upstream = true;
  try {
    const st = await getUpstreamStatus(force);
    upstream.value = st;
    status.value = { ...status.value, upstream_status: st };
    if (st?.ok) {
      message.success(
        `上游正常${st.latency_ms != null ? ` · ${st.latency_ms} ms` : ''}`,
      );
      pushLog(`上游探测：正常 · ${st.latency_ms ?? '—'} ms`);
    } else {
      message.warning(st?.error || st?.message || '上游异常');
      pushLog(`上游探测：异常 · ${st?.error || st?.message || 'unknown'}`);
    }
  } catch (e: any) {
    message.error(e?.message || '上游探测失败');
    pushLog(`上游探测失败：${e?.message || e}`);
  } finally {
    busy.value.upstream = false;
  }
}

async function onToggleTokenMaintain(v: boolean) {
  busy.value.toggleTm = true;
  try {
    await putTokenMaintain(v);
    message.success(v ? 'Token 自动续期已开启' : 'Token 自动续期已关闭');
    pushLog(`Token 自动续期 → ${v ? '开' : '关'}`);
    await load({ quiet: true });
  } catch (e: any) {
    message.error(e?.message || '切换失败');
  } finally {
    busy.value.toggleTm = false;
  }
}

async function onToggleModelHealth(v: boolean) {
  busy.value.toggleMh = true;
  try {
    await putModelHealth(v);
    message.success(v ? '模型健康探测已开启' : '模型健康探测已关闭');
    pushLog(`模型健康探测 → ${v ? '开' : '关'}`);
    await load({ quiet: true });
  } catch (e: any) {
    message.error(e?.message || '切换失败');
  } finally {
    busy.value.toggleMh = false;
  }
}

function lastMaintainerText() {
  const last = tm.value.last || {};
  if (!last.at && !last.refresh) return '尚未执行';
  const parts = [`上次 ${fmtTime(last.at) || '—'}`];
  const ref = last.refresh || {};
  if (ref.refreshed != null) parts.push(`刷新 ${ref.refreshed}`);
  if (ref.failed) parts.push(`失败 ${ref.failed}`);
  if (ref.skipped) parts.push(`跳过 ${ref.skipped}`);
  return parts.join(' · ');
}

function lastModelHealthText() {
  const last = mh.value.last || mh.value.job || {};
  if (!last.at && !last.probed_at && last.count == null && last.probed == null) {
    return '尚未跑过周期探测';
  }
  const parts = [
    `上次 ${fmtTime(last.at || last.probed_at) || '—'}`,
    `可用 ${last.available_count ?? '—'}/${last.count ?? last.probed ?? '—'}`,
  ];
  if (last.auto_action_count != null) parts.push(`自动处理 ${last.auto_action_count}`);
  if (last.kick_cooldown || last.kick_disabled) {
    parts.push(`踢出 冷却${last.kick_cooldown || 0}/硬${last.kick_disabled || 0}`);
  }
  return parts.join(' · ');
}

function lastAutoReplenishText() {
  const last = ar.value.last || {};
  if (!last.at && !last.skipped && last.triggered == null) {
    const minN = ar.value.min_accounts ?? settings.value.auto_replenish_min_accounts ?? 50;
    const cnt = ar.value.replenish_count ?? settings.value.auto_replenish_count ?? 5;
    return `可轮询低于 ${minN} 时自动注册 ${cnt} 个`;
  }
  const when = last.at ? fmtTime(last.at) : '';
  if (last.triggered) {
    return `已触发补号 ${last.replenish_count || '—'}${when ? ' · ' + when : ''}`;
  }
  const map: Record<string, string> = {
    disabled: '已关闭',
    above_threshold: '可轮询账号充足',
    registration_busy: '注册进行中，跳过',
    cooldown: '冷却中',
    start_failed: '启动失败',
  };
  if (last.skipped) {
    let t = map[last.skipped] || last.skipped;
    if (last.rotatable_count != null) {
      t += `（可轮询 ${last.rotatable_count}${last.account_count != null ? '/' + last.account_count : ''}）`;
    }
    if (when) t += ` · ${when}`;
    return t;
  }
  return when || '—';
}

function upstreamText() {
  const u = upstream.value || status.value.upstream_status;
  if (!u) return status.value.upstream || status.value.credentials_email || '点击「探测上游」获取延迟与状态';
  if (u.ok) {
    return `正常 · 延迟 ${u.latency_ms ?? '—'} ms${u.checked_at || u.at ? ' · ' + fmtTime(u.checked_at || u.at) : ''}`;
  }
  return u.error || u.message || '异常';
}

onMounted(async () => {
  await load();
  doUpstream(false).catch(() => {});
  pollTimer = setInterval(() => {
    if (document.hidden) return;
    load({ quiet: true });
  }, 15000);
});

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
});
</script>

<template>
  <Page
    auto-content-height
  >
    <template #extra>
      <Space>
        <Button :loading="loading" @click="() => load()">
          <template #icon><ReloadOutlined /></template>
          刷新状态
        </Button>
        <Button type="primary" @click="router.push('/settings')">
          <template #icon><SettingOutlined /></template>
          系统设置
        </Button>
      </Space>
    </template>

    <Row :gutter="[16, 16]">
      <Col :xs="24" :md="12" :xl="8">
        <Card size="small" title="Token 续期" class="h-full">
          <template #extra>
            <Tag :color="tagOf(tmRunning, tmEnabled).color">
              {{ tagOf(tmRunning, tmEnabled).text }}
            </Tag>
          </template>
          <p class="text-muted-foreground m-0 text-sm">
            间隔 {{ tm.interval_sec ?? settings.token_maintain_interval_sec ?? '—' }}s
          </p>
          <p class="text-muted-foreground mt-1 m-0 text-sm">{{ lastMaintainerText() }}</p>
          <Divider class="my-3" />
          <Space wrap>
            <span class="text-sm">后台续期</span>
            <Switch
              :checked="tmEnabled"
              :loading="busy.toggleTm"
              @change="(v: boolean) => onToggleTokenMaintain(v)"
            />
          </Space>
          <Space class="mt-3" wrap>
            <Button
              type="primary"
              size="small"
              :loading="busy.maintainer"
              @click="doRunMaintainer"
            >
              <template #icon><ThunderboltOutlined /></template>
              跑一轮续期
            </Button>
            <Button size="small" :loading="busy.refreshTokens" @click="doRefreshTokens">
              强制刷新 Token
            </Button>
          </Space>
        </Card>
      </Col>

      <Col :xs="24" :md="12" :xl="8">
        <Card size="small" title="模型探测" class="h-full">
          <template #extra>
            <Tag :color="tagOf(mhRunning, mhEnabled).color">
              {{ tagOf(mhRunning, mhEnabled).text }}
            </Tag>
          </template>
          <p class="text-muted-foreground m-0 text-sm">
            间隔 {{ mh.interval_sec ?? settings.model_health_interval_sec ?? '—' }}s
          </p>
          <p class="text-muted-foreground mt-1 m-0 text-sm">{{ lastModelHealthText() }}</p>
          <Divider class="my-3" />
          <Space wrap>
            <span class="text-sm">后台探测</span>
            <Switch
              :checked="mhEnabled"
              :loading="busy.toggleMh"
              @change="(v: boolean) => onToggleModelHealth(v)"
            />
          </Space>
          <Space class="mt-3" wrap>
            <Button type="primary" size="small" :loading="busy.probe" @click="doProbeAll">
              <template #icon><HeartOutlined /></template>
              全部账号探测
            </Button>
          </Space>
        </Card>
      </Col>

      <Col :xs="24" :md="12" :xl="8">
        <Card size="small" title="自动补号" class="h-full">
          <template #extra>
            <Tag :color="tagOf(arRunning, arEnabled).color">
              {{ tagOf(arRunning, arEnabled).text }}
            </Tag>
          </template>
          <p class="text-muted-foreground m-0 text-sm">
            阈值 {{ ar.min_accounts ?? settings.auto_replenish_min_accounts ?? '—' }} · 单次
            {{ ar.replenish_count ?? settings.auto_replenish_count ?? '—' }} · 间隔
            {{ ar.interval_sec ?? settings.auto_replenish_interval_sec ?? '—' }}s
          </p>
          <p class="text-muted-foreground mt-1 m-0 text-sm">{{ lastAutoReplenishText() }}</p>
          <Divider class="my-3" />
          <Space wrap>
            <Button
              type="primary"
              size="small"
              :loading="busy.autoReplenish"
              @click="doAutoReplenish"
            >
              <template #icon><TeamOutlined /></template>
              立即检查补号
            </Button>
            <Button size="small" @click="router.push('/accounts/register')">协议注册</Button>
            <Button size="small" type="link" @click="router.push('/settings')">配置阈值</Button>
          </Space>
        </Card>
      </Col>

      <Col :xs="24" :md="12" :xl="8">
        <Card size="small" title="上游 / 凭证" class="h-full">
          <template #extra>
            <Tag
              :color="
                (upstream || status.upstream_status)?.ok
                  ? 'success'
                  : status.credentials_ok
                    ? 'warning'
                    : 'error'
              "
            >
              {{
                (upstream || status.upstream_status)?.ok
                  ? '连通'
                  : status.credentials_ok
                    ? '凭证 OK'
                    : '异常'
              }}
            </Tag>
          </template>
          <p class="text-muted-foreground m-0 break-all text-sm">{{ upstreamText() }}</p>
          <Space class="mt-3" wrap>
            <Button
              type="primary"
              size="small"
              :loading="busy.upstream"
              @click="() => doUpstream(true)"
            >
              <template #icon><CloudServerOutlined /></template>
              探测上游
            </Button>
          </Space>
        </Card>
      </Col>

      <Col :xs="24" :md="12" :xl="8">
        <Card size="small" title="集群 Leader" class="h-full">
          <template #extra>
            <Tag :color="status.leader?.is_leader ? 'success' : 'default'">
              {{ status.leader?.is_leader ? '本节点' : status.leader?.leader_id || '—' }}
            </Tag>
          </template>
          <Descriptions
            size="small"
            :column="1"
            class="text-sm"
            :items="[
              { key: 'mode', label: 'mode', children: status.leader?.mode || '—' },
              {
                key: 'workers',
                label: 'workers',
                children: String(status.leader?.workers ?? '—'),
              },
              {
                key: 'leader_id',
                label: 'leader_id',
                children: status.leader?.leader_id || '—',
              },
            ]"
          />
        </Card>
      </Col>

      <Col :xs="24" :md="12" :xl="8">
        <Card size="small" title="注册服务" class="h-full">
          <template #extra>
            <Tag :color="status.registration?.available ? 'success' : 'warning'">
              {{ status.registration?.available ? '可用' : '不可用' }}
            </Tag>
          </template>
          <p class="text-muted-foreground m-0 text-sm">
            {{ status.registration?.mode || '—' }}
          </p>
          <Button class="mt-3" type="link" size="small" @click="router.push('/accounts/register')">
            打开协议注册
          </Button>
        </Card>
      </Col>
    </Row>

    <Card size="small" title="操作日志" class="mt-4">
      <Typography.Paragraph v-if="!actionLog.length" type="secondary" class="m-0">
        触发动作后会在此留下简要记录（本页会话内）。
      </Typography.Paragraph>
      <pre
        v-else
        class="m-0 max-h-48 overflow-auto text-xs"
        style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
      >{{ actionLog.join('\n') }}</pre>
    </Card>
  </Page>
</template>
