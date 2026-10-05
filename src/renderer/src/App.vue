<script setup lang="ts">
import { computed, h, onMounted, ref, watch, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  darkTheme,
  dateZhCN,
  NButton,
  NForm,
  NFormItem,
  NIcon,
  NInput,
  NModal,
  NSpace,
  zhCN
} from 'naive-ui'
import type { MenuOption } from 'naive-ui'
import {
  AddOutline,
  ChevronBackOutline,
  ChevronForwardOutline,
  ContrastOutline,
  DocumentTextOutline,
  EyeOutline,
  HomeOutline,
  MoonOutline,
  ReaderOutline,
  RocketOutline,
  SettingsOutline,
  StatsChartOutline,
  CloudUploadOutline,
  SunnyOutline
} from '@vicons/ionicons5'
import { darkOverrides, lightOverrides } from './theme'
import { useSiteStore } from './stores/site'
import { useWorkspaceStore } from './stores/workspace'
import { useUiStore } from './stores/ui'
import InfoRail from './components/InfoRail.vue'
import TitleBar from './components/TitleBar.vue'
import { useCollectionsStore } from './stores/collections'
import CollectionIcon from './components/CollectionIcon.vue'
import { COLLECTION_ICON_PRESETS, isImportedIcon } from './constants/collectionIcons'
import appIcon from './assets/app-icon.png'
import { message, setDiscreteTheme } from './composables/message'

const route = useRoute()
const router = useRouter()
const siteStore = useSiteStore()
const workspace = useWorkspaceStore()
const ui = useUiStore()

/** 窗口最大化状态：由标题栏同步，用于让外壳在最大化时贴边铺满 */
const winMaximized = ref(false)

// 主题：body 类（驱动 CSS 变量）+ 独立 message 弹层主题
watchEffect(() => {
  document.body.classList.toggle('theme-dark', ui.isDark)
  document.body.classList.toggle('theme-light', !ui.isDark)
  setDiscreteTheme(ui.isDark)
})

const renderIcon = (icon: unknown) => (): ReturnType<typeof h> =>
  h(NIcon, null, { default: () => h(icon as never) })

const collections = useCollectionsStore()

/** 内置菜单 + 用户自定义文集（名称限 8 字防溢出）+「自定义」入口 */
const menuOptions = computed<MenuOption[]>(() => [
  { label: '站点', key: '/', icon: renderIcon(HomeOutline) },
  { label: '文章', key: '/posts', icon: renderIcon(DocumentTextOutline) },
  { label: '页面', key: '/pages', icon: renderIcon(ReaderOutline) },
  ...collections.defs.map<MenuOption>((c) => ({
    label: () => h('span', { class: 'menu-coll-label', title: c.name }, c.name),
    key: `/collection?id=${c.id}`,
    icon: () => h(CollectionIcon, { icon: c.icon, size: 16 })
  })),
  { label: '自定义', key: '/new-collection', icon: renderIcon(AddOutline) },
  { label: '统计', key: '/stats', icon: renderIcon(StatsChartOutline) },
  { label: '预览', key: '/preview', icon: renderIcon(EyeOutline) },
  { label: '发布', key: '/publish', icon: renderIcon(RocketOutline) },
  { label: '设置', key: '/settings', icon: renderIcon(SettingsOutline) }
])

const activeKey = computed(() => {
  if (route.path === '/collection') return `/collection?id=${String(route.query.id ?? '')}`
  if (route.path === '/collection-editor')
    return `/collection?id=${String(route.query.collection ?? '')}`
  if (route.path.startsWith('/editor')) return '/posts'
  if (route.path.startsWith('/page-editor')) return '/pages'
  return route.path
})

/** 主题按钮：三态循环 亮色 → 暗色 → 跟随系统 */
const themeButtonIcon = computed(() => {
  if (ui.themeMode === 'system') return ContrastOutline
  return ui.themeMode === 'dark' ? MoonOutline : SunnyOutline
})

