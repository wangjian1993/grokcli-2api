import { initPreferences } from '@/core/preferences';
import { unmountGlobalLoading } from '@/utils';

import { overridesPreferences } from './preferences';

/**
 * 应用初始化完成之后再进行页面加载渲染
 */
async function initApplication() {
  // name用于指定项目唯一标识
  // 用于区分不同项目的偏好设置以及存储数据的key前缀以及其他一些需要隔离的数据
  const env = import.meta.env.PROD ? 'prod' : 'dev';
  const appVersion = import.meta.env.VITE_APP_VERSION;
  const namespace = `${import.meta.env.VITE_APP_NAMESPACE}-${appVersion}-${env}`;

  // app偏好设置初始化
  await initPreferences({
    namespace,
    overrides: overridesPreferences,
  });

  // 强制品牌 logo（不透明）+ 默认头像（透明），避免旧 localStorage 串用
  const { updatePreferences } = await import('@/core/preferences');
  updatePreferences({
    logo: {
      enable: true,
      source: overridesPreferences.logo?.source || '',
      fit: overridesPreferences.logo?.fit || 'contain',
    },
    app: {
      defaultAvatar: overridesPreferences.app?.defaultAvatar || '',
    },
  });

  // 启动应用并挂载
  // vue应用主要逻辑及视图
  const { bootstrap } = await import('./bootstrap');
  await bootstrap(namespace);

  // 移除并销毁loading
  unmountGlobalLoading();
}

initApplication();
