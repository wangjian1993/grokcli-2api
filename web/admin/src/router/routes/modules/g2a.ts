import type { RouteRecordRaw } from 'vue-router';

/**
 * grokcli-2api 管理台业务路由（前端静态模式）
 * 全部一级菜单；路径保持不变。
 */
const routes: RouteRecordRaw[] = [
  {
    meta: {
      icon: 'lucide:layout-dashboard',
      order: -1,
      title: '总览',
      affixTab: true,
    },
    name: 'Overview',
    path: '/overview',
    component: () => import('@/views/g2a/overview/index.vue'),
  },
  {
    meta: {
      icon: 'lucide:users',
      order: 1,
      title: '账号池',
    },
    name: 'Accounts',
    path: '/accounts',
    component: () => import('@/views/g2a/accounts/index.vue'),
  },
  {
    meta: {
      icon: 'lucide:user-plus',
      order: 2,
      title: '协议注册',
    },
    name: 'AccountRegister',
    path: '/accounts/register',
    component: () => import('@/views/g2a/accounts/register/index.vue'),
  },
  {
    meta: {
      icon: 'lucide:key-round',
      order: 3,
      title: 'API Keys',
    },
    name: 'Keys',
    path: '/keys',
    component: () => import('@/views/g2a/keys/index.vue'),
  },
  {
    meta: {
      icon: 'lucide:bar-chart-3',
      order: 4,
      title: '用量',
    },
    name: 'Usage',
    path: '/usage',
    component: () => import('@/views/g2a/usage/index.vue'),
  },
  {
    meta: {
      icon: 'lucide:file-text',
      order: 5,
      title: '日志',
    },
    name: 'Logs',
    path: '/logs',
    component: () => import('@/views/g2a/logs/index.vue'),
  },
  {
    meta: {
      icon: 'lucide:boxes',
      order: 6,
      title: '模型',
    },
    name: 'Models',
    path: '/models',
    component: () => import('@/views/g2a/models/index.vue'),
  },
  {
    meta: {
      icon: 'lucide:heart-pulse',
      order: 7,
      title: '任务与健康',
    },
    name: 'Ops',
    path: '/ops',
    component: () => import('@/views/g2a/ops/index.vue'),
  },
  {
    meta: {
      icon: 'lucide:settings',
      order: 8,
      title: '设置',
    },
    name: 'Settings',
    path: '/settings',
    component: () => import('@/views/g2a/settings/index.vue'),
  },
  {
    meta: {
      icon: 'lucide:book-open',
      order: 9,
      title: '指南',
    },
    name: 'Guide',
    path: '/guide',
    component: () => import('@/views/g2a/guide/index.vue'),
  },
];

export default routes;