/** 按钮上直接显示当前模式。侧栏仅 208px、两个按钮并排，
 *  每个按钮扣掉图标与间距后只剩约 45px 文字位——「跟随系统」4 字放不下会顶出边框，
 *  因此这里一律用 2 字标签，完整名称放在 tooltip 里 */
const themeButtonLabel = computed(
  () => ({ light: '亮色', dark: '暗色', system: '跟随' })[ui.themeMode]
)

const themeButtonTitle = computed(() => {
  const full = { light: '亮色', dark: '暗色', system: '跟随系统' }[ui.themeMode]
  const next = { light: '暗色', dark: '跟随系统', system: '亮色' }[ui.themeMode]
  return `当前：${full}（点击切换到${next}）`
})

/** 侧栏折叠按钮：图标 + 文案，收起态只留图标 */
const navToggleIcon = computed(() => (ui.navCollapsed ? ChevronForwardOutline : ChevronBackOutline))

// 编辑器聚焦写作、站点页本身已是全宽仪表盘（右栏三卡与页面内容完全重复），
// 这两个页面隐藏右侧信息栏
const showRail = computed(() => route.name !== 'editor' && route.name !== 'site')

function onMenu(key: string): void {
  if (key === '/new-collection') {
    openCollDialog()
    return
  }
  router.push(key)
}

// ---------- 新建文集弹窗（名称 + 图标 + 站点根目录内的文件夹） ----------
const showCollDialog = ref(false)
const collSaving = ref(false)
const collForm = ref({ name: '', icon: 'Book', dir: '' })
const collDirError = ref('')

function openCollDialog(): void {
  if (!siteStore.site) {
    message.warning('请先打开站点')
    return
  }
  collForm.value = { name: '', icon: 'Book', dir: '' }
  collDirError.value = ''
  showCollDialog.value = true
}

/** 从本地导入文集图标（转 data URL 存储，限 200KB） */
function pickCollIcon(): void {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.png,.jpg,.jpeg,.svg,.webp,.ico'
  input.onchange = () => {
    const file = input.files?.[0]
    if (!file) return
    if (file.size > 200 * 1024) {
      message.error('图标文件过大（超过 200KB），请换一张小图')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      collForm.value.icon = String(reader.result ?? '')
    }
    reader.onerror = () => message.error('读取图片失败')
    reader.readAsDataURL(file)
  }
  input.click()
}

/** 在资源管理器中显示站点内相对路径所在位置 */
function revealSitePath(rel: string): void {
  if (!siteStore.site || !rel) return
  void window.api.revealInFolder(`${siteStore.site.path}/${rel}`)
}

async function pickCollDir(): Promise<void> {
  collDirError.value = ''
  const r = await window.api.pickCollectionDir()
  if (r.ok && r.data) collForm.value.dir = r.data.dir
  else if (r.error) collDirError.value = r.error
}

async function createCollection(): Promise<void> {
  if (!collForm.value.name.trim()) {
    message.warning('请填写文集名称')
    return
  }
  if (!collForm.value.dir) {
    message.warning('请选择文集目录')
    return
  }
  collSaving.value = true
  try {
    await collections.add(collForm.value.name, collForm.value.icon, collForm.value.dir)
    showCollDialog.value = false
    message.success(`文集「${collForm.value.name.trim()}」已创建`)
  } catch (e) {
    message.error((e as Error).message)
  } finally {
    collSaving.value = false
  }
}

onMounted(async () => {
  // 跟随系统主题：监听系统亮暗变化
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  ui.updateSystemDark(mq.matches)
  mq.addEventListener('change', (e) => ui.updateSystemDark(e.matches))

  workspace.init()
  const r = await siteStore.init()
  if (r && !r.ok) message.error(`自动打开上次站点失败：${r.error ?? '未知错误'}`)
  // 文集按站点隔离：站点就绪后加载（未打开站点时列表为空）
  await collections.load()
})

// 站点切换后重载文集（文集定义按站点路径分组存储）
watch(
  () => siteStore.site?.path,
  () => {
    void collections.load()
  }
)
</script>

