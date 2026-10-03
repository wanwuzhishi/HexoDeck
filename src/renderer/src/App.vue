<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { darkTheme, dateZhCN, NIcon, zhCN } from 'naive-ui'
import type { MenuOption } from 'naive-ui'
import { DocumentTextOutline, HomeOutline, RocketOutline } from '@vicons/ionicons5'
import { useSiteStore } from './stores/site'
import { useWorkspaceStore } from './stores/workspace'
import { message } from './composables/message'

const route = useRoute()
const router = useRouter()
const siteStore = useSiteStore()
const workspace = useWorkspaceStore()

const isDark = ref(localStorage.getItem('hexodeck-theme') === 'dark')
watch(
  isDark,
  (v) => localStorage.setItem('hexodeck-theme', v ? 'dark' : 'light')
)

const renderIcon = (icon: unknown) => (): ReturnType<typeof h> =>
  h(NIcon, null, { default: () => h(icon as never) })

const menuOptions: MenuOption[] = [
  { label: '站点', key: '/', icon: renderIcon(HomeOutline) },
  { label: '文章', key: '/posts', icon: renderIcon(DocumentTextOutline) },
  { label: '发布', key: '/publish', icon: renderIcon(RocketOutline) }
]

const activeKey = computed(() => (route.path.startsWith('/editor') ? '/posts' : route.path))

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
  <n-config-provider :theme="isDark ? darkTheme : null" :locale="zhCN" :date-locale="dateZhCN">
    <n-message-provider>
      <n-layout has-sider class="root">
        <n-layout-sider bordered :width="190" content-style="display:flex;flex-direction:column;height:100%">
          <div class="brand">
            <span class="brand-name">HexoDeck</span>
            <span class="brand-sub">Hexo 管理工具</span>
          </div>
          <n-menu :value="activeKey" :options="menuOptions" @update:value="onMenu" />
          <div class="sider-footer">
            <template v-if="siteStore.site">
              <div class="site-name" :title="siteStore.site.path">{{ siteStore.site.name }}</div>
            </template>
            <div v-else class="site-name muted">未打开站点</div>
          </div>
        </n-layout-sider>
        <n-layout class="main-layout">
          <router-view />
        </n-layout>
      </n-layout>
    </n-message-provider>
  </n-config-provider>
</template>

<style scoped>
.root {
  height: 100vh;
}
.brand {
  padding: 18px 20px 10px;
  display: flex;
  flex-direction: column;
}
.brand-name {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 0.5px;
}
.brand-sub {
  font-size: 12px;
  opacity: 0.6;
  margin-top: 2px;
}
.sider-footer {
  margin-top: auto;
  padding: 12px 20px;
  border-top: 1px solid rgba(128, 128, 128, 0.25);
}
.site-name {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.muted {
  opacity: 0.5;
  font-weight: 400;
}
.main-layout {
  height: 100vh;
  overflow: hidden;
}
</style>
