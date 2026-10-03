<script setup lang="ts">
import { computed, h, onMounted, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { darkTheme, dateZhCN, NIcon, zhCN } from 'naive-ui'
import type { MenuOption } from 'naive-ui'
import { DocumentTextOutline, HomeOutline, RocketOutline, SettingsOutline } from '@vicons/ionicons5'
import { darkOverrides, lightOverrides } from './theme'
import { useSiteStore } from './stores/site'
import { useWorkspaceStore } from './stores/workspace'
import { useUiStore } from './stores/ui'
import InfoRail from './components/InfoRail.vue'
import appIcon from './assets/app-icon.png'
import { message, setDiscreteTheme } from './composables/message'

const route = useRoute()
const router = useRouter()
const siteStore = useSiteStore()
const workspace = useWorkspaceStore()
const ui = useUiStore()

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
  { label: '发布', key: '/publish', icon: renderIcon(RocketOutline) },
  { label: '设置', key: '/settings', icon: renderIcon(SettingsOutline) }
]

const activeKey = computed(() => (route.path.startsWith('/editor') ? '/posts' : route.path))

// 编辑器页聚焦写作，隐藏右侧信息栏
const showRail = computed(() => route.name !== 'editor')

function onMenu(key: string): void {
  router.push(key)
}

onMounted(async () => {
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
            <n-button
              quaternary
              circle
              :size="ui.navCollapsed ? 'tiny' : 'small'"
              :title="ui.isDark ? '切换到亮色主题' : '切换到暗色主题'"
              @click="ui.toggle"
            >
              {{ ui.isDark ? '☾' : '☀' }}
            </n-button>
            <span v-if="!ui.navCollapsed" class="foot-site" :title="siteStore.site?.path">
              {{ siteStore.site?.name ?? '未打开站点' }}
            </span>
            <n-button
              quaternary
              circle
              :size="ui.navCollapsed ? 'tiny' : 'small'"
              :title="ui.navCollapsed ? '展开导航' : '折叠导航'"
              @click="ui.toggleNav"
            >
              {{ ui.navCollapsed ? '»' : '«' }}
            </n-button>
          </div>
        </aside>

        <main class="main">
          <router-view />
        </main>

        <InfoRail v-if="showRail" class="rail" />
      </div>
    </n-message-provider>
  </n-config-provider>
</template>

<style scoped>
.shell {
  display: flex;
  gap: 12px;
  height: 100vh;
  padding: 12px;
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

/* 走内边距而非伪元素偏移来保证图标与文字位置舒适 */
.sider :deep(.n-menu-item-content-header) {
  padding-left: 4px;
}

.sider :deep(.n-menu-item-content .n-menu-item-content__icon) {
  margin-left: 10px;
}

.sider :deep(.n-menu-item-content--selected) {
  background: var(--accent-soft) !important;
  box-shadow: inset 0 0 0 1px var(--glass-border), 0 0 10px var(--accent-soft);
}

.sider-foot {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-top: 10px;
  border-top: 1px solid var(--glass-border);
}

/* 收起态：底部按钮居中 */
.sider.collapsed .sider-foot {
  justify-content: center;
}

.foot-site {
  flex: 1;
  font-size: 12px;
  color: var(--text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.main {
  flex: 1;
  min-width: 0;
  overflow: auto;
  border-radius: var(--radius-lg);
}
</style>
