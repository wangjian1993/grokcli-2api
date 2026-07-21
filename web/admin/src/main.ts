import { createApp } from 'vue'
import { createPinia } from 'pinia'
import Antd from 'antdv-next'
import 'antdv-next/dist/reset.css'
import 'antdv-next/dist/antd.css'
import App from './App.vue'
import { router } from './router'
import './assets/main.css'

function showBootError(err: unknown) {
  console.error('[admin]', err)
  const el = document.getElementById('app')
  if (el && !el.dataset.errorShown) {
    el.dataset.errorShown = '1'
    el.innerHTML =
      '<div style="padding:24px;font-family:sans-serif;color:#a00">' +
      '<h2>管理台加载失败</h2><pre style="white-space:pre-wrap">' +
      String((err as any)?.stack || err) +
      '</pre><p>请打开控制台查看详情，或强制刷新（Ctrl+Shift+R）后重试。</p></div>'
  }
}

const app = createApp(App)
app.config.errorHandler = (err, _instance, info) => {
  console.error('[admin]', info, err)
  showBootError(err)
}
window.addEventListener('unhandledrejection', (ev) => {
  showBootError(ev.reason)
})

app.use(createPinia())
app.use(router)
app.use(Antd)
app.mount('#app')
