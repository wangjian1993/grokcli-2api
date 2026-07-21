<script lang="ts" setup>
import { onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { preferences } from '@/core/preferences';
import { useAuthStore } from '@/stores';
import { getToken, api as g2aApi } from '@/utils/g2a/request';
import {
  Alert,
  Button,
  Card,
  Form,
  FormItem,
  InputPassword,
  Space,
  TypographyParagraph,
  TypographyTitle,
} from 'antdv-next';

defineOptions({ name: 'Login' });

const authStore = useAuthStore();
const router = useRouter();
const route = useRoute();

const loading = ref(false);
const setupMode = ref(false);
const errorText = ref('');
const form = reactive({
  password: '',
  confirm: '',
});

function redirectTarget() {
  const raw = (route.query.redirect as string) || preferences.app.defaultHomePath;
  try {
    return decodeURIComponent(raw);
  } catch {
    return preferences.app.defaultHomePath;
  }
}

onMounted(async () => {
  if (getToken()) {
    try {
      await authStore.fetchUserInfo();
      await router.replace(redirectTarget());
      return;
    } catch {
      /* stay on login */
    }
  }
  try {
    const st = await g2aApi<any>('/status');
    setupMode.value = !!st?.setup_needed;
  } catch {
    setupMode.value = false;
  }
});

async function handleSubmit() {
  errorText.value = '';
  const password = String(form.password || '').trim();
  const confirm = String(form.confirm || '').trim();

  if (!password || password.length < 4) {
    errorText.value = '密码至少 4 位';
    window.message?.warning?.(errorText.value);
    return;
  }
  if (setupMode.value && password !== confirm) {
    errorText.value = '两次密码不一致';
    window.message?.warning?.(errorText.value);
    return;
  }

  loading.value = true;
  try {
    await authStore.authLogin(
      { password, setup: setupMode.value },
      async () => {
        await router.replace(redirectTarget());
      },
    );
  } catch (e: any) {
    errorText.value = e?.message || '登录失败';
    window.message?.error?.(errorText.value);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="flex min-h-full w-full items-center justify-center p-6">
    <Card class="w-full max-w-[420px] shadow-sm" :bordered="false">
      <Space direction="vertical" size="middle" style="width: 100%">
        <div>
          <TypographyTitle :level="3" style="margin: 0">
            grokcli-2api
          </TypographyTitle>
          <TypographyParagraph type="secondary" style="margin: 8px 0 0">
            {{ setupMode ? '首次使用：设置管理员密码' : '管理台登录' }}
          </TypographyParagraph>
        </div>

        <Alert
          v-if="errorText"
          type="error"
          show-icon
          :message="errorText"
          class="mb-2"
        />

        <Form layout="vertical" @finish="handleSubmit">
          <FormItem label="管理员密码" name="password" required>
            <InputPassword
              v-model:value="form.password"
              placeholder="请输入密码"
              autocomplete="current-password"
              :disabled="loading || authStore.loginLoading"
              size="large"
            />
          </FormItem>
          <FormItem v-if="setupMode" label="确认密码" name="confirm" required>
            <InputPassword
              v-model:value="form.confirm"
              placeholder="再次输入密码"
              autocomplete="new-password"
              :disabled="loading || authStore.loginLoading"
              size="large"
            />
          </FormItem>
          <Button
            type="primary"
            html-type="submit"
            block
            size="large"
            :loading="loading || authStore.loginLoading"
          >
            {{ setupMode ? '创建并进入' : '登录' }}
          </Button>
        </Form>
      </Space>
    </Card>
  </div>
</template>