<template>
  <n-config-provider
    :theme="ui.isDark ? darkTheme : null"
    :theme-overrides="ui.isDark ? darkOverrides : lightOverrides"
    :locale="zhCN"
    :date-locale="dateZhCN"
  >
    <n-message-provider>
      <div class="app-root" :class="{ maximized: winMaximized }">
        <TitleBar @maximized-change="winMaximized = $event" />
        <div class="shell">
        <aside class="sider glass" :class="{ collapsed: ui.navCollapsed }">
          <div class="brand">
            <img class="logo" :src="appIcon" alt="HexoDeck" />
            <span v-if="!ui.navCollapsed" class="brand-name">HexoDeck</span>
          </div>
          <n-menu
            class="nav"
            :value="activeKey"
            :options="menuOptions"
            :collapsed="ui.navCollapsed"
            :collapsed-width="48"
            :collapsed-icon-size="20"
            @update:value="onMenu"
          />
          <div class="sider-foot">
            <!-- 当前站点：放在按钮上方，避免与两个操作按钮挤在一行 -->
            <div v-if="!ui.navCollapsed" class="foot-site" :title="siteStore.site?.path">
              <span class="foot-site-dot" :class="{ on: !!siteStore.site }"></span>
              <span class="foot-site-name">{{ siteStore.site?.name ?? '未打开站点' }}</span>
            </div>
            <div class="foot-actions">
              <n-button
                class="foot-btn"
                size="small"
                secondary
                :title="themeButtonTitle"
                @click="ui.cycleTheme"
              >
                <template #icon>
                  <n-icon :component="themeButtonIcon" />
                </template>
                <span v-if="!ui.navCollapsed" class="foot-btn-text">{{ themeButtonLabel }}</span>
              </n-button>
              <n-button
                class="foot-btn"
                size="small"
                secondary
                :title="ui.navCollapsed ? '展开侧边栏' : '收起侧边栏'"
                @click="ui.toggleNav"
              >
                <template #icon>
                  <n-icon :component="navToggleIcon" />
                </template>
                <span v-if="!ui.navCollapsed" class="foot-btn-text">收起</span>
              </n-button>
            </div>
          </div>
        </aside>

        <main class="main">
          <router-view />
        </main>

        <InfoRail v-if="showRail" class="rail" />
        </div>
      </div>

      <!-- 自定义文集：名称 + 图标 + 站点根目录内的文件夹 -->
      <n-modal v-model:show="showCollDialog" preset="card" title="自定义" style="width: 480px">
        <n-form label-placement="left" :label-width="76">
          <n-form-item label="名称">
            <n-input
              v-model:value="collForm.name"
              maxlength="8"
              show-count
              placeholder="最多 8 个字，如：笔记、随笔"
            />
          </n-form-item>
          <n-form-item label="图标">
            <div class="coll-icon-field">
              <div class="icon-picker">
                <button
                  v-for="p in COLLECTION_ICON_PRESETS"
                  :key="p.key"
                  type="button"
                  class="icon-choice"
                  :class="{ active: collForm.icon === p.key }"
                  :title="p.label"
                  @click="collForm.icon = p.key"
                >
                  <n-icon :component="p.comp" :size="17" />
                </button>
                <button
                  type="button"
                  class="icon-choice icon-choice-import"
                  :class="{ active: isImportedIcon(collForm.icon) }"
                  :title="isImportedIcon(collForm.icon) ? '重新导入外部图标' : '导入外部图标'"
                  @click="pickCollIcon"
                >
                  <template v-if="isImportedIcon(collForm.icon)">
                    <img class="icon-choice-preview" :src="collForm.icon" alt="" />
                  </template>
                  <n-icon v-else :component="CloudUploadOutline" :size="17" />
                  <!-- 右下角加号角标：与预置图标区分，提示可添加自己的图标 -->
                  <span class="import-badge">+</span>
                </button>
              </div>
              <div v-if="isImportedIcon(collForm.icon)" class="muted small">
                已使用导入的图标，点击右侧按钮可重新导入
              </div>
            </div>
          </n-form-item>
          <n-form-item label="目录">
            <n-space :size="8" align="center" style="width: 100%">
              <n-button secondary @click="pickCollDir">选择文件夹</n-button>
              <span
                class="coll-dir path-link"
                :title="collForm.dir ? '点击打开所在文件夹' : ''"
                @click="collForm.dir && revealSitePath(collForm.dir)"
              >
                {{ collForm.dir ? `站点内：${collForm.dir}` : '站点根目录及其子目录（任意层级）均可' }}
              </span>
            </n-space>
          </n-form-item>
        </n-form>
        <div v-if="collDirError" class="coll-error">{{ collDirError }}</div>
        <div class="muted small coll-tip">
          文集目录位于站点根目录下（含任意深度的子目录）。文集中的 Markdown 文件在此集中管理，
          入口名称与图标随时可在文集页修改。
        </div>
        <template #footer>
          <n-space justify="end">
            <n-button @click="showCollDialog = false">取消</n-button>
            <n-button type="primary" :loading="collSaving" @click="createCollection">创建</n-button>
          </n-space>
        </template>
      </n-modal>
    </n-message-provider>
  </n-config-provider>
