<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Card,
  Button,
  Space,
  TypographyTitle,
  TypographyParagraph,
  TypographyText,
  message as staticMessage,
} from 'antdv-next'
import { useUserStore } from '@/stores/user'
import { getToken } from '@/utils/request'
import { normalizeAppPath } from '@/utils/path'

const toast = staticMessage
const user = useUserStore()
const router = useRouter()
const route = useRoute()
const loading = ref(false)
const setupMode = ref(false)
const form = reactive({ password: '', confirm: '' })
const errorText = ref('')

onMounted(async () => {
  if (getToken()) {
    try {
      await user.fetchSession()
      await router.replace(normalizeAppPath(route.query.next))
      return
    } catch {
      /* stay on login */
    }
  }
  try {
    const st = await user.fetchStatus()
    setupMode.value = !!st?.setup_needed
  } catch {
    setupMode.value = false
  }
})

async function submit(ev?: Event) {
  if (ev) {
    ev.preventDefault()
    ev.stopPropagation()
  }
  errorText.value = ''
  const password = String(form.password || '').trim()
  const confirm = String(form.confirm || '').trim()

  if (!password || password.length < 4) {
    errorText.value = '密码至少 4 位'
    toast.warning(errorText.value)
    return
  }
  if (setupMode.value && password !== confirm) {
    errorText.value = '两次密码不一致'
    toast.warning(errorText.value)
    return
  }

  loading.value = true
  try {
    if (setupMode.value) {
      await user.setup(password)
      toast.success('管理员密码已创建')
    } else {
      await user.login(password)
      toast.success('登录成功')
    }
    await router.replace(normalizeAppPath(route.query.next))
  } catch (e: any) {
    errorText.value = e?.message || '登录失败'
    toast.error(errorText.value)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <Card class="login-card" :bordered="false">
      <Space direction="vertical" size="middle" style="width: 100%">
        <div>
          <TypographyTitle :level="3" style="margin: 0">grokcli-2api</TypographyTitle>
          <TypographyParagraph type="secondary" style="margin: 8px 0 0">
            {{ setupMode ? '首次使用：设置管理员密码' : '管理台登录' }}
          </TypographyParagraph>
        </div>

        <form class="login-form" @submit="submit">
          <label class="field">
            <span class="field-label">管理员密码</span>
            <input
              v-model="form.password"
              class="field-input"
              type="password"
              name="password"
              autocomplete="current-password"
              placeholder="请输入密码"
              :disabled="loading"
            />
          </label>

          <label v-if="setupMode" class="field">
            <span class="field-label">确认密码</span>
            <input
              v-model="form.confirm"
              class="field-input"
              type="password"
              name="confirm"
              autocomplete="new-password"
              placeholder="再次输入密码"
              :disabled="loading"
            />
          </label>

          <p v-if="errorText" class="field-error">{{ errorText }}</p>

          <Button
            type="primary"
            html-type="submit"
            size="large"
            block
            :loading="loading"
            @click="submit"
          >
            {{ setupMode ? '创建并进入' : '登录' }}
          </Button>
        </form>

        <TypographyText type="secondary" style="font-size: 12px">
          会话通过 X-Admin-Token / Cookie 维持。默认请勿将管理口暴露到公网。
        </TypographyText>
      </Space>
    </Card>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background:
    radial-gradient(circle at 20% 20%, rgba(22, 119, 255, 0.12), transparent 40%),
    radial-gradient(circle at 80% 70%, rgba(22, 119, 255, 0.08), transparent 40%);
}

.login-card {
  width: 100%;
  max-width: 420px;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 100%;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 13px;
  color: rgba(0, 0, 0, 0.65);
}

:global(html.dark) .field-label {
  color: rgba(255, 255, 255, 0.65);
}

.field-input {
  width: 100%;
  box-sizing: border-box;
  height: 40px;
  padding: 4px 11px;
  border: 1px solid #d9d9d9;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  background: #fff;
  color: inherit;
}

.field-input:focus {
  border-color: #1677ff;
  box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.15);
}

:global(html.dark) .field-input {
  background: #141414;
  border-color: #424242;
  color: #fff;
}

.field-error {
  margin: 0;
  color: #ff4d4f;
  font-size: 13px;
}
</style>
