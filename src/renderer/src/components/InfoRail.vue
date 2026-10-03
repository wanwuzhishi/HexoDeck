<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NModal } from 'naive-ui'
import { useSiteStore } from '../stores/site'
import { usePostsStore } from '../stores/posts'
import { useWorkspaceStore } from '../stores/workspace'
import { confirmDialog, message } from '../composables/message'

const site = useSiteStore()
const posts = usePostsStore()
const ws = useWorkspaceStore()
const router = useRouter()

const postCount = computed(() => posts.posts.filter((p) => p.kind === 'post').length)
const draftCount = computed(() => posts.posts.filter((p) => p.kind === 'draft').length)
const totalWords = computed(() => posts.posts.reduce((s, p) => s + p.wordCount, 0))
const recent = computed(() => posts.posts.slice(0, 5))

// ---------- 站点切换弹窗 ----------
const showSwitch = ref(false)
const switching = ref('')

/** 「切换站点」只切换已添加的站点，不再走目录选择对话框 */
async function openSwitch(): Promise<void> {
  await site.loadRecents()
  showSwitch.value = true
}

async function switchTo(path: string): Promise<void> {
  // 点当前站点（或切换进行中）不重复打开
  if (path === site.site?.path || switching.value) return
  switching.value = path
  try {
    const r = await site.open(path)
    if (r.ok) {
      message.success('已切换站点')
      showSwitch.value = false
    } else {
      message.error(r.error ?? '切换失败')
    }
  } finally {
    switching.value = ''
  }
}

async function removeSite(path: string, name: string): Promise<void> {
  const ok = await confirmDialog({
    title: '移除站点',
    content: `确定从列表中移除「${name}」吗？仅移除记录，不会删除磁盘上的任何文件。`
  })
  if (!ok) return
  await site.removeRecent(path)
  message.success('已从列表移除')
  if (!site.recents.length) showSwitch.value = false
}

async function quickPreview(): Promise<void> {
  if (ws.previewUrl) {
    message.info('预览已在运行')
    return
  }
  const r = await ws.startPreview()
  if (r.ok) message.success('预览已启动')
  else message.error(r.error ?? '预览启动失败')
}

function openEditor(id: string): void {
  router.push({ path: '/editor', query: { id } })
}

/** 点击统计卡片直达统计页 */
function openStats(): void {
  router.push('/stats')
}

onMounted(() => {
  if (!posts.loaded) posts.load()
})

// 站点打开/切换完成后再刷新统计与最近文章（修复挂载早于站点就绪的竞态）
watch(
  () => site.site?.path,
  (path) => {
    if (path) posts.load()
  }
)
</script>

