import { promises as fs } from 'fs'
import { existsSync } from 'fs'
import { basename, join } from 'path'
import matter from 'gray-matter'
import type { PostDetail, PostKind, PostMeta, PostPatch } from '@shared/ipc'
import { formatDate } from './site-service'

const POSTS_DIR = '_posts'
const DRAFTS_DIR = '_drafts'
const MD_EXT = /\.md$/i

function sourceDir(siteDir: string, kind: PostKind): string {
  return join(siteDir, 'source', kind === 'post' ? POSTS_DIR : DRAFTS_DIR)
}

function idToPath(siteDir: string, id: string): string {
  // id 形如 '_posts/foo.md'，阻止路径穿越
  const parts = id.split(/[\\/]/)
  if (parts[0] !== POSTS_DIR && parts[0] !== DRAFTS_DIR) throw new Error(`非法的文章 id：${id}`)
  return join(siteDir, 'source', ...parts)
}

function pathToId(kind: PostKind, filename: string): string {
  return `${kind === 'post' ? POSTS_DIR : DRAFTS_DIR}/${filename}`
}

function toTags(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String)
  if (v == null || v === '') return []
  return [String(v)]
}

/** 分类可能是嵌套数组（多级分类），扁平化为一层显示 */
function toCategories(v: unknown): string[] {
  const flat: string[] = []
  const walk = (x: unknown): void => {
    if (Array.isArray(x)) x.forEach(walk)
    else if (x != null && x !== '') flat.push(String(x))
  }
  walk(v)
  return flat
}

function metaFrom(
  id: string,
  kind: PostKind,
  raw: string,
  content: string,
  data: Record<string, unknown>,
  mtimeMs?: number
): PostMeta {
  // front-matter 无 date 时回退到文件修改时间（与 hexo 生成行为一致）
  const date =
    data.date != null
      ? data.date instanceof Date
        ? formatDate(data.date)
        : String(data.date)
      : mtimeMs != null
        ? formatDate(new Date(mtimeMs))
        : ''
  return {
    id,
    kind,
    title: String(data.title ?? basename(id).replace(MD_EXT, '')),
    date,
    tags: toTags(data.tags),
    categories: toCategories(data.categories),
    wordCount: content.replace(/\s/g, '').length
  }
}

async function listKind(siteDir: string, kind: PostKind): Promise<PostMeta[]> {
  const dir = sourceDir(siteDir, kind)
  let names: string[]
  try {
    names = await fs.readdir(dir)
  } catch {
    return []
  }
  const metas: PostMeta[] = []
  for (const name of names) {
    if (!MD_EXT.test(name)) continue
    try {
      const filePath = join(dir, name)
      const raw = await fs.readFile(filePath, 'utf8')
      const stat = await fs.stat(filePath)
      const parsed = matter(raw)
      metas.push(
        metaFrom(
          pathToId(kind, name),
          kind,
          raw,
          parsed.content,
          parsed.data as Record<string, unknown>,
          stat.mtimeMs
        )
      )
    } catch {
      // 单个文件解析失败不阻塞列表，跳过
    }
  }
  return metas
}

export async function listPosts(siteDir: string): Promise<PostMeta[]> {
  const posts = await listKind(siteDir, 'post')
  const drafts = await listKind(siteDir, 'draft')
  return [...posts, ...drafts].sort((a, b) => (a.date < b.date ? 1 : -1))
}

export async function readPost(siteDir: string, id: string): Promise<PostDetail> {
  const filePath = idToPath(siteDir, id)
  const raw = await fs.readFile(filePath, 'utf8')
  const stat = await fs.stat(filePath)
  const parsed = matter(raw)
  const kind: PostKind = id.startsWith(POSTS_DIR) ? 'post' : 'draft'
  const data = parsed.data as Record<string, unknown>
  return {
    ...metaFrom(id, kind, raw, parsed.content, data, stat.mtimeMs),
    raw,
    content: parsed.content
  }
}

function sanitizeTitle(title: string): string {
  const cleaned = title
    .trim()
    .replace(/[\\/:*?"<>|\r\n\t]+/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 80)
  return cleaned || 'untitled'
}

export async function createPost(siteDir: string, kind: PostKind, title: string): Promise<PostMeta> {
  const base = sanitizeTitle(title)
  const dir = sourceDir(siteDir, kind)
  await fs.mkdir(dir, { recursive: true })

  let filename = `${base}.md`
  let n = 1
  while (existsSync(join(dir, filename))) {
    filename = `${base}-${n++}.md`
  }

  // 优先使用站点自带脚手架，保持与 hexo new 一致
  const scaffoldPath = join(siteDir, 'scaffolds', `${kind}.md`)
  let body: string
  try {
    body = await fs.readFile(scaffoldPath, 'utf8')
  } catch {
    body = kind === 'draft' ? SCAFFOLD_FALLBACK : SCAFFOLD_FALLBACK
  }
  const content = body
    .replace(/\{\{\s*title\s*\}\}/g, title)
    .replace(/\{\{\s*date\s*\}\}/g, formatDate(new Date()))

  const filePath = join(dir, filename)
  await fs.writeFile(filePath, content, 'utf8')
  const parsed = matter(content)
  return metaFrom(
    pathToId(kind, filename),
    kind,
    content,
    parsed.content,
    parsed.data as Record<string, unknown>
  )
}

const SCAFFOLD_FALLBACK = `---
title: {{ title }}
date: {{ date }}
tags:
---

`

export async function savePost(siteDir: string, id: string, patch: PostPatch): Promise<void> {
  const filePath = idToPath(siteDir, id)
  const raw = await fs.readFile(filePath, 'utf8')
  const parsed = matter(raw)
  const data = { ...(parsed.data as Record<string, unknown>) }

  if (patch.title !== undefined) data.title = patch.title
  if (patch.date !== undefined) data.date = patch.date
  if (patch.tags !== undefined) data.tags = patch.tags.length ? patch.tags : null
  if (patch.categories !== undefined) data.categories = patch.categories.length ? patch.categories : null

  const content = patch.content !== undefined ? patch.content : parsed.content
  let serialized = matter.stringify(content, data)

  // 保持原文件的换行风格
  if (raw.includes('\r\n')) serialized = serialized.replace(/\r?\n/g, '\r\n')
  await fs.writeFile(filePath, serialized, 'utf8')
}

export async function deletePost(
  siteDir: string,
  id: string,
  toTrash: (path: string) => Promise<void>
): Promise<void> {
  const filePath = idToPath(siteDir, id)
  try {
    await toTrash(filePath) // 优先移入回收站，可恢复
  } catch {
    await fs.rm(filePath, { force: true })
  }
}

export async function publishDraft(siteDir: string, id: string): Promise<PostMeta> {
  const from = idToPath(siteDir, id)
  const filename = basename(from)
  const to = join(sourceDir(siteDir, 'post'), filename)
  try {
    await fs.access(to)
    throw new Error(`正式文章中已存在同名文件：${filename}`)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
  }
  await fs.rename(from, to)
  const detail = await readPost(siteDir, pathToId('post', filename))
  return detail
}
