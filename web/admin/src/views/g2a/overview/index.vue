<script setup lang="ts">
import type { EChartsOption } from 'echarts';

import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { Page } from '@/components';
import {
  App as AntApp,
  Button,
  Card,
  Col,
  Progress,
  Row,
  Space,
  Spin,
  Tag,
  Tooltip,
  message as staticMessage,
} from 'antdv-next';
import {
  HeartOutlined,
  KeyOutlined,
  ReloadOutlined,
  SettingOutlined,
  TeamOutlined,
  UserAddOutlined,
} from '@antdv-next/icons';

import { getDashboard, getStatus, getUsageSeries } from '@/api/g2a';
import { fmtNum, fmtRemaining, fmtTime, fmtTokens, tokensToM } from '@/utils/g2a/format';

import BaseChart from '@/views/dashboard/analytics/components/base-chart.vue';
import StatCard from '@/views/dashboard/analytics/components/stat-card.vue';

defineOptions({ name: 'G2aOverview' });

let message = staticMessage;
try {
  message = AntApp.useApp().message;
} catch {
  /* outside App provider */
}

const router = useRouter();
const loading = ref(false);
const status = ref<Record<string, any>>({});
const dash = ref<Record<string, any>>({});
const series = ref<
  Array<{
    day: string;
    requests?: number;
    success?: number;
    fail?: number;
    total_tokens?: number;
    success_rate?: number;
  }>
>([]);
let timer: number | undefined;

const merged = computed(() => ({ ...status.value, ...dash.value }));

const pool = computed(() => {
  const s = status.value || {};
  const d = dash.value || {};
  return Object.assign({}, d.pool || {}, s.pool || {});
});

const usage = computed(() => {
  const s = status.value || {};
  const d = dash.value || {};
  return Object.assign({}, s.usage || {}, d.usage || {});
});

const keys = computed(() => {
  const s = status.value || {};
  const d = dash.value || {};
  return Object.assign({}, s.keys || {}, d.keys || {});
});

const accounts = computed(() => {
  const s = status.value || {};
  const d = dash.value || {};
  return Object.assign({}, s.accounts || {}, d.accounts || {});
});

const tokenMaintainer = computed(() => {
  const s = status.value || {};
  const d = dash.value || {};
  return Object.assign({}, s.token_maintainer || {}, d.token_maintainer || {});
});

const modelHealth = computed(() => {
  const s = status.value || {};
  const d = dash.value || {};
  return Object.assign({}, s.model_health || {}, d.model_health || {});
});

const autoReplenish = computed(() => {
  const s = status.value || {};
  const d = dash.value || {};
  return Object.assign({}, s.auto_replenish || {}, d.auto_replenish || {});
});

const credentialsOk = computed(
  () => !!(merged.value.credentials_ok ?? merged.value.credentials?.ok),
);

const poolTotal = computed(
  () =>
    Number(pool.value.total ?? accounts.value.account_count ?? 0) || 0,
);
const poolLive = computed(
  () =>
    Number(
      pool.value.live ??
        pool.value.rotatable ??
        pool.value.enabled ??
        accounts.value.active_count ??
        0,
    ) || 0,
);

const poolLiveRate = computed(() => {
  if (!poolTotal.value) return 0;
  return Math.round((poolLive.value / poolTotal.value) * 1000) / 10;
});

const tmRunning = computed(() => {
  const tm = tokenMaintainer.value;
  return !!(tm.running || tm.cluster_running || tm.leader_running);
});

const remLabel = computed(() => {
  const tm = tokenMaintainer.value;
  const last = tm.last || {};
  const rem =
    tm.min_remaining_sec != null ? tm.min_remaining_sec : last.min_remaining_sec;
  if (rem == null || rem === '') return '—';
  if (Number(rem) < 0) return '已过期';
  return fmtRemaining(Date.now() / 1000 + Number(rem));
});

const nextWaitLabel = computed(() => {
  const tm = tokenMaintainer.value;
  const last = tm.last || {};
  const next =
    tm.next_wait_sec != null
      ? tm.next_wait_sec
      : last.next_wait_sec != null
        ? last.next_wait_sec
        : tm.interval_sec;
  return next == null || next === '' ? '—' : `${next}s`;
});

const lastRefreshCount = computed(() => {
  const last = tokenMaintainer.value.last || {};
  const ref = last.refresh;
  if (ref && ref.refreshed != null) return Number(ref.refreshed);
  return null;
});