</template>

<style scoped>
.app-root {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

/* 最大化时整体贴边：标题栏与内容都不再留外边距 */
.app-root.maximized .shell {
  padding: 0;
}

/* 标题栏与主区域之间的纵向间距由标题栏自身的下外边距提供（14px），
   这里不再重复留白，避免出现 12+14 的双重空隙 */
.shell {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 12px;
  padding: 0 12px 12px;
  box-sizing: border-box;
}

.sider {
  width: 208px;
  flex: none;
  display: flex;
  flex-direction: column;
  padding: 14px 10px 12px;
  box-sizing: border-box;
  overflow: hidden;
  transition: width 0.22s ease;
}

.sider.collapsed {
  width: 68px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 2px 6px 14px;
  overflow: hidden;
}

/* 收起态：logo 居中 */
.sider.collapsed .brand {
  justify-content: center;
  padding: 2px 0 14px;
}

.logo {
  width: 30px;
  height: 30px;
  flex: none;
  border-radius: 8px;
  object-fit: contain;
  /* 图标本身是深空底 + 青紫渐变六边形，加一层同色描边与光晕让它在玻璃上立起来 */
  box-shadow: 0 0 10px var(--accent-soft);
}

.brand-name {
  font-weight: 800;
  font-size: 17px;
  letter-spacing: 0.4px;
  color: var(--text-1);
  white-space: nowrap;
}

.nav {
  flex: 1;
  min-height: 0;
}

.sider :deep(.n-menu) {
  background: transparent;
}

/* 菜单项内边距：让高亮背景铺满整行（原左内边距造成背景两侧留白） */
.sider :deep(.n-menu-item-content) {
  border-radius: 12px !important;
  padding-left: 0 !important;
  padding-right: 0 !important;
}

/* naive-ui 用 ::before 绘制选中/悬停背景，这里让它撑满整个菜单项 */
.sider :deep(.n-menu-item-content::before) {
  left: 0 !important;
  right: 0 !important;
  border-radius: 12px !important;
}

/* 展开态：图标留出左侧内边距，文字紧随其后 */
.sider:not(.collapsed) :deep(.n-menu-item-content .n-menu-item-content__icon) {
  margin-left: 10px;
}

.sider:not(.collapsed) :deep(.n-menu-item-content-header) {
  padding-left: 4px;
}

/* 折叠态：naive-ui 仅把文字头设为 opacity:0，它仍占据布局宽度导致图标偏左。
   将其宽度归零后，flex 居中只作用于图标本身 */
.sider.collapsed :deep(.n-menu-item-content) {
  display: flex;
  align-items: center;
  justify-content: center;
}

.sider.collapsed :deep(.n-menu-item-content-header) {
  display: none !important;
}

.sider.collapsed :deep(.n-menu-item-content .n-menu-item-content__icon) {
  margin: 0 !important;
  position: static !important;
  transform: none !important;
}

.sider :deep(.n-menu-item-content--selected) {
  background: var(--accent-soft) !important;
  box-shadow: inset 0 0 0 1px var(--glass-border), 0 0 10px var(--accent-soft);
}

.sider-foot {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--glass-border);
}

