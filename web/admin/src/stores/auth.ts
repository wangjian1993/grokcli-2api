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
    } finally {
      loginLoading.value = false;
    }

    return { userInfo };
  }

  async function logout(redirect: boolean = true) {
    try {
      await g2aApi('/logout', { method: 'POST', body: '{}' });
    } catch {
      /* ignore */
    } finally {
      clearG2aToken();
      resetAllStores();
      accessStore.setLoginExpired(false);
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
    const version = status?.version ? `v${status.version}` : '';
    const userInfo: UserInfo = {
      avatar: '',
      avatarUrl: '',
      permissions: ['*'],
      realName: email || '管理员',
      roles: ['admin'],
      userId: 'admin',
      username: email || 'admin',
      email: email || '',
      homePath: preferences.app.defaultHomePath,
      desc: version,
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
