import { defineStore } from 'pinia'
import type { PageCreateOptions, PageMeta } from '@shared/ipc'

export const usePagesStore = defineStore('pages', {
  state: () => ({
    pages: [] as PageMeta[],
    loaded: false,
    keyword: ''
  }),
  getters: {
    filtered(state): PageMeta[] {
      const kw = state.keyword.trim().toLowerCase()
      if (!kw) return state.pages
      return state.pages.filter(
        (p) => p.title.toLowerCase().includes(kw) || p.id.toLowerCase().includes(kw)
      )
    }
  },
  actions: {
    async load(): Promise<void> {
      this.pages = await window.api.listPages()
      this.loaded = true
    },
    async create(options: PageCreateOptions): Promise<PageMeta> {
      const r = await window.api.createPage(options)
      if (!r.ok || !r.data) throw new Error(r.error ?? '创建页面失败')
      await this.load()
      return r.data
    },
    async remove(id: string): Promise<void> {
      const r = await window.api.deletePage(id)
      if (!r.ok) throw new Error(r.error ?? '删除页面失败')
      await this.load()
    }
  }
})