.foot-site {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 12px;
  color: var(--text-2);
}

/* 站点状态点：已连接时点亮，未打开时保持暗淡 */
.foot-site-dot {
  width: 6px;
  height: 6px;
  flex: none;
  border-radius: 50%;
  background: var(--text-3);
}

.foot-site-dot.on {
  background: var(--ok);
  box-shadow: 0 0 6px var(--ok);
}

.foot-site-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 两个操作按钮：等宽并排，带描边与图标，比原来的裸文字更醒目 */
.foot-actions {
  display: flex;
  gap: 6px;
}

.foot-btn {
  flex: 1;
  min-width: 0;
}

/* naive-ui 默认给按钮 0 14px 内边距；侧栏只有 208px，两个按钮并排时
   这点内边距会把文字挤到边框外。用 :deep 压掉内边距，让内容自己撑满。 */
.foot-btn :deep(.n-button__content) {
  padding: 0;
  min-width: 0;
}

/* 图标从默认 18px 收到 14px：按钮可用宽度约 91px，
   图标+间距占 20px，留给文字的宽度才能放下 2 字标签 */
.foot-btn :deep(.n-button__icon),
.foot-btn :deep(.n-icon) {
  font-size: 14px;
  width: 14px;
  height: 14px;
}

.foot-btn :deep(.n-button__border),
.foot-btn :deep(.n-button__state-border) {
  border-radius: 8px;
}

/* 标签过长时省略而不是溢出边框 */
.foot-btn-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

/* 收起态：按钮只留图标并居中 */
.sider.collapsed .foot-actions {
  flex-direction: column;
}

.sider.collapsed .foot-btn {
  flex: none;
  width: 100%;
}

/* 文集菜单项：图标与名称对齐、名称截断 */
.sider :deep(.menu-coll-label) {
  display: inline-block;
  max-width: 108px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
}

/* 新建文集弹窗 */
.icon-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.icon-choice {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
  border: 1px solid var(--glass-border);
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.icon-choice:hover {
  background: var(--accent-soft);
}

.icon-choice-preview {
  width: 17px;
  height: 17px;
  object-fit: cover;
  border-radius: 3px;
  display: block;
}

.icon-choice.active {
  border-color: var(--accent);
  background: var(--accent-soft);
  box-shadow: var(--accent-glow);
}

/* 导入图标格：虚线描边 + 右下角加号，与预置图标明显区分 */
.icon-choice-import {
  position: relative;
  border-style: dashed;
  border-color: var(--accent);
  color: var(--accent);
}

.icon-choice-import:hover {
  background: var(--accent-soft);
}

/* 角标贴在右下角外侧，不挤占图标区域 */
.import-badge {
  position: absolute;
  right: -3px;
  bottom: -3px;
  width: 13px;
  height: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  color: #fff;
  background: var(--accent);
  border-radius: 50%;
  pointer-events: none;
}

.coll-dir {
  font-size: 12px;
  color: var(--text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex: 1;
}

.coll-error {
  margin-top: 8px;
  font-size: 12px;
  color: var(--danger);
}

.coll-tip {
  margin-top: 10px;
  line-height: 1.7;
}

.main {
  flex: 1;
  min-width: 0;
  overflow: auto;
  border-radius: var(--radius-lg);
  /* 作为列向 flex 容器：编辑器类的整屏页面才能用 flex:1 撑满可视高度，
     把状态栏固定在底部而不会被内容挤出视口 */
  display: flex;
  flex-direction: column;
}

/* 仅编辑器页（.editor-page）撑满 .main；内容流式的 .page 页面保持自然高度滚动 */
/* 内容流式的 .page 页面保持自然高度滚动 */
.main > :deep(.page) {
  flex: none;
}

/* 编辑器、预览页与发布页需要撑满可视高度（内部再自行滚动）。
   必须写在 .page 规则之后：两者特异性相同，靠源码顺序覆盖 */
.main > :deep(.editor-page),
.main > :deep(.preview-page),
.main > :deep(.publish-page) {
  flex: 1;
  min-height: 0;
}
</style>
