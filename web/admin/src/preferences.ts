import { defineOverridesPreferences } from '@/core/preferences';

/**
 * grokcli-2api 管理台偏好覆盖
 * 更改配置后请清空 localStorage
 */
export const overridesPreferences = defineOverridesPreferences({
  app: {
    name: import.meta.env.VITE_APP_TITLE,
    defaultHomePath: '/overview',
    enableCheckUpdates: false,
    enablePreferences: true,
    locale: 'zh-CN',
    layout: 'sidebar-nav',
  },
  tabbar: {
    persist: false,
  },
  theme: {
    mode: 'light',
    semiDarkSidebar: false,
    borderRadius: 8,
    colorPrimary: '#1677ff',
  },
  logo: {
    enable: true,
    // 使用 public/logo.png；拼上 VITE_BASE 以便 /admin 同域静态路径正确
    source: `${import.meta.env.VITE_BASE || '/'}logo.png`.replace(/\/+/g, '/').replace(':/', '://'),
    fit: 'contain',
  },
  widget: {
    languageToggle: false,
    notification: false,
    lockScreen: false,
  },
});
