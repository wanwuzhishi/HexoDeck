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
import type { SiteInfo, SiteStats } from '@shared/ipc'

const siteStore = useSiteStore()
const posts = usePostsStore()
const ws = useWorkspaceStore()
const router = useRouter()

const showCreate = ref(false)
const creating = ref(false)
const createForm = ref({ name: '', parentDir: '' })
const switching = ref('')
const showSwitch = ref(false)
const stats = ref<SiteStats | null>(null)
const statsLoading = ref(false)

const site = computed(() => siteStore.site)

/** 最近 3 篇（列表已按日期倒序），固定条数以保持卡片高度稳定 */
const RECENT_LIMIT = 3
const recentPosts = computed(() => posts.posts.slice(0, RECENT_LIMIT))

/** 站点标识的首字母/首字，用于无图标时的头像位 */
const siteInitial = computed(() => {
  const name = site.value?.title || site.value?.name || 'H'
  return name.trim().charAt(0).toUpperCase()
})

// ---------- 自定义站点图标 ----------
const iconBusy = ref(false)
const iconDragActive = ref(false)

/** 图标写入站点 source/，后端回传新的 SiteInfo，这里直接替换以立即刷新头像 */
function applyIconResult(r: { ok: boolean; error?: string; data?: SiteInfo }): void {
  if (r.ok && r.data) {
    siteStore.site = r.data
    message.success(r.data.iconPath ? '站点图标已更新' : '已恢复默认图标')
  } else if (r.error && r.error !== 'canceled') {
    message.error(r.error)
  }
}

async function pickIcon(): Promise<void> {
  iconBusy.value = true
  try {
    applyIconResult(await window.api.pickSiteIcon())
  } finally {
    iconBusy.value = false
  }
}

async function clearIcon(): Promise<void> {
  iconBusy.value = true
  try {
    applyIconResult(await window.api.clearSiteIcon())
  } finally {
    iconBusy.value = false
  }
}

const ICON_EXT_RE = /\.(ico|png|jpe?g|svg|webp|gif|bmp)$/i

function onIconDragLeave(e: DragEvent): void {
  const zone = e.currentTarget as HTMLElement
  if (!zone.contains(e.relatedTarget as Node)) iconDragActive.value = false
}

/** 直接把图片拖到头像上即可设为站点图标 */
async function onIconDrop(e: DragEvent): Promise<void> {
  iconDragActive.value = false
  const file = Array.from(e.dataTransfer?.files ?? [])[0]
  if (!file) return
  if (!ICON_EXT_RE.test(file.name)) {
    message.error('图标仅支持 .ico / .png / .jpg / .svg / .webp / .gif / .bmp 格式')
    return
  }
  iconBusy.value = true
  try {
    const base64 = await fileToBase64(file)
    applyIconResult(await window.api.setSiteIcon(file.name, base64))
  } catch (e) {
    message.error((e as Error).message)
  } finally {
    iconBusy.value = false
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result ?? '')
      // 去掉 data URL 前缀，主进程按 base64 直接解码
      resolve(result.includes(',') ? result.slice(result.indexOf(',') + 1) : result)
    }
    reader.onerror = () => reject(new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })
}

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
  // 点当前站点（或切换进行中）不重复打开
  if (path === siteStore.site?.path || switching.value) return
  switching.value = path
  try {
    const r = await siteStore.open(path)
    if (r.ok) message.success('已切换站点')
    else message.error(r.error ?? '切换失败')
  } finally {
    switching.value = ''
  }
}

