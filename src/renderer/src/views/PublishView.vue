<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { NButton, NCard, NCheckbox, NPopconfirm, NSpace, NTag } from 'naive-ui'
import { useWorkspaceStore } from '../stores/workspace'
import { message } from '../composables/message'

const ws = useWorkspaceStore()
const frame = ref<HTMLIFrameElement | null>(null)
const logEl = ref<HTMLElement | null>(null)

async function start(): Promise<void> {
  const r = await ws.startPreview()
  if (!r.ok) message.error(r.error ?? '预览启动失败')
}

function openBrowser(): void {
  if (ws.previewUrl) window.open(ws.previewUrl)
}

function reloadFrame(): void {
  frame.value?.contentWindow?.location.reload()
}

async function run(command: 'generate' | 'clean' | 'deploy'): Promise<void> {
  const r = await ws.runBuild(command)
  if (r.ok) {
    message.success(
      `${command === 'generate' ? '生成' : command === 'deploy' ? '部署' : '清理'}完成（${(r.durationMs / 1000).toFixed(1)}s）`
    )
  } else {
    message.error(`${command} 失败：${r.error ?? '未知错误'}`)
  }
}

watch(
  () => ws.previewRefreshTick,
  async () => {
    await nextTick()
    reloadFrame()
  }
)

watch(
  () => ws.logs.length,
  async () => {
    await nextTick()
    if (logEl.value) logEl.value.scrollTop = logEl.value.scrollHeight
  }
)
</script>

<template>
  <div class="page publish-page">
    <n-card title="本地预览" :bordered="false">
      <n-space align="center" :size="10">
        <n-tag :type="ws.previewUrl ? 'success' : 'default'" :bordered="false">
          {{ ws.previewUrl ? '运行中' : '未启动' }}
        </n-tag>
        <span v-if="ws.previewUrl" class="url">{{ ws.previewUrl }}</span>
        <n-checkbox v-model:checked="ws.previewIncludeDrafts">包含草稿</n-checkbox>
        <n-button type="primary" :loading="ws.previewStarting" :disabled="!!ws.previewUrl" @click="start">
          启动预览
        </n-button>
        <n-button :disabled="!ws.previewUrl" @click="ws.stopPreview()">停止</n-button>
        <n-button :disabled="!ws.previewUrl" @click="openBrowser">浏览器打开</n-button>
        <n-button :disabled="!ws.previewUrl" @click="reloadFrame">刷新页面</n-button>
      </n-space>
      <div v-if="ws.previewUrl" class="frame-wrap">
        <iframe ref="frame" :src="ws.previewUrl" class="preview-frame"></iframe>
      </div>
      <div v-else class="frame-empty">启动预览后，这里将显示主题渲染后的真实博客页面</div>
    </n-card>

    <n-card title="构建与部署" :bordered="false">
      <n-space>
        <n-button
          type="primary"
          :loading="ws.building === 'generate'"
          :disabled="!!ws.building"
          @click="run('generate')"
        >
          生成静态页面
        </n-button>
        <n-popconfirm @positive-click="run('deploy')">
          <template #trigger>
            <n-button type="info" :loading="ws.building === 'deploy'" :disabled="!!ws.building">
              部署上线
            </n-button>
          </template>
          将按 _config.yml 的 deploy 配置发布到远端，确定执行吗？
        </n-popconfirm>
        <n-button :loading="ws.building === 'clean'" :disabled="!!ws.building" @click="run('clean')">
          清理缓存
        </n-button>
      </n-space>
    </n-card>

    <n-card title="运行日志" :bordered="false" class="log-card">
      <pre ref="logEl" class="log">{{ ws.logs.join('\n') || '暂无日志' }}</pre>
    </n-card>
  </div>
</template>

<style scoped>
.publish-page {
  padding: 18px 22px;
  height: 100vh;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.url {
  font-family: Consolas, monospace;
}
.frame-wrap {
  margin-top: 14px;
  height: 420px;
}
.preview-frame {
  width: 100%;
  height: 100%;
  border: 1px solid rgba(128, 128, 128, 0.3);
  border-radius: 6px;
  background: #fff;
}
.frame-empty {
  margin-top: 14px;
  height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed rgba(128, 128, 128, 0.35);
  border-radius: 6px;
  opacity: 0.6;
}
.log-card {
  flex: 1;
  min-height: 180px;
}
.log {
  margin: 0;
  height: 100%;
  max-height: 320px;
  overflow: auto;
  font-family: Consolas, 'Courier New', monospace;
  font-size: 12.5px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