/** KPI cards — reuse analytics StatCard style */
const statCards = computed(() => {
  const u = usage.value;
  const k = keys.value;
  const healthPct = poolTotal.value ? poolLiveRate.value : 0;
  // trend slots: use health / success as visual indicators (not fake MoM %)
  return [
    {
      title: '可轮询账号',
      value: poolLive.value,
      trend: healthPct >= 50 ? healthPct : -Math.max(1, 100 - healthPct),
      desc: `共 ${poolTotal.value} · 健康 ${healthPct}%`,
      color: (healthPct >= 70
        ? 'success'
        : healthPct >= 40
          ? 'warning'
          : 'destructive') as 'success' | 'warning' | 'destructive' | 'primary',
      icon: 'icon-[lucide--users]',
      suffix: ' 个',
    },
    {
      title: '今日 Token',
      value: tokensToM(u.today_tokens || 0),
      trend: Number(u.today_success || 0) >= Number(u.today_fail || 0) ? 8 : -5,
      desc: `请求 ${fmtNum(u.today_requests || 0)} · 成功 ${fmtNum(u.today_success || 0)}`,
      color: 'primary' as const,
      icon: 'icon-[lucide--zap]',
      suffix: ' M',
      decimals: 2,
    },
    {
      title: 'API Keys',
      value: Number(k.enabled || 0),
      trend: k.auth_required ? 3 : -3,
      desc: `共 ${k.total ?? 0} · 累计请求 ${fmtNum(k.total_requests || 0)}`,
      color: 'warning' as const,
      icon: 'icon-[lucide--key-round]',
      suffix: ' 启用',
    },
    {
      title: '累计 Token',
      value: tokensToM(u.total_tokens || 0),
      trend: 5,
      desc: `累计请求 ${fmtNum(u.total_requests || 0)}`,
      color: 'primary' as const,
      icon: 'icon-[lucide--activity]',
      suffix: ' M',
      decimals: 2,
    },
  ];
});

/** Pool breakdown rows for progress bars */
const poolBreakdown = computed(() => {
  const p = pool.value;
  const total = Math.max(poolTotal.value, 1);
  const rows = [
    {
      key: 'live',
      label: '可轮询',
      value: Number(p.live ?? p.rotatable ?? 0),
      color: '#52c41a',
    },
    {
      key: 'cooldown',
      label: '冷却中',
      value: Number(p.in_cooldown ?? 0),
      color: '#faad14',
    },
    {
      key: 'expired',
      label: '已过期',
      value: Number(p.expired ?? 0),
      color: '#ff4d4f',
    },
    {
      key: 'blocked',
      label: '模型封禁',
      value: Number(p.model_blocked ?? 0),
      color: '#722ed1',
    },
    {
      key: 'quota',
      label: '额度禁用',
      value: Number(p.quota_disabled ?? 0),
      color: '#eb2f96',
    },
    {
      key: 'disabled',
      label: '手动禁用',
      value: Number(p.disabled ?? 0),
      color: '#8c8c8c',
    },
  ];
  return rows.map((r) => ({
    ...r,
    percent: Math.min(100, Math.round((r.value / total) * 1000) / 10),
  }));
});

const poolPieOption = computed<EChartsOption>(() => {
  const data = poolBreakdown.value
    .filter((r) => r.value > 0)
    .map((r) => ({ name: r.label, value: r.value, itemStyle: { color: r.color } }));
  if (!data.length) {
    data.push({
      name: '暂无',
      value: 1,
      itemStyle: { color: '#d9d9d9' },
    });
  }
  return {
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: {
      orient: 'vertical',
      right: 8,
      top: 'middle',
      icon: 'circle',
      itemWidth: 8,
      itemHeight: 8,
      textStyle: { fontSize: 12 },
    },
    series: [
      {
        type: 'pie',
        radius: ['48%', '72%'],
        center: ['36%', '50%'],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 6, borderColor: 'transparent', borderWidth: 2 },
        label: { show: false },
        data,
      },
    ],
  };
});

