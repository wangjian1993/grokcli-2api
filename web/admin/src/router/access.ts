import type {
  ComponentRecordType,
  GenerateMenuAndRoutesOptions,
} from '@/types';

import { generateAccessible } from '@/components/access';
import { BasicLayout, IFrameView } from '@/layouts';

const forbiddenComponent = () => import('@/views/_core/fallback/forbidden.vue');
const NotFoundComponent = () => import('@/views/_core/fallback/not-found.vue');

/**
 * 前端静态菜单/路由（grokcli-2api）。
 * 不请求 RuoYi /getRouters，仅使用 router/routes/modules 下的静态路由。
 */
async function generateAccess(options: GenerateMenuAndRoutesOptions) {
  const pageMap: ComponentRecordType = import.meta.glob('../views/**/*.vue');

  const layoutMap: ComponentRecordType = {
    BasicLayout,
    IFrameView,
    NotFoundComponent,
  };

  return await generateAccessible({
    ...options,
    // 不拉后端菜单：generateRoutesByBackend 会得到空数组，仅用 frontend 静态路由
    fetchMenuListAsync: async () => [],
    forbiddenComponent,
    layoutMap,
    pageMap,
  });
}

export { generateAccess };
