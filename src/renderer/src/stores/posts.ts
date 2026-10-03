import { defineStore } from 'pinia'
import type { PostKind, PostMeta } from '@shared/ipc'

export const usePostsStore = defineStore('posts', {
  state: () => ({
    posts: [] as PostMeta[],
    loaded: false,
    keyword: ''
  }),
  getters: {
    filtered(state): PostMeta[] {
      const kw = state.keyword.trim().toLowerCase()
      if (!kw) return state.posts
      return state.posts.filter(
        (p) =>
          p.title.toLowerCase().includes(kw) ||
          p.tags.some((t) => t.toLowerCase().includes(kw)) ||
          p.categories.some((c) => c.toLowerCase().includes(kw))
      )
    },
    allTags(state): string[] {
      return [...new Set(state.posts.flatMap((p) => p.tags))].sort()
    },
    allCategories(state): string[] {
      return [...new Set(state.posts.flatMap((p) => p.categories))].sort()
    }
  },
  actions: {
    async load(): Promise<void> {
      this.posts = await window.api.listPosts()
      this.loaded = true
    },
    async create(kind: PostKind, title: string): Promise<PostMeta | null> {
      const r = await window.api.createPost(kind, title)
      if (r.ok && r.data) {
        await this.load()
        return r.data
      }
      throw new Error(r.error ?? '创建失败')
    },
    async remove(id: string): Promise<void> {
      const r = await window.api.deletePost(id)
      if (!r.ok) throw new Error(r.error ?? '删除失败')
      await this.load()
    },
    async publish(id: string): Promise<PostMeta | null> {
      const r = await window.api.publishDraft(id)
      if (r.ok && r.data) {
        await this.load()
        return r.data
      }
      throw new Error(r.error ?? '发布失败')
    }
  }
})
