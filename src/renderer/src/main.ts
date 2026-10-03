import { createApp } from 'vue'
import { createPinia } from 'pinia'
import naive from 'naive-ui'
import App from './App.vue'
import { router } from './router'
import './styles.css'

// 渲染进程全局异常上报到主进程日志
function reportError(msg: string): void {
  try {
    window.api?.reportError(msg)
  } catch {
    console.error(msg)
  }
}
window.addEventListener('error', (e) => reportError(`Error: ${e.message}\n${e.error?.stack ?? ''}`))
window.addEventListener('unhandledrejection', (e) =>
  reportError(`UnhandledRejection: ${String(e.reason)}\n${e.reason?.stack ?? ''}`)
)

createApp(App).use(createPinia()).use(router).use(naive).mount('#app')
