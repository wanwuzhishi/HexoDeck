import { defineStore } from 'pinia'
import type { CollectionDef, CollectionPostMeta } from '@shared/ipc'

export const useCollectionsStore = defineStore('collections', {
  state: () => ({
    defs: [] as CollectionDef[],
    /** 当前打开的文集的文章列表，键为文集 id */
    posts: {} as Record<string, CollectionPostMeta[]>
  }),
  actions: {
    async load(): Promise<void> {
      this.defs = await window.api.listCollections()
    },
    /** 找不到时返回 undefined（文集可能已被删除） */
    def(id: string): CollectionDef | undefined {
      return this.defs.find((c) => c.id === id)
    },
    async loadPosts(collectionId: string): Promise<CollectionPostMeta[]> {
      const list = await window.api.listCollectionPosts(collectionId)
      this.posts[collectionId] = list
      return list
    },
    postsOf(collectionId: string): CollectionPostMeta[] {
      return this.posts[collectionId] ?? []
    },
    async add(name: string, icon: string, dir: string): Promise<void> {
      const r = await window.api.addCollection(name, icon, dir)
      if (!r.ok) throw new Error(r.error ?? '添加文集失败')
      await this.load()
    },
    async update(id: string, patch: { name?: string; icon?: string }): Promise<void> {
      const r = await window.api.updateCollection(id, patch)
      if (!r.ok) throw new Error(r.error ?? '更新文集失败')
      await this.load()
    },
    async remove(id: string): Promise<void> {
      const r = await window.api.removeCollection(id)
      if (!r.ok) throw new Error(r.error ?? '移除文集失败')
      delete this.posts[id]
      await this.load()
    },
    async createPost(collectionId: string, title: string): Promise<CollectionPostMeta> {
      const r = await window.api.createCollectionPost(collectionId, title)
      if (!r.ok || !r.data) throw new Error(r.error ?? '创建文章失败')
      await this.loadPosts(collectionId)
      return r.data
    },
    async removePost(collectionId: string, id: string): Promise<void> {
      const r = await window.api.deleteCollectionPost(collectionId, id)
      if (!r.ok) throw new Error(r.error ?? '删除文章失败')
      await this.loadPosts(collectionId)
    }
  }
})
