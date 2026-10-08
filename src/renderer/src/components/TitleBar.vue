<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { NIcon } from 'naive-ui'
import { CloseOutline, CopyOutline, RemoveOutline, SquareOutline } from '@vicons/ionicons5'
import { useSiteStore } from '../stores/site'
import appIcon from '../assets/app-icon.png'
import { siteInitialOf } from '../composables/siteIcon'

/** 自绘标题栏：替代原生标题栏，与应用玻璃拟态 UI 保持一致。
 *  窗口为 frame:false，拖拽、双击最大化、窗口按钮都需自行实现。
 *
 *  形态为悬浮玻璃卡片（与「站点」等卡片同材质/圆角/间距），
 *  最大化时自动取消外边距与圆角，避免与屏幕边缘之间留出缝隙。 */

const emit = defineEmits<{ 'maximized-change': [value: boolean] }>()

const route = useRoute()
const site = useSiteStore()

const maximized = ref(false)

let offMaximized: (() => void) | null = null

onMounted(async () => {
  maximized.value = await window.api.isWindowMaximized()
  emit('maximized-change', maximized.value)
  offMaximized = window.api.onWindowMaximized((v) => {
    maximized.value = v
    emit('maximized-change', v)
  })
})

onBeforeUnmount(() => {
  offMaximized?.()
})

/**
 * 左侧身份区：显示当前站点（有自定义图标用图标，无图标用站点名首字）。
 * 在站点页或未打开站点时回退为应用自身的图标与名称——
 * 站点页本身已在展示站点信息，标题栏再重复一次意义不大。
 */
const showSite = computed(() => !!site.site && route.name !== 'site')

const brandIcon = computed(() =>
  showSite.value && site.site?.iconUrl ? site.site.iconUrl : appIcon
)

const brandInitial = computed(() => siteInitialOf(site.site?.title, site.site?.name))

const brandName = computed(() => (showSite.value ? (site.site?.name ?? '') : 'HexoDeck'))

function minimize(): void {
  void window.api.minimizeWindow()
}

async function toggleMaximize(): Promise<void> {
  maximized.value = await window.api.toggleMaximizeWindow()
  emit('maximized-change', maximized.value)
}

function close(): void {
  void window.api.closeWindow()
}

/** 双击空白处切换最大化（与系统标题栏行为一致） */
function onDoubleClick(e: MouseEvent): void {
  if ((e.target as HTMLElement).closest('.tb-btn')) return
  void toggleMaximize()
}
</script>

<template>
  <!-- 整条为拖拽区，按钮单独标记 no-drag -->
  <header class="titlebar glass" :class="{ maximized }" @dblclick="onDoubleClick">
    <!-- 身份区：站点（或应用兜底）。自身不可拖动，避免误拖时点到 -->
    <div class="tb-brand" :class="{ site: showSite }">
      <img v-if="showSite && site.site?.iconUrl" class="tb-logo" :src="brandIcon" alt="" />
      <span v-else-if="showSite" class="tb-initial">{{ brandInitial }}</span>
      <img v-else class="tb-logo" :src="brandIcon" alt="" />
      <span class="tb-name" :title="showSite ? site.site?.path : 'HexoDeck'">{{ brandName }}</span>
    </div>

    <div class="tb-controls">
      <button class="tb-btn" type="button" title="最小化" @click="minimize">
        <n-icon :component="RemoveOutline" />
      </button>
      <button
        class="tb-btn"
        type="button"
        :title="maximized ? '向下还原' : '最大化'"
        @click="toggleMaximize"
      >
        <n-icon :component="maximized ? CopyOutline : SquareOutline" />
      </button>
      <button class="tb-btn danger" type="button" title="关闭" @click="close">
        <n-icon :component="CloseOutline" />
      </button>
    </div>
  </header>
</template>

<style scoped>
/* 悬浮玻璃卡片：材质、圆角、描边与 .glass 一致，左右及上侧留出与页面相同的 12px 间距 */
.titlebar {
  flex: none;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 4px 0 10px;
  /* 上/左右留出与外壳一致的外边距；下方单独给 14px——
     与页面内卡片间距同一节奏，避免和下方卡片贴在一起 */
  margin: 12px 12px 14px;
  box-sizing: border-box;
  /* 整条可拖动窗口 */
  -webkit-app-region: drag;
  user-select: none;
}

/* 身份区：图标 + 名称，过长时省略 */
.tb-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  /* 保留 hover 能力以显示路径 tooltip；但不能拖动窗口，否则会与拖拽冲突 */
  -webkit-app-region: no-drag;
}

.tb-logo {
  width: 20px;
  height: 20px;
  flex: none;
  border-radius: 6px;
  object-fit: cover;
}

/* 站点无自定义图标时的首字占位 */
.tb-initial {
  width: 20px;
  height: 20px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  color: var(--accent);
  background: var(--accent-soft);
  border: 1px solid var(--glass-border);
}

.tb-name {
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: 0.2px;
  color: var(--text-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 非站点页时更弱化，避免与应用自身信息抢注意力 */
.tb-brand:not(.site) .tb-name {
  color: var(--text-2);
}

/* 最大化：贴边铺满并取消圆角，避免与屏幕边缘之间出现缝隙 */
.titlebar.maximized {
  margin: 0;
  border-radius: 0;
  border-left: none;
  border-right: none;
  border-top: none;
}

.tb-controls {
  display: flex;
  align-items: center;
  gap: 2px;
  /* 按钮区不可拖动，否则点不动 */
  -webkit-app-region: no-drag;
}

.tb-btn {
  width: 42px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-2);
  font-size: 15px;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.tb-btn:hover {
  background: var(--accent-soft);
  color: var(--text-1);
}

/* 关闭按钮用系统惯例的危险色 */
.tb-btn.danger:hover {
  background: var(--danger);
  color: #fff;
}
</style>
