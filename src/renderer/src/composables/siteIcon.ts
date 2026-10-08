import { computed, ref } from 'vue'
import { useSiteStore } from '../stores/site'
import { message } from './message'
import type { Result, SiteInfo } from '@shared/ipc'

/** 图标接受的扩展名（与主进程 asset-service 一致） */
const ICON_EXT_RE = /\.(ico|png|jpe?g|svg|webp|gif|bmp)$/i

/** 把图片文件读成 base64（IPC 需要纯 base64，去掉 data URL 前缀） */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result ?? '')
      resolve(result.includes(',') ? result.slice(result.indexOf(',') + 1) : result)
    }
    reader.onerror = () => reject(new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })
}

/** 无图标时用站点名首字占位 */
export function siteInitialOf(title?: string, name?: string): string {
  return (title || name || 'H').trim().charAt(0).toUpperCase()
}

/**
 * 站点图标（写入站点 source/，随站点走）。
 * 站点页与设置页的图标操作完全同构：选择 / 清除 / 拖拽上传，后端回传新的
 * SiteInfo，直接替换 store 即可让所有头像立即刷新。
 */
export function useSiteIcon(clearedMessage = '已恢复默认图标') {
  const siteStore = useSiteStore()

  const iconBusy = ref(false)
  const iconDragActive = ref(false)
  const siteInitial = computed(() => siteInitialOf(siteStore.site?.title, siteStore.site?.name))

  function applyIconResult(r: Result<SiteInfo>): void {
    if (r.ok && r.data) {
      siteStore.site = r.data
      message.success(r.data.iconPath ? '站点图标已更新' : clearedMessage)
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
      applyIconResult(await window.api.setSiteIcon(file.name, await fileToBase64(file)))
    } catch (e) {
      message.error((e as Error).message)
    } finally {
      iconBusy.value = false
    }
  }

  return {
    iconBusy,
    iconDragActive,
    siteInitial,
    pickIcon,
    clearIcon,
    onIconDragLeave,
    onIconDrop
  }
}