<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  NButton,
  NEmpty,
  NForm,
  NFormItem,
  NInput,
  NInputGroup,
  NModal,
  NSpace,
  NSpin,
  NTag
} from 'naive-ui'
import { useSiteStore } from '../stores/site'
import { usePostsStore } from '../stores/posts'
import { useWorkspaceStore } from '../stores/workspace'
import { message } from '../composables/message'
import type { SiteStats } from '@shared/ipc'

const siteStore = useSiteStore()
const posts = usePostsStore()
const ws = useWorkspaceStore()
const router = useRouter()

const showCreate = ref(false)
const creating = ref(false)
const createForm = ref({ name: '', parentDir: '' })
const switching = ref('')
const stats = ref<SiteStats | null>(null)
const statsLoading = ref(false)

const site = computed(() => siteStore.site)

/** 最近 3 篇（列表已按日期倒序），固定条数以保持卡片高度稳定 */
const RECENT_LIMIT = 3
const recentPosts = computed(() => posts.posts.slice(0, RECENT_LIMIT))

/** 站点标识的首字母/首字，用于头像位 */
const siteInitial = computed(() => {
  const name = site.value?.title || site.value?.name || 'H'
  return name.trim().charAt(0).toUpperCase()
})

/** 概览指标（空缺时显示 0，避免卡片高度跳动） */
const metrics = computed(() => {
  const s = stats.value
  return [
    { label: '文章', value: s?.postCount ?? site.value?.postCount ?? 0 },
    { label: '草稿', value: s?.draftCount ?? site.value?.draftCount ?? 0 },
    { label: '总字数', value: s?.totalWords ?? 0 },
    { label: '标签', value: s?.tagCount ?? 0 }
  ]
})

async function loadStats(): Promise<void> {
  if (!site.value) return
  statsLoading.value = true
  try {
    const r = await window.api.getStats()
    if (r.ok && r.data) stats.value = r.data
  } finally {
    statsLoading.value = false
  }
}

async function switchTo(path: string): Promise<void> {
  switching.value = path
  try {
    const r = await siteStore.open(path)
    if (r.ok) message.success('已切换站点')
    else message.error(r.error ?? '切换失败')
  } finally {
    switching.value = ''
  }
}

async function refreshRecents(): Promise<void> {
  await siteStore.loadRecents()
}

function refreshAll(): void {
  void refreshRecents()
  void loadStats()
  void posts.load()
}

async function pickParentDir(): Promise<void> {
  const dir = await window.api.pickDirectory()
  if (dir) createForm.value.parentDir = dir
}

async function doCreate(): Promise<void> {
  if (!createForm.value.name.trim()) {
    message.warning('请填写站点名称')
    return
  }
  if (!createForm.value.parentDir) {
    message.warning('请选择站点存放位置')
    return
  }
  creating.value = true
  try {
    const r = await siteStore.createSite(createForm.value.name.trim(), createForm.value.parentDir)
    if (r.ok) {
      message.success('站点创建成功')
      showCreate.value = false
      createForm.value = { name: '', parentDir: '' }
      refreshAll()
    } else {
      message.error(r.error ?? '创建失败')
    }
  } finally {
    creating.value = false
  }
}

async function closeSite(): Promise<void> {
  await siteStore.close()
  stats.value = null
}

async function quickPreview(): Promise<void> {
  if (ws.previewUrl) {
    router.push('/publish')
    return
  }
  const r = await ws.startPreview()
  if (r.ok) {
    message.success('预览已启动')
    router.push('/publish')
  } else {
    message.error(r.error ?? '预览启动失败')
  }
}

function openPost(id: string): void {
  router.push({ path: '/editor', query: { id } })
}

onMounted(() => {
  void loadStats()
  if (!posts.loaded) void posts.load()
})

// 站点切换后刷新全部数据
watch(
  () => site.value?.path,
  (p) => {
    stats.value = null
    if (p) {
      void loadStats()
      void posts.load()
    }
  }
)
// 文章增删改（文件监听）后刷新统计与列表
watch(
  () => ws.previewRefreshTick,
  () => {
    void loadStats()
    if (!posts.loaded) void posts.load()
  }
)
</script>