const usageTrendOption = computed<EChartsOption>(() => {
  const items = series.value || [];
  const days = items.map((i) => String(i.day || '').slice(5) || i.day);
  const reqs = items.map((i) => Number(i.requests || 0));
  const tokens = items.map((i) => tokensToM(i.total_tokens || 0));
  const rates = items.map((i) => Number(i.success_rate ?? 0));

  return {
    color: ['#1677ff', '#52c41a', '#faad14'],
    grid: { top: 48, left: 12, right: 16, bottom: 8, containLabel: true },
    legend: {
      data: ['请求数', 'Token (M)', '成功率'],
      top: 0,
      right: 0,
      icon: 'roundRect',
      itemWidth: 12,
      itemHeight: 4,
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255,255,255,0.96)',
      borderColor: '#eee',
      borderWidth: 1,
      textStyle: { color: '#333' },
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: days.length ? days : ['—'],
      axisLine: { lineStyle: { color: '#e8e8e8' } },
      axisLabel: { color: '#999' },
    },
    yAxis: [
      {
        type: 'value',
        name: '请求',
        splitLine: { lineStyle: { type: 'dashed', color: '#f0f0f0' } },
        axisLabel: { color: '#999' },
      },
      {
        type: 'value',
        name: 'Token (M)',
        splitLine: { show: false },
        axisLabel: {
          color: '#999',
          formatter: (v: number) => (Number.isFinite(v) ? v.toFixed(2) : '0'),
        },
      },
      {
        type: 'value',
        name: '%',
        min: 0,
        max: 100,
        show: false,
      },
    ],
    series: [
      {
        name: '请求数',
        type: 'bar',
        barMaxWidth: 28,
        data: reqs.length ? reqs : [0],
        itemStyle: { borderRadius: [4, 4, 0, 0] },
      },
      {
        name: 'Token (M)',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        showSymbol: false,
        data: tokens.length ? tokens : [0],
        lineStyle: { width: 3 },
        areaStyle: {
          opacity: 0.12,
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: '#52c41a' },
              { offset: 1, color: 'rgba(82, 196, 26, 0.01)' },
            ],
          },
        },
      },
      {
        name: '成功率',
        type: 'line',
        yAxisIndex: 2,
        smooth: true,
        showSymbol: true,
        symbolSize: 6,
        data: rates.length ? rates : [0],
        lineStyle: { width: 2, type: 'dashed' },
      },
    ],
  };
});

type ServiceItem = {
  key: string;
  title: string;
  status: 'success' | 'warning' | 'error' | 'default';
  statusText: string;
  desc: string;
};

const serviceItems = computed<ServiceItem[]>(() => {
  const m = merged.value;
  const tm = tokenMaintainer.value;
  const mh = modelHealth.value;
  const ar = autoReplenish.value;
  const leader = m.leader || {};
  const redis = m.redis || {};
  const reg = m.registration || {};
  const affinity = m.conversation_affinity || {};

  function runTag(
    running: boolean,
    enabled: boolean | undefined,
  ): Pick<ServiceItem, 'status' | 'statusText'> {
    if (running) return { status: 'success', statusText: '运行中' };
    if (enabled === false) return { status: 'default', statusText: '已关闭' };
    if (enabled) return { status: 'warning', statusText: '已启用' };
    return { status: 'default', statusText: '未运行' };
  }

  const tmTag = runTag(tmRunning.value, tm.enabled);
  const mhTag = runTag(!!(mh.running || mh.cluster_running), mh.enabled);
  const arTag = runTag(!!(ar.running || ar.cluster_running), ar.enabled);

  return [
    {
      key: 'credentials',
      title: '上游凭证',
      status: credentialsOk.value ? 'success' : 'error',
      statusText: credentialsOk.value ? '正常' : '异常',
      desc: m.credentials_email || m.credentials?.email || m.upstream || '—',
    },
    {
      key: 'token',
      title: 'Token 续期',
      ...tmTag,
      desc: `最短剩余 ${remLabel.value} · 下次 ${nextWaitLabel.value}${
        lastRefreshCount.value != null ? ` · 上次刷新 ${lastRefreshCount.value}` : ''
      }${tm.last?.at ? ` · ${fmtTime(tm.last.at)}` : ''}`,
    },
    {
      key: 'model_health',
      title: '模型探测',
      ...mhTag,
      desc: mh.last?.at
        ? `上次 ${fmtTime(mh.last.at)} · 探测 ${mh.last.probed ?? 0}`
        : `间隔 ${mh.interval_sec ?? '—'}s`,
    },
    {
      key: 'replenish',
      title: '自动补号',
      ...arTag,
      desc: ar.last?.skipped
        ? `最近跳过: ${ar.last.skipped}`
        : `阈值 ${ar.min_accounts ?? '—'} · 单次 ${ar.replenish_count ?? '—'}`,
    },
    {
      key: 'leader',
      title: '集群 Leader',
      status: leader.is_leader ? 'success' : leader.redis_enabled ? 'warning' : 'default',
      statusText: leader.is_leader ? '本节点' : leader.leader_id || '—',
      desc: `mode ${leader.mode || '—'} · workers ${leader.workers ?? '—'}`,
    },
    {
      key: 'redis',
      title: 'Redis / 存储',
      status:
        redis.ok === false || m.store?.ok === false
          ? 'error'
          : redis.enabled === false
            ? 'default'
            : 'success',
      statusText: String(m.store?.backend || m.store_backend || redis.source || '—'),
      desc: `runtime ${m.runtime || 'go'} · v${m.version || '—'}`,
    },
    {
      key: 'affinity',
      title: '会话亲和',
      status: affinity.enabled ? 'success' : 'default',
      statusText: affinity.enabled ? '开启' : '关闭',
      desc: affinity.implementation || '—',
    },
    {
      key: 'registration',
      title: '注册服务',
      status: reg.available ? 'success' : 'warning',
      statusText: reg.available ? '可用' : '不可用',
      desc: reg.mode || (reg.external ? 'external' : '—'),
    },
  ];
});

