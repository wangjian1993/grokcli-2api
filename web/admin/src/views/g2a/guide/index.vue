<script setup lang="ts">
import { Page } from '@/components'
import { onMounted, ref } from 'vue'
import { Card, Typography } from 'antdv-next'
import { getStatus } from '@/api/g2a'

const { Title, Paragraph, Text } = Typography
const base = ref('<your-host>/v1')
const origin = ref('<your-host>')
const model = ref('grok-4.5')

onMounted(async () => {
  const pageOrigin = location.origin
  try {
    const st = await getStatus()
    let b = st.api_base || ''
    if (pageOrigin && (!b || /127\.0\.0\.1|localhost/i.test(b))) {
      b = pageOrigin.replace(/\/$/, '') + '/v1'
    }
    base.value = b || pageOrigin + '/v1'
    origin.value = base.value.replace(/\/v1\/?$/, '') || pageOrigin
    model.value = st.default_model || 'grok-4.5'
  } catch {
    base.value = pageOrigin + '/v1'
    origin.value = pageOrigin
  }
})
</script>

<template>
  <Page auto-content-height>
  <Card class="page-card" title="接入说明">
    <Paragraph>
      API Base：
      <Text code copyable>{{ base }}</Text>
      · 默认模型：
      <Text code>{{ model }}</Text>
    </Paragraph>
    <Title :level="5">OpenAI 兼容 · curl</Title>
    <pre class="guide-pre mono">curl {{ base }}/chat/completions \
  -H "Authorization: Bearer sk-g2a-YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"{{ model }}","messages":[{"role":"user","content":"你好"}],"stream":false}'</pre>

    <Title :level="5">Python · openai SDK</Title>
    <pre class="guide-pre mono">from openai import OpenAI
client = OpenAI(base_url="{{ base }}", api_key="sk-g2a-YOUR_KEY")
r = client.chat.completions.create(
    model="{{ model }}",
    messages=[{"role": "user", "content": "Hello"}],
)
print(r.choices[0].message.content)</pre>

    <Title :level="5">Anthropic Messages</Title>
    <pre class="guide-pre mono">curl {{ origin }}/v1/messages \
  -H "x-api-key: sk-g2a-YOUR_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{"model":"{{ model }}","max_tokens":1024,"messages":[{"role":"user","content":"你好"}]}'

from anthropic import Anthropic
client = Anthropic(base_url="{{ origin }}", api_key="sk-g2a-YOUR_KEY")
msg = client.messages.create(
    model="{{ model }}",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello"}],
)
print(msg.content[0].text)</pre>

    <Paragraph type="secondary">
      Claude Code / 其他工具：API Base = {{ origin }} 或 {{ origin }}/v1。模型名可用 claude-*
      别名，会映射到默认 Grok 模型。
    </Paragraph>
  </Card>
  </Page>
</template>