<template>
  <aside class="rail-inner">
    <section class="glass panel">
      <div class="panel-head-row">
        <div class="panel-title">站点</div>
        <n-button size="tiny" secondary @click="openSwitch">切换站点</n-button>
      </div>
      <div class="site-name">{{ site.site?.name ?? '未打开站点' }}</div>
      <div class="muted small path">{{ site.site?.path ?? '打开一个 Hexo 站点后显示详情' }}</div>
      <div v-if="ws.previewUrl" class="preview-chip">
        <span class="dot"></span>
        预览运行中 · {{ ws.previewUrl }}
      </div>
    </section>

    <section class="glass panel clickable-panel" title="查看完整统计" @click="openStats">
      <div class="panel-head-row">
        <div class="panel-title">统计</div>
        <span class="go-hint muted small">查看详情 ›</span>
      </div>
      <div class="stat-grid">
        <div class="stat">
          <div class="num">{{ postCount }}</div>
          <div class="muted small">文章</div>
        </div>
        <div class="stat">
          <div class="num">{{ draftCount }}</div>
          <div class="muted small">草稿</div>
        </div>
        <div class="stat">
          <div class="num">{{ totalWords }}</div>
          <div class="muted small">总字数</div>
        </div>
      </div>
    </section>

    <section class="glass panel">
      <div class="panel-title">快捷操作</div>
      <div class="ops">
        <n-button size="small" block secondary @click="quickPreview">启动本地预览</n-button>
        <n-button size="small" block secondary @click="router.push('/publish')">构建与部署</n-button>
        <n-button size="small" block secondary @click="router.push('/posts')">管理文章</n-button>
        <n-button size="small" block secondary @click="router.push('/settings?tab=base')">基础配置</n-button>
        <n-button size="small" block secondary @click="router.push('/settings?tab=theme')">主题</n-button>
      </div>
    </section>

    <section class="glass panel">
      <div class="panel-title">最近文章</div>
      <div class="recent">
        <div v-for="p in recent" :key="p.id" class="recent-item" @click="openEditor(p.id)">
          <span class="r-title">{{ p.title }}</span>
          <span class="badge" :class="p.kind">{{ p.kind === 'draft' ? '草稿' : '正式' }}</span>
        </div>
        <div v-if="!recent.length" class="muted small">暂无文章</div>
      </div>
    </section>

    <!-- 切换站点：只列出已添加的站点，点击卡片即切换 -->
    <n-modal v-model:show="showSwitch" preset="card" title="切换站点" style="width: 520px">
      <div class="switch-list">
        <div
          v-for="r in site.recents"
          :key="r.path"
          class="switch-item"
          :class="{ current: r.path === site.site?.path, busy: switching === r.path }"
          :title="r.path === site.site?.path ? '当前站点' : `点击切换到 ${r.name}`"
          @click="switchTo(r.path)"
        >
          <div class="s-main">
            <div class="s-name-row">
              <span class="s-name">{{ r.name }}</span>
              <span v-if="r.path === site.site?.path" class="badge current-badge">当前</span>
            </div>
            <div class="s-path muted small">{{ r.path }}</div>
          </div>
          <n-button
            v-if="r.path !== site.site?.path"
            size="tiny"
            quaternary
            @click.stop="removeSite(r.path, r.name)"
          >
            移除
          </n-button>
          <span v-else class="muted small">使用中</span>
        </div>
        <div v-if="!site.recents.length" class="muted small">
          还没有添加过站点，请先在「站点」页用「添加站点」选择一个 Hexo 博客文件夹。
        </div>
      </div>
    </n-modal>
  </aside>
</template>

<style scoped>
.rail-inner {
  width: 264px;
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: auto;
  padding: 2px;
  box-sizing: border-box;
}

.panel {
  padding: 14px 16px;
}

/* 可点击卡片：悬停时描边点亮并轻微上浮，提示可交互 */
.clickable-panel {
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
}

.clickable-panel:hover {
  border-color: var(--accent);
  box-shadow: var(--glass-glow), var(--accent-glow);
  transform: translateY(-1px);
}

.clickable-panel .go-hint {
  opacity: 0;
  transition: opacity 0.15s ease;
}

.clickable-panel:hover .go-hint {
  opacity: 1;
  color: var(--accent);
}

.panel-head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.site-name {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-1);
}

.path {
  margin-top: 4px;
  word-break: break-all;
  line-height: 1.5;
}

.preview-chip {
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--accent);
  background: var(--accent-soft);
  border: 1px solid var(--glass-border);
  border-radius: 8px;
  padding: 4px 8px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.preview-chip .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ok);
  box-shadow: 0 0 8px var(--ok);
  flex: none;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  text-align: center;
}

.stat .num {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-1);
  font-family: var(--mono);
}

.ops {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.recent {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.recent-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.15s ease, box-shadow 0.15s ease;
}

.recent-item:hover {
  background: var(--accent-soft);
  box-shadow: inset 0 0 0 1px var(--glass-border);
}

.r-title {
  font-size: 13px;
  color: var(--text-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.badge {
  flex: none;
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 999px;
  border: 1px solid var(--glass-border);
  color: var(--text-2);
}

.badge.draft {
  color: var(--warn);
  border-color: var(--warn);
}

/* 切换站点弹窗 */
.switch-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.switch-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 12px;
  border-radius: 10px;
  border: 1px solid var(--glass-border);
  cursor: pointer;
  transition: background 0.15s ease, box-shadow 0.15s ease;
}

.switch-item:hover {
  background: var(--accent-soft);
  box-shadow: var(--accent-glow);
}

.switch-item.current {
  border-color: var(--accent);
  background: var(--accent-soft);
  cursor: default;
}

.switch-item.busy {
  opacity: 0.6;
  pointer-events: none;
}

.s-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.s-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.s-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-1);
}

.s-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.current-badge {
  color: var(--ok);
  border-color: var(--ok);
}
</style>