/** 切换弹窗内点击卡片：成功后关闭弹窗 */
async function switchModalTo(path: string): Promise<void> {
  await switchTo(path)
  if (siteStore.site?.path === path) showSwitch.value = false
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
  // 预览已运行则直接跳转，否则先启动再进入预览页
  if (ws.previewUrl) {
    router.push('/preview')
    return
  }
  const r = await ws.startPreview()
  if (r.ok) {
    message.success('预览已启动')
    router.push('/preview')
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
          <div class="avatar-wrap">
            <div
              class="site-avatar"
              :class="{ 'has-icon': site.iconUrl, dragging: iconDragActive, busy: iconBusy }"
              :title="site.iconUrl ? '点击更换站点图标（也可直接拖入图片）' : '点击设置站点图标（也可直接拖入图片）'"
              @click="pickIcon"
              @dragenter.prevent="iconDragActive = true"
              @dragover.prevent="iconDragActive = true"
              @dragleave.prevent="onIconDragLeave"
              @drop.prevent="onIconDrop"
            >
              <img v-if="site.iconUrl" :src="site.iconUrl" alt="站点图标" />
              <template v-else>{{ siteInitial }}</template>
              <!-- 悬停时浮出遮罩，提示此处可点击更换 -->
              <span class="avatar-mask">{{ site.iconUrl ? '更换' : '设置' }}</span>
            </div>
            <n-button
              v-if="site.iconUrl"
              size="tiny"
              quaternary
              :disabled="iconBusy"
              title="删除站点内的 favicon 文件"
              @click="clearIcon"
            >
              移除图标
            </n-button>
          </div>
          <div class="hero-text">
            <div class="hero-title-row">
              <h2 class="hero-title">{{ site.title || site.name }}</h2>
              <n-tag size="small" type="success" round :bordered="false">已连接</n-tag>
            </div>
            <div v-if="site.subtitle" class="hero-subtitle muted">{{ site.subtitle }}</div>
            <div class="hero-path mono" :title="site.path">{{ site.path }}</div>
            <div v-if="site.iconPath" class="hero-icon-path muted small" :title="site.iconPath">
              图标：{{ site.iconPath }}
            </div>
          </div>
        </div>
        <div class="hero-actions">
          <n-button size="small" secondary @click="refreshAll">刷新</n-button>
          <n-button size="small" secondary @click="showSwitch = true">切换站点</n-button>
          <n-button size="small" quaternary @click="siteStore.openViaDialog()">添加站点</n-button>
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
            </button>            <button class="quick-item" @click="router.push('/settings?tab=theme')">
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
            <n-button size="tiny" secondary @click="siteStore.openViaDialog()">添加站点</n-button>
            <n-button size="tiny" quaternary @click="showCreate = true">新建站点</n-button>
            <n-button size="tiny" quaternary @click="refreshRecents">刷新</n-button>
          </n-space>
        </div>
        <div v-if="siteStore.recents.length" class="recents">
          <div
            v-for="r in siteStore.recents"
            :key="r.path"
            class="recent-item clickable"
            :class="{ current: r.path === site.path, busy: switching === r.path }"
            :title="r.path === site.path ? '当前站点' : `点击切换到 ${r.name}`"
            @click="switchTo(r.path)"
          >
            <div class="r-main">
              <n-space align="center" :size="8">
                <span class="r-name">{{ r.name }}</span>
                <n-tag v-if="r.path === site.path" size="small" type="success" round :bordered="false">
                  当前
                </n-tag>
              </n-space>
              <div class="r-path muted small">{{ r.path }}</div>
            </div>
            <n-button
              v-if="r.path !== site.path"
              size="tiny"
              quaternary
              @click.stop="siteStore.removeRecent(r.path)"
            >
              移除
            </n-button>
            <span v-else class="muted small">使用中</span>
          </div>
        </div>
        <div v-else class="muted small">暂无其他站点，点击「添加站点」选择一个 Hexo 博客文件夹（含 _config.yml）</div>
      </section>
    </template>

    <!-- 未打开站点：欢迎页 -->
    <template v-else>
      <section class="glass panel welcome">
        <div class="welcome-logo">◆</div>
        <h2 class="welcome-title">开始使用 HexoDeck</h2>
        <p class="muted welcome-desc">
          选择一个已安装 Hexo 的博客文件夹（包含 <code>_config.yml</code> 的目录），即可在图形界面中写作、预览与发布。
        </p>
        <n-space justify="center" :size="10">
          <n-button type="primary" :loading="siteStore.loading" @click="siteStore.openViaDialog()">
            添加站点
          </n-button>
          <n-button v-if="siteStore.recents.length" @click="showSwitch = true">切换站点</n-button>
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

    <n-modal v-model:show="showSwitch" preset="card" title="切换站点" style="width: 540px">
      <div class="recents switch-recents">
        <div
          v-for="r in siteStore.recents"
          :key="r.path"
          class="recent-item clickable"
          :class="{ current: r.path === site?.path, busy: switching === r.path }"
          :title="r.path === site?.path ? '当前站点' : `点击切换到 ${r.name}`"
          @click="switchModalTo(r.path)"
        >
          <div class="r-main">
            <n-space align="center" :size="8">
              <span class="r-name">{{ r.name }}</span>
              <n-tag v-if="r.path === site?.path" size="small" type="success" round :bordered="false">当前</n-tag>
            </n-space>
            <div class="r-path muted small">{{ r.path }}</div>
          </div>
          <n-button
            v-if="r.path !== site?.path"
            size="tiny"
            quaternary
            @click.stop="siteStore.removeRecent(r.path)"
          >
            移除
          </n-button>
          <span v-else class="muted small">使用中</span>
        </div>
        <div v-if="!siteStore.recents.length" class="muted small">
          还没有添加过站点，请先点击「添加站点」选择一个 Hexo 博客文件夹。
        </div>
      </div>
    </n-modal>

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

/* 站点图标：无图标时显示首字母，有图标时显示图片，支持拖拽更换 */
.avatar-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex: none;
}

.site-avatar {
  position: relative;
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
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.site-avatar:hover {
  border-color: var(--accent);
  box-shadow: var(--glass-glow), var(--accent-glow);
}

/* 悬停遮罩：提示头像可点击更换 */
.avatar-mask {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  background: rgba(0, 0, 0, 0.55);
  opacity: 0;
  transition: opacity 0.15s ease;
  pointer-events: none;
}

.site-avatar:hover .avatar-mask {
  opacity: 1;
}

/* 有图标时内边距收紧，让图片铺满圆角方块 */
.site-avatar.has-icon {
  padding: 0;
}

.site-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* 拖拽悬停与写入中 */
.site-avatar.dragging {
  border-color: var(--accent);
  border-style: dashed;
  box-shadow: var(--glass-glow), var(--accent-glow);
}

.site-avatar.busy {
  opacity: 0.6;
  pointer-events: none;
}

.hero-icon-path {
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 46vw;
  font-family: var(--mono);
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

/* 双列内的卡片：靠 stretch 拉平高度即可。
   不能再设 height:100%——它与内部 flex:1 形成高度循环依赖，会让卡片溢出网格行、
   盖到下一个区块上 */
.two-col > .glass {
  display: flex;
  flex-direction: column;
  min-height: 0;
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

/* 整卡可点击切换站点 */
.recent-item.clickable {
  cursor: pointer;
}

.recent-item.current {
  border-color: var(--accent);
  background: var(--accent-soft);
  cursor: default;
}

.recent-item.busy {
  opacity: 0.6;
  pointer-events: none;
}

/* 切换弹窗内的站点项：当前站点高亮 */
.switch-recents .recent-item.current {
  border-color: var(--accent);
  background: var(--accent-soft);
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
