import { defineOverridesPreferences } from '@/core/preferences';

import { projectAvatarUrl, projectLogoUrl } from '@/utils/project-logo';

/**
 * grokcli-2api 管理台偏好覆盖
 * 更改配置后请清空 localStorage
 */
// 左上角：不透明品牌图
const brandLogo = projectLogoUrl();
// 右上角：透明底头像
const brandAvatar = projectAvatarUrl();

export const overridesPreferences = defineOverridesPreferences({
  app: {
    name: import.meta.env.VITE_APP_TITLE,
    defaultHomePath: '/overview',
    enableCheckUpdates: false,
    enablePreferences: true,
    locale: 'zh-CN',
    layout: 'sidebar-nav',
    // 右上角个人中心：透明底 avatar.png
    defaultAvatar: brandAvatar,
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
    // 左上角品牌：不透明 logo.png
    source: brandLogo,
    fit: 'contain',
  },
  widget: {
    languageToggle: false,
    notification: false,
    lockScreen: false,
  },
});