<template>
  <div class="page">
    <template v-if="site">
      <!-- 站点身份卡 -->
      <section class="glass panel hero">
        <div class="hero-main">
          <div class="site-avatar">{{ siteInitial }}</div>
          <div class="hero-text">
            <div class="hero-title-row">
              <h2 class="hero-title">{{ site.title || site.name }}</h2>
              <n-tag size="small" type="success" round :bordered="false">已连接</n-tag>
            </div>
            <div v-if="site.subtitle" class="hero-subtitle muted">{{ site.subtitle }}</div>
            <div class="hero-path mono" :title="site.path">{{ site.path }}</div>
          </div>
        </div>
        <div class="hero-actions">
          <n-button size="small" secondary @click="refreshAll">刷新</n-button>
          <n-button size="small" secondary @click="siteStore.openViaDialog()">切换站点</n-button>
          <n-button size="small" quaternary @click="closeSite">关闭站点</n-button>
        </div>
      </section>

      <!-- 写作概览 -->
      <section class="glass panel">
        <div class="panel-head-row">
          <div class="panel-title">写作概览</div>
          <n-button size="tiny" quaternary @click="router.push('/stats')">查看完整统计</n-button>
        </div>
        <n-spin :show="statsLoading">
          <div class="metric-grid">
            <div v-for="m in metrics" :key="m.label" class="metric">
              <div class="metric-value">{{ m.value.toLocaleString() }}</div>
              <div class="metric-label">{{ m.label }}</div>
            </div>
          </div>
          <div v-if="stats" class="metric-extra muted small">
            <span>本周新增 {{ stats.thisWeek }} 篇</span>
            <span>本月新增 {{ stats.thisMonth }} 篇</span>
            <span v-if="stats.lastPostDate">最近更新 {{ stats.lastPostDate }}</span>
            <span v-if="stats.avgWords">平均 {{ stats.avgWords }} 字/篇</span>
          </div>
        </n-spin>
      </section>

      <div class="two-col">
        <!-- 快捷操作 -->
        <section class="glass panel">
          <div class="panel-title">快捷操作</div>
          <div class="quick-grid">
            <button class="quick-item" @click="router.push({ path: '/posts', query: { new: 'post' } })">
              <span class="quick-icon">✎</span>
              <span class="quick-label">写文章</span>
            </button>
            <button class="quick-item" @click="quickPreview">
              <span class="quick-icon">◉</span>
              <span class="quick-label">本地预览</span>
            </button>
            <button class="quick-item" @click="router.push('/settings?tab=theme')">
              <span class="quick-icon">◧</span>
              <span class="quick-label">主题设置</span>
            </button>
            <button class="quick-item" @click="router.push('/publish')">
              <span class="quick-icon">↑</span>
              <span class="quick-label">构建部署</span>
            </button>
          </div>
        </section>

        <!-- 最近文章 -->
        <section class="glass panel">
          <div class="panel-head-row">
            <div class="panel-title">最近文章</div>
            <n-button size="tiny" quaternary @click="router.push('/posts')">全部文章</n-button>
          </div>
          <div v-if="recentPosts.length" class="recent-posts">
            <div v-for="p in recentPosts" :key="p.id" class="post-row" @click="openPost(p.id)">
              <span class="post-title">{{ p.title }}</span>
              <span class="post-meta muted small">
                <n-tag v-if="p.kind === 'draft'" size="tiny" type="warning" round :bordered="false">草稿</n-tag>
                <span v-else>{{ p.date.slice(0, 10) }}</span>
                <span class="post-words">{{ p.wordCount }} 字</span>
              </span>
            </div>
          </div>
          <div v-else class="muted small">还没有文章，点击「写文章」开始创作</div>
        </section>
      </div>

      <!-- 站点管理 -->
      <section class="glass panel">
        <div class="panel-head-row">
          <div class="panel-title">站点管理</div>
          <n-space :size="6">
            <n-button size="tiny" type="primary" @click="siteStore.openViaDialog()">添加站点</n-button>
            <n-button size="tiny" quaternary @click="showCreate = true">新建站点</n-button>
            <n-button size="tiny" quaternary @click="refreshRecents">刷新</n-button>
          </n-space>
        </div>
        <div v-if="siteStore.recents.length" class="recents">
          <div v-for="r in siteStore.recents" :key="r.path" class="recent-item">
            <div class="r-main">
              <n-space align="center" :size="8">
                <span class="r-name">{{ r.name }}</span>
                <n-tag v-if="r.path === site.path" size="small" type="success" round :bordered="false">
                  当前
                </n-tag>
              </n-space>
              <div class="r-path muted small">{{ r.path }}</div>
            </div>
            <n-space v-if="r.path !== site.path" align="center" :size="6">
              <n-button size="tiny" secondary :loading="switching === r.path" @click="switchTo(r.path)">
                切换
              </n-button>
              <n-button size="tiny" quaternary @click="siteStore.removeRecent(r.path)">移除</n-button>
            </n-space>
          </div>
        </div>
        <div v-else class="muted small">暂无其他站点，点击「添加站点」选择 Hexo 站点目录</div>
      </section>
    </template>

    <!-- 未打开站点：欢迎页 -->
    <template v-else>
      <section class="glass panel welcome">
        <div class="welcome-logo">◆</div>
        <h2 class="welcome-title">开始使用 HexoDeck</h2>
        <p class="muted welcome-desc">
          选择你的 Hexo 博客站点目录（包含 <code>_config.yml</code> 的文件夹），即可在图形界面中写作、预览与发布。
        </p>
        <n-space justify="center" :size="10">
          <n-button type="primary" :loading="siteStore.loading" @click="siteStore.openViaDialog()">
            打开站点目录
          </n-button>
          <n-button @click="showCreate = true">新建站点</n-button>
        </n-space>

        <div v-if="siteStore.recents.length" class="recents welcome-recents">
          <div class="muted small recent-title">最近打开</div>
          <div v-for="r in siteStore.recents" :key="r.path" class="recent-item">
            <div class="r-main clickable" @click="siteStore.open(r.path)">
              <span class="r-name">{{ r.name }}</span>
              <div class="r-path muted small">{{ r.path }}</div>
            </div>
            <n-button size="tiny" quaternary @click="siteStore.removeRecent(r.path)">移除</n-button>
          </div>
        </div>
        <n-empty v-else description="暂无历史记录" size="small" style="margin-top: 18px" />
      </section>
    </template>

    <n-modal v-model:show="showCreate" preset="card" title="新建 Hexo 站点" style="width: 520px">
      <n-form label-placement="left" :label-width="90">
        <n-form-item label="站点名称">
          <n-input v-model:value="createForm.name" placeholder="例如：my-blog（作为目录名）" />
        </n-form-item>
        <n-form-item label="存放位置">
          <n-input-group>
            <n-input v-model:value="createForm.parentDir" placeholder="选择父目录" readonly />
            <n-button @click="pickParentDir">选择…</n-button>
          </n-input-group>
        </n-form-item>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button @click="showCreate = false">取消</n-button>
          <n-button type="primary" :loading="creating" @click="doCreate">创建并安装依赖</n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<style scoped>
