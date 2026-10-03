import { defineStore } from 'pinia'
import type { BuildCommand, BuildResult, UpdateStatus } from '@shared/ipc'
import { usePostsStore } from './posts'
import { message } from '../composables/message'

const MAX_LOG_LINES = 800

export const useWorkspaceStore = defineStore('workspace', {
  state: () => ({
    logs: [] as string[],
    building: null as BuildCommand | null,
    previewUrl: '',
    previewStarting: false,
    previewIncludeDrafts: true,
    /** 站点文件变更计数，用于驱动预览 iframe 自动刷新 */
    previewRefreshTick: 0,
    /** 自动更新状态（主进程推送） */
    updateStatus: { state: 'idle' } as UpdateStatus
  }),
  actions: {
    init(): void {
      window.api.onLog((line) => {
        this.logs.push(line)
        if (this.logs.length > MAX_LOG_LINES) this.logs.splice(0, this.logs.length - MAX_LOG_LINES)
      })
      window.api.onPreviewStopped(() => {
        this.previewUrl = ''
      })
      window.api.onFsChanged(() => {
        usePostsStore().load()
        if (this.previewUrl) this.previewRefreshTick++
      })
      window.api.onUpdateStatus((s) => {
        this.updateStatus = s
        if (s.state === 'available') message.info(`发现新版本 v${s.version}，正在下载…`)
        else if (s.state === 'downloaded')
          message.success(`新版本 v${s.version} 已下载完成，「应用设置」中可重启安装`)
      })
    },
    async runBuild(command: BuildCommand): Promise<BuildResult> {
      this.building = command
      try {
        return await window.api.runBuild(command)
      } finally {
        this.building = null
      }
    },
    async startPreview(): Promise<{ ok: boolean; error?: string }> {
      this.previewStarting = true
      try {
        const r = await window.api.startPreview(this.previewIncludeDrafts)
        if (r.ok && r.data) this.previewUrl = r.data
        return r
      } finally {
        this.previewStarting = false
      }
    },
    async stopPreview(): Promise<void> {
      await window.api.stopPreview()
      this.previewUrl = ''
    }
  }
})
