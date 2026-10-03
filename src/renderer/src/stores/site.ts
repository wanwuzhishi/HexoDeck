import { defineStore } from 'pinia'
import type { RecentSite, SiteInfo } from '@shared/ipc'

export const useSiteStore = defineStore('site', {
  state: () => ({
    site: null as SiteInfo | null,
    recents: [] as RecentSite[],
    loading: false
  }),
  actions: {
    async init(): Promise<{ ok: boolean; error?: string } | null> {
      this.recents = await window.api.listRecentSites()
      const last = this.recents[0]
      if (!last) return null
      return this.open(last.path)
    },
    async open(path: string): Promise<{ ok: boolean; error?: string }> {
      this.loading = true
      try {
        const r = await window.api.openSite(path)
        if (r.ok && r.data) {
          this.site = r.data
          this.recents = await window.api.listRecentSites()
        }
        return r
      } finally {
        this.loading = false
      }
    },
    async openViaDialog(): Promise<void> {
      const info = await window.api.openSiteDialog()
      if (info) {
        this.site = info
        this.recents = await window.api.listRecentSites()
      }
    },
    async createSite(name: string, parentDir: string): Promise<{ ok: boolean; error?: string }> {
      this.loading = true
      try {
        const r = await window.api.createSite(name, parentDir)
        if (r.ok && r.data) {
          this.site = r.data
          this.recents = await window.api.listRecentSites()
        }
        return r
      } finally {
        this.loading = false
      }
    },
    async close(): Promise<void> {
      await window.api.closeSite()
      this.site = null
    },
    async removeRecent(path: string): Promise<void> {
      await window.api.removeRecentSite(path)
      this.recents = await window.api.listRecentSites()
    },
    /** 重新拉取最近站点列表（站点管理面板的「刷新」） */
    async loadRecents(): Promise<void> {
      this.recents = await window.api.listRecentSites()
    }
  }
})
