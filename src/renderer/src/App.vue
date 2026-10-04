<script setup lang="ts">
import { computed, h, onMounted, ref, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { darkTheme, dateZhCN, NIcon, zhCN } from 'naive-ui'
import type { MenuOption } from 'naive-ui'
import {
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
  SunnyOutline
} from '@vicons/ionicons5'
import { darkOverrides, lightOverrides } from './theme'
import { useSiteStore } from './stores/site'
import { useWorkspaceStore } from './stores/workspace'
import { useUiStore } from './stores/ui'
import InfoRail from './components/InfoRail.vue'
import TitleBar from './components/TitleBar.vue'
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

const menuOptions: MenuOption[] = [
  { label: '站点', key: '/', icon: renderIcon(HomeOutline) },
  { label: '文章', key: '/posts', icon: renderIcon(DocumentTextOutline) },
  { label: '页面', key: '/pages', icon: renderIcon(ReaderOutline) },
  { label: '统计', key: '/stats', icon: renderIcon(StatsChartOutline) },
  { label: '预览', key: '/preview', icon: renderIcon(EyeOutline) },
  { label: '发布', key: '/publish', icon: renderIcon(RocketOutline) },
  { label: '设置', key: '/settings', icon: renderIcon(SettingsOutline) }
]

const activeKey = computed(() =>
  route.path.startsWith('/editor') ? '/posts' : route.path.startsWith('/page-editor') ? '/pages' : route.path
)

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
  router.push(key)
}

onMounted(async () => {
  // 跟随系统主题：监听系统亮暗变化
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  ui.updateSystemDark(mq.matches)
  mq.addEventListener('change', (e) => ui.updateSystemDark(e.matches))

  workspace.init()
  const r = await siteStore.init()
  if (r && !r.ok) message.error(`自动打开上次站点失败：${r.error ?? '未知错误'}`)
})
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