const statusColorMap: Record<string, string> = {
  success: 'success',
  warning: 'warning',
  error: 'error',
  default: 'default',
};

async function load() {
  loading.value = true;
  try {
    const [st, da, se] = await Promise.all([
      getStatus(),
      getDashboard().catch((e: any) => {
        console.warn(e);
        return {};
      }),
      getUsageSeries(7).catch((e: any) => {
        console.warn(e);
        return { items: [] };
      }),
    ]);
    status.value = st || {};
    dash.value = da || {};
    series.value = Array.isArray(se?.items) ? se.items : [];
  } catch (e: any) {
    message.error(e?.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  load();
  timer = window.setInterval(load, 15000);
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <Page
    auto-content-height
  >
    <template #extra>
      <Space wrap>
        <Tag :color="credentialsOk ? 'success' : 'error'">
          {{ credentialsOk ? '凭证正常' : '凭证异常' }}
        </Tag>
        <Tag color="processing">
          {{ merged.account_mode || pool.mode || '—' }}
        </Tag>
        <Tag v-if="merged.default_model" color="blue">
          {{ merged.default_model }}
        </Tag>
        <Button type="primary" :loading="loading" @click="load">
          <template #icon><ReloadOutlined /></template>
          刷新
        </Button>
      </Space>
    </template>

    <Spin :spinning="loading && !poolTotal">
      <!-- KPI -->
      <div class="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          v-for="(card, idx) in statCards"
          :key="idx"
          :title="card.title"
          :value="card.value"
          :trend="card.trend"
          :desc="card.desc"
          :color="card.color"
          :icon="card.icon"
          :suffix="card.suffix"
          :decimals="card.decimals ?? 0"
        />
      </div>

      <Row :gutter="[16, 16]">
        <!-- Pool -->
        <Col :xs="24" :lg="10" :xl="9">
          <Card class="overview-card h-full" title="账号池分布" size="small">
            <template #extra>
              <Space size="small">
                <Button type="link" size="small" @click="router.push('/accounts')">
                  <TeamOutlined /> 账号池
                </Button>
                <Button type="link" size="small" @click="router.push('/accounts/register')">
                  <UserAddOutlined /> 协议注册
                </Button>
              </Space>
            </template>
            <div class="flex flex-col gap-4">
              <div class="flex items-end justify-between">
                <div>
                  <div class="text-muted-foreground text-xs">可轮询 / 总量</div>
                  <div class="text-2xl font-semibold tabular-nums">
                    {{ poolLive }}
                    <span class="text-muted-foreground text-base font-normal">
                      / {{ poolTotal }}
                    </span>
                  </div>
                </div>
                <div class="text-right">
                  <div class="text-muted-foreground text-xs">健康度</div>
                  <div
                    class="text-xl font-semibold"
                    :class="
                      poolLiveRate >= 70
                        ? 'text-success'
                        : poolLiveRate >= 40
                          ? 'text-warning'
                          : 'text-destructive'
                    "
                  >
                    {{ poolLiveRate }}%
                  </div>
                </div>
              </div>
              <BaseChart :option="poolPieOption" height="200px" />
              <div class="space-y-2">
                <div
                  v-for="row in poolBreakdown"
                  :key="row.key"
                  class="grid grid-cols-[72px_1fr_40px] items-center gap-2 text-xs"
                >
                  <span class="text-muted-foreground truncate">{{ row.label }}</span>
                  <Progress
                    :percent="row.percent"
                    :show-info="false"
                    :stroke-color="row.color"
                    size="small"
                  />
                  <span class="tabular-nums text-right">{{ row.value }}</span>
                </div>
              </div>
            </div>
          </Card>
        </Col>

        <!-- Usage trend -->
        <Col :xs="24" :lg="14" :xl="15">
          <Card class="overview-card h-full" title="近 7 日用量" size="small">
            <template #extra>
              <Button type="link" size="small" @click="router.push('/usage')">
                详细用量
              </Button>
            </template>
            <BaseChart :option="usageTrendOption" height="320px" />
            <div
              class="text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs"
            >
              <span>
                今日 prompt
                <b class="text-foreground">{{ fmtTokens(usage.today_prompt_tokens) }}</b>
              </span>
              <span>
                completion
                <b class="text-foreground">{{
                  fmtTokens(usage.today_completion_tokens)
                }}</b>
              </span>
              <span>
                失败
                <b class="text-foreground">{{ fmtNum(usage.today_fail) }}</b>
              </span>
            </div>
          </Card>
        </Col>

        <!-- Services -->
        <Col :span="24">
          <Card class="overview-card" title="服务与组件" size="small">
            <template #extra>
              <Space wrap>
                <Button type="link" size="small" @click="router.push('/ops')">
                  <HeartOutlined /> 任务与健康
                </Button>
                <Button type="link" size="small" @click="router.push('/accounts/register')">
                  <UserAddOutlined /> 协议注册
                </Button>
                <Button type="link" size="small" @click="router.push('/keys')">
                  <KeyOutlined /> Keys
                </Button>
                <Button type="link" size="small" @click="router.push('/settings')">
                  <SettingOutlined /> 设置
                </Button>
              </Space>
            </template>
            <div
              class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
            >
              <div
                v-for="item in serviceItems"
                :key="item.key"
                class="border-border bg-card/40 hover:border-primary/30 cursor-pointer rounded-lg border p-3 transition-colors"
                @click="
                  router.push(
                    item.key === 'registration' || item.key === 'replenish'
                      ? '/accounts/register'
                      : item.key === 'credentials'
                        ? '/settings'
                        : '/ops',
                  )
                "
              >
                <div class="mb-1 flex items-center justify-between gap-2">
                  <span class="text-sm font-medium">{{ item.title }}</span>
                  <Tag :color="statusColorMap[item.status]" class="m-0">
                    {{ item.statusText }}
                  </Tag>
                </div>
                <Tooltip :title="item.desc">
                  <p class="text-muted-foreground m-0 truncate text-xs">
                    {{ item.desc }}
                  </p>
                </Tooltip>
              </div>
            </div>
          </Card>
        </Col>

        <!-- Endpoint meta -->
        <Col :span="24">
          <Card size="small" class="overview-card" title="接入信息">
            <div
              class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4 text-sm"
            >
              <div>
                <div class="text-muted-foreground mb-1 text-xs">API Base</div>
                <code class="bg-muted break-all rounded px-1.5 py-0.5 text-xs">
                  {{ merged.api_base || '—' }}
                </code>
              </div>
              <div>
                <div class="text-muted-foreground mb-1 text-xs">上游</div>
                <code class="bg-muted break-all rounded px-1.5 py-0.5 text-xs">
                  {{ merged.upstream || '—' }}
                </code>
              </div>
              <div>
                <div class="text-muted-foreground mb-1 text-xs">版本</div>
                <span class="tabular-nums">
                  v{{ merged.version || '—' }}
                  <span class="text-muted-foreground">
                    · CLI {{ merged.cli_version || '—' }}
                  </span>
                </span>
              </div>
              <div>
                <div class="text-muted-foreground mb-1 text-xs">池数据源</div>
                <span>{{ pool.source || merged.store?.backend || '—' }}</span>
              </div>
            </div>
          </Card>
        </Col>
      </Row>
    </Spin>
  </Page>
</template>

<style scoped>
.overview-card {
  border-radius: 12px;
}
.overview-card :deep(.ant-card-head) {
  min-height: 44px;
  border-bottom-color: hsl(var(--border) / 0.6);
}
.overview-card :deep(.ant-card-body) {
  padding-top: 12px;
}
</style>
