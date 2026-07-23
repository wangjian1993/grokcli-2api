import type { UserInfo } from '@/types';

import { ref } from 'vue';
import { useRouter } from 'vue-router';

import { LOGIN_PATH } from '@/constants';
import { preferences } from '@/core/preferences';
import { defineStore } from 'pinia';

import { useAccessStore, useUserStore } from './modules';
import { resetAllStores } from './setup';
import {
  clearToken as clearG2aToken,
  setToken as setG2aToken,
  getToken as getG2aToken,
  api as g2aApi,
} from '@/utils/g2a/request';
import { projectAvatarUrl } from '@/utils/project-logo';

export const useAuthStore = defineStore('auth', () => {
  const accessStore = useAccessStore();
  const userStore = useUserStore();
  const router = useRouter();

  const loginLoading = ref(false);

  function applyToken(token: string) {
    accessStore.setAccessToken(token);
    setG2aToken(token);
  }

  /**
   * 管理员密码登录 / 首次 setup
   */
  async function authLogin(
    params: { password: string; setup?: boolean },
    onSuccess?: () => Promise<void> | void,
  ) {
    let userInfo: null | UserInfo = null;
    try {
      loginLoading.value = true;
      const path = params.setup ? '/setup' : '/login';
      const res = await g2aApi<{ token?: string }>(path, {
        method: 'POST',
        body: JSON.stringify({ password: params.password }),
      });
      const token = res?.token || '';
      if (!token) {
        throw new Error('登录成功但未返回 token');
      }
      applyToken(token);
      userInfo = await fetchUserInfo();
      userStore.setUserInfo(userInfo);
      accessStore.setAccessCodes(userInfo.permissions);

      if (accessStore.loginExpired) {
        accessStore.setLoginExpired(false);
      } else {
        onSuccess
          ? await onSuccess?.()
          : await router.push(preferences.app.defaultHomePath);
      }

      window.message?.success?.(params.setup ? '管理员密码已创建' : '登录成功');
    } catch (e) {
      // 登录失败时清掉半截 token，避免守卫以为已登录
      clearG2aToken();
      accessStore.setAccessToken(null);
      throw e;
    } finally {
      loginLoading.value = false;
    }

    return { userInfo };
  }

  async function logout(redirect: boolean = true) {
    try {
      await g2aApi('/logout', { method: 'POST', body: '{}' });
    } catch {
      /* ignore — token 可能已失效，仍继续清本地会话 */
    }
    clearG2aToken();
    accessStore.setAccessToken(null);
    accessStore.setLoginExpired(false);
    resetAllStores();
    // 无 token 时守卫会拦业务页；主动 replace 保证接口 401 后立刻到登录页
    const onLogin =
      router.currentRoute.value.path === LOGIN_PATH ||
      router.currentRoute.value.path.startsWith('/auth/');
    if (!onLogin) {
      await router.replace({
        path: LOGIN_PATH,
        query: redirect
          ? {
              redirect: encodeURIComponent(router.currentRoute.value.fullPath),
            }
          : {},
      });
    }
  }

  async function fetchUserInfo() {
    // 同步可能已有的 g2a token → accessStore
    const existing = getG2aToken() || accessStore.accessToken;
    if (existing) {
      applyToken(existing);
    }

    let status: any = null;
    try {
      status = await g2aApi('/status');
    } catch (e: any) {
      if (e?.status === 401) {
        throw e;
      }
      status = null;
    }

    if (status?.setup_needed) {
      clearG2aToken();
      accessStore.setAccessToken(null);
      throw new Error('需要先完成初始化设置');
    }

    const email = status?.credentials_email || status?.admin_email || '';
    const rawVersion = String(status?.version || '').replace(/^v/i, '').trim();
    const version = rawVersion ? `v${rawVersion}` : '';
    const avatar =
      preferences.app.defaultAvatar || projectAvatarUrl();
    const userInfo: UserInfo = {
      avatar,
      avatarUrl: avatar,
      permissions: ['*'],
      realName: email || '管理员',
      roles: ['admin'],
      userId: 'admin',
      username: email || 'admin',
      email: email || '',
      homePath: preferences.app.defaultHomePath,
      desc: version,
      version,
      runtime: status?.runtime || status?.implementation || 'go',
      cliVersion: status?.cli_version || '',
    };
    userStore.setUserInfo(userInfo);
    return userInfo;
  }

  function $reset() {
    loginLoading.value = false;
  }

  return {
    $reset,
    authLogin,
    fetchUserInfo,
    loginLoading,
    logout,
  };
});
