<script lang="ts" setup>
import type { CSSProperties } from 'vue';

import { computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';

import { preferences, usePreferences } from '@/core/preferences';
import { useWatermark } from '@/hooks';
import { $t } from '@/locales';
import { resetRoutes } from '@/router';
import { useAuthStore, useUserStore } from '@/stores';
import { getStatus } from '@/api/g2a';
import { useVersionUpdate } from '@/utils/check-update';
import { projectAvatarUrl } from '@/utils/project-logo';
import { UserOutlined } from '@antdv-next/icons';
import { Badge, Tag, Tooltip, Watermark } from 'antdv-next';

import { BasicLayout } from './basic';
import { useNotification } from './hooks/notification';
import { LockScreen, Notification, UserDropdown } from './widgets';

const userStore = useUserStore();
const authStore = useAuthStore();
const router = useRouter();
const { destroyWatermark, updateWatermark, watermark } = useWatermark();
const { isDark } = usePreferences();

const watermarkStyle: CSSProperties = {
  height: '100vh',
  inset: 0,
  pointerEvents: 'none',
  position: 'fixed',
  width: '100vw',
  zIndex: 999,
};

const menus = computed(() => {
  return [
    {
      handler: () => {
        router.push('/profile');
      },
      icon: UserOutlined,
      text: $t('ui.widgets.profile'),
    },
  ];
});

/** 默认头像：透明底 avatar.png（与左上角不透明 logo 区分） */
const defaultUserAvatar = projectAvatarUrl();

const avatar = computed(() => {
  const info = userStore.userInfo;
  const url = info?.avatarUrl || info?.avatar;
  // 无用户自定义头像时用透明头像；并过滤模板默认图 / 品牌 logo 误用
  if (
    url &&
    !String(url).includes('antdv-next-logo') &&
    !String(url).includes('logo-v1.webp') &&
    !String(url).includes('plus-vben') &&
    // 若缓存里误存了品牌 logo.png，改回透明头像
    !(String(url).includes('logo.png') && !String(url).includes('avatar.png'))
  ) {
    return url;
  }
  return preferences.app.defaultAvatar || defaultUserAvatar;
});

async function handleLogout() {
  /**
   * 主动登出不需要带跳转地址
   */
  await authStore.logout(false);
  resetRoutes();
}

const {
  notifyStore,
  notificationTabList,
  currentTab,
  handleViewAll,
  handleNotificationClick,
  isPreviewOpen,
  NoticePreviewModal,
} = useNotification();

watch(
  () => ({
    enable: preferences.app.watermark,
    content: preferences.app.watermarkContent,
    isDark: isDark.value,
  }),
  async ({ enable, content }) => {
    if (enable) {
      await updateWatermark({
        content:
          content ||
          `${userStore.userInfo?.username} - ${userStore.userInfo?.realName}`,
      });
    } else {
      destroyWatermark();
    }
  },
  {
    immediate: true,
  },
);
/** 服务端版本，登录后由 /status 写入 userInfo */
const appVersion = computed(() => {
  const info = userStore.userInfo as any;
  const v = info?.version || info?.desc || '';
  if (!v) return '';
  return String(v).startsWith('v') ? String(v) : `v${v}`;
});

const versionTitle = computed(() => {
  const info = userStore.userInfo as any;
  const parts = [appVersion.value || '版本未知'];
  if (info?.runtime) parts.push(`runtime ${info.runtime}`);
  if (info?.cliVersion) parts.push(`CLI ${info.cliVersion}`);
  return parts.join(' · ');
});

// 检测版本更新
useVersionUpdate();

/** 布局挂载时拉取服务端版本（/status） */
onMounted(async () => {
  try {
    const st: any = await getStatus();
    const raw = String(st?.version || '').replace(/^v/i, '').trim();
    if (!raw) return;
    const version = `v${raw}`;
    const brand = preferences.app.defaultAvatar || defaultUserAvatar;
    const prev = (userStore.userInfo || {
      avatar: brand,
      avatarUrl: brand,
      permissions: ['*'],
      realName: '管理员',
      roles: ['admin'],
      userId: 'admin',
      username: 'admin',
      email: '',
    }) as any;
    const prevUrl = String(prev.avatarUrl || prev.avatar || '');
    const avatarUrl =
      prevUrl &&
      !prevUrl.includes('antdv-next-logo') &&
      !prevUrl.includes('logo-v1.webp') &&
      !(prevUrl.includes('logo.png') && !prevUrl.includes('avatar.png'))
        ? prevUrl
        : brand;
    userStore.setUserInfo({
      ...prev,
      avatar: avatarUrl,
      avatarUrl,
      desc: version,
      version,
      runtime: st?.runtime || st?.implementation || prev.runtime || 'go',
      cliVersion: st?.cli_version || prev.cliVersion || '',
    });
  } catch {
    /* ignore */
  }
});
</script>

<template>
  <BasicLayout @clear-preferences-and-logout="handleLogout">
<!-- 顶栏右侧版本徽章 -->
    <template #header-right-0>
      <Tooltip :title="versionTitle">
        <Tag class="g2a-header-ver" color="processing">
          {{ appVersion || '—' }}
        </Tag>
      </Tooltip>
    </template>

    <template #user-dropdown>
      <UserDropdown
        :avatar
        :menus
        :text="userStore.userInfo?.realName"
        :description="userStore.userInfo?.email || '未设置邮箱'"
        :tag-text="appVersion || userStore.userInfo?.username"
        @logout="handleLogout"
        @clear-preferences-and-logout="handleLogout"
      />
    </template>
    <template #notification>
      <Badge
        :count="notifyStore.unreadNotifications.length"
        :offset="[-5, 6]"
        size="small"
      >
        <Notification
          :dot="false"
          :keep-open="isPreviewOpen"
          :notifications="notifyStore.notificationList"
          :tab-list="notificationTabList"
          v-model:current-tab="currentTab"
          @click="handleNotificationClick"
          @clear="notifyStore.clearAllMessage"
          @make-all="notifyStore.setAllRead"
          @read="notifyStore.setRead"
          @view-all="handleViewAll"
          @remove="notifyStore.removeMessage"
        />
      </Badge>

      <NoticePreviewModal />
    </template>
    <template #lock-screen>
      <LockScreen :avatar @to-login="handleLogout" />
    </template>
  </BasicLayout>
  <Watermark
    v-if="watermark.visible"
    v-bind="watermark.props"
    :style="watermarkStyle"
  />
</template>

<style scoped>
.g2a-header-ver {
  margin: 0 8px 0 0 !important;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 20px;
  cursor: default;
  user-select: none;
}
</style>