/* 页面纵向节奏：所有区块统一 14px 间隔，避免卡片紧贴 */
.page {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.panel-head-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

/* 站点身份卡 */
.hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.hero-main {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.site-avatar {
  width: 52px;
  height: 52px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  font-size: 24px;
  font-weight: 700;
  color: var(--accent);
  background: var(--accent-soft);
  border: 1px solid var(--glass-border);
  box-shadow: var(--accent-glow);
}

.hero-text {
  min-width: 0;
}

.hero-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.hero-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--text-1);
}

.hero-subtitle {
  margin-top: 2px;
  font-size: 13px;
}

.hero-path {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 46vw;
}

.hero-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.mono {
  font-family: var(--mono);
}

/* 写作概览 */
.metric-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 10px;
}

.metric {
  padding: 12px 14px;
  border-radius: var(--radius);
  border: 1px solid var(--glass-border);
  background: var(--accent-soft);
  text-align: center;
}

.metric-value {
  font-size: 24px;
  font-weight: 700;
  font-family: var(--mono);
  color: var(--accent);
  line-height: 1.2;
}

.metric-label {
  margin-top: 2px;
  font-size: 13px;
  color: var(--text-1);
}

.metric-extra {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 10px;
}

/* 双列区：两卡等高（stretch），列间距 14px */
.two-col {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 14px;
  align-items: stretch;
}

/* 双列内的卡片撑满整行高度，避免一高一矮 */
.two-col > .glass {
  display: flex;
  flex-direction: column;
  height: 100%;
  margin: 0;
}

/* 快捷操作 */
.quick-grid {
  /* 固定 2×2：四项正好铺满，避免 auto-fit 在窄列下折行导致高度不齐 */
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  grid-auto-rows: 1fr;
  gap: 10px;
  flex: 1;
}

.quick-item {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px 10px;
  border-radius: var(--radius);
  border: 1px solid var(--glass-border);
  background: var(--accent-soft);
  cursor: pointer;
  font-family: inherit;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
}

.quick-item:hover {
  border-color: var(--accent);
  box-shadow: var(--accent-glow);
  transform: translateY(-1px);
}

.quick-icon {
  font-size: 20px;
  color: var(--accent);
  line-height: 1;
}

.quick-label {
  font-size: 13px;
  color: var(--text-1);
}

/* 最近文章：固定 3 条、每条固定高度，卡片总高稳定且与左栏等高 */
.recent-posts {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
}

.post-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  height: 42px;
  flex: none;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}

.post-row:hover {
  background: var(--accent-soft);
  border-color: var(--glass-border);
  box-shadow: var(--accent-glow);
}

.post-title {
  font-size: 13px;
  color: var(--text-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.post-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
}

.post-words {
  font-family: var(--mono);
}

/* 站点管理列表 */
.recents {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.recent-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 12px;
  border-radius: 10px;
  border: 1px solid var(--glass-border);
  transition: background 0.15s ease, box-shadow 0.15s ease;
}

.recent-item:hover {
  background: var(--accent-soft);
  box-shadow: var(--accent-glow);
}

.r-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.r-main.clickable {
  cursor: pointer;
  flex: 1;
}

.r-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-1);
}

.r-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 欢迎页 */
.welcome {
  text-align: center;
  padding: 40px 24px;
}

.welcome-logo {
  font-size: 40px;
  color: var(--accent);
  line-height: 1;
  text-shadow: var(--accent-glow);
}

.welcome-title {
  margin: 14px 0 6px;
  font-size: 20px;
  color: var(--text-1);
}

.welcome-desc {
  max-width: 460px;
  margin: 0 auto 18px;
  line-height: 1.7;
}

.welcome-desc code {
  font-family: var(--mono);
  padding: 1px 5px;
  border-radius: 5px;
  background: var(--accent-soft);
}

.welcome-recents {
  max-width: 520px;
  margin: 24px auto 0;
  text-align: left;
}

.recent-title {
  margin-bottom: 8px;
}
</style>
