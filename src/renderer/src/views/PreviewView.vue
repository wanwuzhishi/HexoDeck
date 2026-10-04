<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'
import { NButton, NCheckbox, NSpace, NTag } from 'naive-ui'
import { useWorkspaceStore } from '../stores/workspace'
import { message } from '../composables/message'

const ws = useWorkspaceStore()
const frame = ref<HTMLIFrameElement | null>(null)

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

// 站点文件变更后自动重载 iframe，边写边看
watch(
  () => ws.previewRefreshTick,
  async () => {
    await nextTick()
    reloadFrame()
  }
)

// 「包含草稿」切换后，运行中的预览需要重启才生效
watch(
  () => ws.previewIncludeDrafts,
  async () => {
    if (ws.previewUrl) {
      await ws.startPreview()
      message.success('已按新的草稿设置重启预览')
    }
  }
)

onMounted(() => {
  if (ws.previewUrl) reloadFrame()
})
</script>

<template>
  <div class="page preview-page">
    <section class="glass panel">
      <div class="panel-head-row">
        <div class="panel-title">本地预览</div>
        <n-space align="center" :size="10">
          <n-tag :type="ws.previewUrl ? 'success' : 'default'" :bordered="false" round size="small">
            {{ ws.previewUrl ? '运行中' : '未启动' }}
          </n-tag>
          <n-checkbox v-model:checked="ws.previewIncludeDrafts" size="small">包含草稿</n-checkbox>
          <n-button
            secondary
            :loading="ws.previewStarting"
            :disabled="!!ws.previewUrl"
            @click="start"
          >
            启动预览
          </n-button>
          <n-button secondary :disabled="!ws.previewUrl" @click="ws.stopPreview()">停止</n-button>
          <n-button secondary :disabled="!ws.previewUrl" @click="openBrowser">浏览器打开</n-button>
          <n-button secondary :disabled="!ws.previewUrl" @click="reloadFrame">刷新</n-button>
        </n-space>
      </div>

      <div v-if="ws.previewUrl" class="url-bar">
        <span class="url mono">{{ ws.previewUrl }}</span>
        <span class="muted small">站点文件变更后会自动刷新</span>
      </div>

      <div v-if="ws.previewUrl" class="frame-wrap">
        <iframe ref="frame" :src="ws.previewUrl" class="preview-frame"></iframe>
      </div>
      <div v-else class="frame-empty">
        <div class="empty-icon">◉</div>
        <div class="empty-title">预览未启动</div>
        <div class="muted small">
          启动后这里会显示主题渲染后的真实博客页面；写作时改动会自动刷新，可边写边看效果。
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.preview-page {
  display: flex;
  flex-direction: column;
  gap: 14px;
  /* 预览页整屏铺满，iframe 占满剩余高度 */
  flex: 1;
  min-height: 0;
}

.preview-page > .panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
}

.panel-head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.url-bar {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-top: 10px;
}

.url {
  color: var(--accent);
  font-size: 12px;
  word-break: break-all;
}

.frame-wrap {
  flex: 1;
  min-height: 320px;
  margin-top: 10px;
}

.preview-frame {
  width: 100%;
  height: 100%;
  border: 1px solid var(--glass-border);
  border-radius: var(--radius);
  background: var(--glass-strong);
  box-shadow: var(--glass-glow);
}

.frame-empty {
  flex: 1;
  min-height: 320px;
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  text-align: center;
  border: 1px dashed var(--glass-border);
  border-radius: var(--radius);
  background: var(--accent-soft);
}

.empty-icon {
  font-size: 30px;
  color: var(--accent);
  line-height: 1;
}

.empty-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-1);
}

.mono {
  font-family: var(--mono);
}
</style>
