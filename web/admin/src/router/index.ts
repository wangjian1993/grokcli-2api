import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import { getToken } from '@/utils/request'
import { normalizeAppPath } from '@/utils/path'

export { normalizeAppPath }

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/pages/login/index.vue'),
    meta: { public: true, title: '登录' },
  },
  {
    path: '/',
    component: () => import('@/layouts/AdminLayout.vue'),
    redirect: '/overview',
    children: [
      {
        path: 'overview',
        name: 'overview',
        component: () => import('@/pages/overview/index.vue'),
        meta: { title: '总览', sub: '服务状态 · 账号池 · Token 续期' },
      },
      {
        path: 'keys',
        name: 'keys',
        component: () => import('@/pages/keys/index.vue'),
        meta: { title: 'API Keys', sub: '创建、复制、停用客户端访问密钥' },
      },
      {
        path: 'accounts',
        name: 'accounts',
        component: () => import('@/pages/accounts/index.vue'),
        meta: { title: '账号', sub: '池状态 · 测活 · 注册 · 导入导出' },
      },
      {
        path: 'usage',
        name: 'usage',
        component: () => import('@/pages/usage/index.vue'),
        meta: { title: '用量', sub: 'Token 消耗与请求使用情况' },
      },
      {
        path: 'logs',
        name: 'logs',
        component: () => import('@/pages/logs/index.vue'),
        meta: { title: '日志', sub: '管理任务与操作记录' },
      },
      {
        path: 'models',
        name: 'models',
        component: () => import('@/pages/models/index.vue'),
        meta: { title: '模型', sub: '上游模型目录与探测结果' },
      },
      {
        path: 'settings',
        name: 'settings',
        component: () => import('@/pages/settings/index.vue'),
        meta: { title: '设置', sub: '运行参数 · 代理 · 集成' },
      },
      {
        path: 'guide',
        name: 'guide',
        component: () => import('@/pages/guide/index.vue'),
        meta: { title: '指南', sub: '接入 OpenAI / Anthropic 兼容 API' },
      },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/overview' },
]

// Hash mode: /admin#/login, /admin#/overview, /admin#/keys, ...
export const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

router.beforeEach(async (to) => {
  const isPublic = !!to.meta.public
  const hasToken = !!getToken()
  if (!isPublic && !hasToken) {
    return { path: '/login', query: { next: to.fullPath } }
  }
  if (to.path === '/login' && hasToken) {
    return { path: normalizeAppPath(to.query.next) }
  }
  if (to.path === '/' && hasToken) {
    return { path: '/overview', replace: true }
  }
  const title = (to.meta.title as string) || '管理台'
  document.title = `${title} · grokcli-2api`
  return true
})
