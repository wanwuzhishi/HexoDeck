<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NTag } from 'naive-ui'
import { useWorkspaceStore } from '../stores/workspace'
import { confirmDialog, message } from '../composables/message'

const ws = useWorkspaceStore()
const router = useRouter()
const logEl = ref<HTMLElement | null>(null)

/** 本文站点的发布目标（来自站点配置的 deploy 段），用于在页面上交代「发到哪」 */
const deployTarget = ref('')
const deployBranch = ref('')

async function loadDeployInfo(): Promise<void> {
  const r = await window.api.readSiteConfig()
  if (r.ok && r.data) {
    deployTarget.value = r.data.deploy.repo
    deployBranch.value = r.data.deploy.branch
  }
}

const hasTarget = computed(() => !!deployTarget.value)

async function run(command: 'generate' | 'clean' | 'deploy'): Promise<void> {
  const r = await ws.runBuild(command)
  if (r.ok) {
    const label = command === 'generate' ? '生成' : command === 'deploy' ? '部署' : '清理'
    message.success(`${label}完成（${(r.durationMs / 1000).toFixed(1)}s）`)
  } else {
    message.error(`${command} 失败：${r.error ?? '未知错误'}`)
  }
}

/** 部署是不可逆的对外动作，执行前确认一次 */
async function confirmDeploy(): Promise<void> {
  const ok = await confirmDialog({
    title: '部署上线',
    content: hasTarget.value
      ? `将先执行 hexo generate 生成最新静态页面，再推送到 ${deployTarget.value}${deployBranch.value ? `（${deployBranch.value} 分支）` : ''}，确定执行吗？`
      : '尚未配置部署仓库地址，请先到「设置 → 部署」填写。仍要尝试部署吗？',
    positiveText: '开始部署'
  })
  if (ok) await run('deploy')
}

function clearLogs(): void {
  ws.logs.splice(0, ws.logs.length)
}

// 日志自动滚到底
watch(
  () => ws.logs.length,
  async () => {
    await nextTick()
    if (logEl.value) logEl.value.scrollTop = logEl.value.scrollHeight
  }
)

watch(
  () => ws.previewRefreshTick,
  () => loadDeployInfo()
)

loadDeployInfo()
</script>

<template>
  <div class="page publish-page">
    <section class="glass panel">
      <div class="panel-head-row">
        <div class="panel-title">构建与部署</div>
        <n-tag v-if="hasTarget" size="small" round :bordered="false" type="info">
          目标：{{ deployTarget }}{{ deployBranch ? ` (${deployBranch})` : '' }}
        </n-tag>
        <n-tag v-else size="small" round :bordered="false" type="warning">未配置部署目标</n-tag>
      </div>

      <div class="action-grid">
        <button class="action-card" :disabled="!!ws.building" @click="run('generate')">
          <span class="action-icon">⚙</span>
          <span class="action-name">生成静态页面</span>
          <span class="muted small">把源码渲染成 public/ 下的 HTML</span>
        </button>

        <button class="action-card primary" :disabled="!!ws.building" @click="confirmDeploy">
          <span class="action-icon">↑</span>
          <span class="action-name">部署上线</span>
          <span class="muted small">先生成，再按配置推送到远端仓库</span>
        </button>

        <button class="action-card" :disabled="!!ws.building" @click="run('clean')">
          <span class="action-icon">⌫</span>
          <span class="action-name">清理缓存</span>
          <span class="muted small">删除 public/ 与缓存，下次全量生成</span>
        </button>
      </div>

      <div class="hint-row muted small">
        想先看看效果？
        <n-button text type="primary" size="tiny" @click="router.push('/preview')">前往本地预览 ›</n-button>
        <span v-if="!hasTarget">· 部署前请先在「设置 → 部署」配置仓库地址与分支</span>
      </div>
    </section>

    <section class="glass panel log-panel">
      <div class="panel-head-row">
        <div class="panel-title">运行日志</div>
        <n-button size="tiny" quaternary :disabled="!ws.logs.length" @click="clearLogs">
          清空
        </n-button>
      </div>
      <pre ref="logEl" class="log">{{ ws.logs.join('\n') || '暂无日志' }}</pre>
    </section>
  </div>
</template>

<style scoped>
.publish-page {
  display: flex;
  flex-direction: column;
  gap: 14px;
  flex: 1;
  min-height: 0;
}

.panel-head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

/* 三个操作做成整块卡片，点击区域大、主次分明 */
.action-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 10px;
  margin-bottom: 12px;
}

.action-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 14px 16px;
  text-align: left;
  cursor: pointer;
  font-family: inherit;
  border: 1px solid var(--glass-border);
  border-radius: var(--radius);
  background: var(--accent-soft);
  transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
}

.action-card:hover:not(:disabled) {
  border-color: var(--accent);
  box-shadow: var(--accent-glow);
  transform: translateY(-1px);
}

.action-card:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.action-card.primary {
  border-color: var(--accent);
  box-shadow: var(--accent-glow);
}

.action-icon {
  font-size: 20px;
  color: var(--accent);
  line-height: 1;
}

.action-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-1);
}

.hint-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.log-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 180px;
}

.log {
  margin: 10px 0 0;
  flex: 1;
  overflow: auto;
  font-family: var(--mono);
  font-size: 12.5px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--text-2);
  background: var(--accent-soft);
  border: 1px solid var(--glass-border);
  border-radius: 10px;
  padding: 10px 12px;
}
</style>
