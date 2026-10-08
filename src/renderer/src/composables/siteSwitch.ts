import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSiteStore } from '../stores/site'
import { useWorkspaceStore } from '../stores/workspace'
import { confirmDialog, message } from './message'

/**
 * 「快速预览」：预览已在运行则直达预览页，未运行先启动再跳转，
 * 避免只弹提示不跳转。站点概览与侧栏的入口共用此逻辑。
 */
export function useQuickPreview() {
  const ws = useWorkspaceStore()
  const router = useRouter()

  async function quickPreview(): Promise<void> {
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

  return { quickPreview }
}

/** 站点切换弹窗：站点概览页与侧栏共用同一套状态与切换/移除逻辑 */
export function useSiteSwitch() {
  const siteStore = useSiteStore()

  const showSwitch = ref(false)
  const switching = ref('')

  /** 「切换站点」只切换已添加的站点，不再走目录选择对话框 */
  async function openSwitch(): Promise<void> {
    await siteStore.loadRecents()
    showSwitch.value = true
  }

  async function switchTo(path: string): Promise<void> {
    // 点当前站点（或切换进行中）不重复打开
    if (path === siteStore.site?.path || switching.value) return
    switching.value = path
    try {
      const r = await siteStore.open(path)
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
    await siteStore.removeRecent(path)
    message.success('已从列表移除')
    if (!siteStore.recents.length) showSwitch.value = false
  }

  return { showSwitch, switching, openSwitch, switchTo, removeSite }
}