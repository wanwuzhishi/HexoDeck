import { promises as fs } from 'fs'
import { existsSync } from 'fs'
import { basename, join, relative, resolve, sep } from 'path'
import matter from 'gray-matter'
import type { CollectionDef, CollectionPostDetail, CollectionPostMeta, CollectionPostPatch } from '@shared/ipc'
import { formatDate } from './site-service'
import { countWords } from './stats-service'

const MD_EXT = /\.md$/i
const SKIP_DIRS = new Set(['node_modules', '.git'])

/** 解析文集目录：必须在站点根目录内（防穿越），返回绝对路径 */
function resolveDir(siteDir: string, coll: CollectionDef): string {
  const root = resolve(siteDir)
  const abs = resolve(root, coll.dir)
  if (abs !== root && !abs.startsWith(root + sep)) {
    throw new Error(`文集目录必须在站点根目录内：${coll.dir}`)
  }
  return abs
}

/** 解析文集内文章的相对 id：必须是文集目录内的 .md（防穿越） */
function resolveFile(collDir: string, id: string): string {
  const base = resolve(collDir)
  const abs = resolve(base, id)
  if (abs !== base && !abs.startsWith(base + sep)) {
    throw new Error(`非法的文章路径：${id}`)
  }
  if (!MD_EXT.test(abs)) throw new Error(`文章必须是 .md 文件：${id}`)
  return abs
}

function toId(collDir: string, absPath: string): string {
  return relative(resolve(collDir), absPath).split(sep).join('/')
}

function toDate(v: unknown, mtimeMs?: number): string {
  if (v != null) return v instanceof Date ? formatDate(v) : String(v)
  return mtimeMs != null ? formatDate(new Date(mtimeMs)) : ''
}

function metaFrom(
  id: string,
  content: string,
  data: Record<string, unknown>,
  mtimeMs?: number
): CollectionPostMeta {
  return {
    id,
    title: String(data.title ?? basename(id).replace(MD_EXT, '')),
    date: toDate(data.date, mtimeMs),
    wordCount: countWords(content)
  }
}

/** 递归收集文集目录下的 .md 文件 */
async function collectFiles(dir: string, out: string[] = []): Promise<string[]> {
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
      await collectFiles(join(dir, entry.name), out)
    } else if (MD_EXT.test(entry.name)) {
      out.push(join(dir, entry.name))
    }
  }
  return out
}

export async function listCollectionPosts(
  siteDir: string,
  coll: CollectionDef
): Promise<CollectionPostMeta[]> {
  const collDir = resolveDir(siteDir, coll)
  const files = await collectFiles(collDir)
  const metas: CollectionPostMeta[] = []
  for (const file of files) {
    try {
      const raw = await fs.readFile(file, 'utf8')
      const stat = await fs.stat(file)
      const parsed = matter(raw)
      metas.push(
        metaFrom(toId(collDir, file), parsed.content, parsed.data as Record<string, unknown>, stat.mtimeMs)
      )
    } catch {
      // 单个文件解析失败不阻塞列表
    }
  }
  return metas.sort((a, b) => (a.date < b.date ? 1 : -1))
}

export async function readCollectionPost(
  siteDir: string,
  coll: CollectionDef,
  id: string
): Promise<CollectionPostDetail> {
  const filePath = resolveFile(resolveDir(siteDir, coll), id)
  const raw = await fs.readFile(filePath, 'utf8')
  const stat = await fs.stat(filePath)
  const parsed = matter(raw)
  const data = parsed.data as Record<string, unknown>
  return {
    ...metaFrom(id, parsed.content, data, stat.mtimeMs),
    raw,
    content: parsed.content,
    frontMatter: data
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

export async function createCollectionPost(
  siteDir: string,
  coll: CollectionDef,
  title: string
): Promise<CollectionPostMeta> {
  const name = title.trim()
  if (!name) throw new Error('标题不能为空')

  const collDir = resolveDir(siteDir, coll)
  const base = sanitizeTitle(name)
  let filename = `${base}.md`
  let n = 1
  while (existsSync(join(collDir, filename))) {
    filename = `${base}-${n++}.md`
  }

  const data = { title: name, date: formatDate(new Date()) }
  const serialized = matter.stringify('\n', data)
  const filePath = join(collDir, filename)
  await fs.mkdir(join(filePath, '..'), { recursive: true })
  await fs.writeFile(filePath, serialized, 'utf8')

  const parsed = matter(serialized)
  return metaFrom(filename, parsed.content, parsed.data as Record<string, unknown>)
}

export async function saveCollectionPost(
  siteDir: string,
  coll: CollectionDef,
  id: string,
  patch: CollectionPostPatch
): Promise<void> {
  const filePath = resolveFile(resolveDir(siteDir, coll), id)
  const raw = await fs.readFile(filePath, 'utf8')
  const parsed = matter(raw)
  const data = { ...(parsed.data as Record<string, unknown>) }

  if (patch.title !== undefined) data.title = patch.title
  if (patch.date !== undefined) data.date = patch.date

  if (patch.extra) {
    for (const [key, value] of Object.entries(patch.extra)) {
      // 内置字段（title/date）由表单维护，不被自定义参数覆盖
      if (key === 'title' || key === 'date') continue
      if (value === null || value === '') delete data[key]
      else data[key] = value
    }
  }

  const content = patch.content !== undefined ? patch.content : parsed.content
  let serialized = matter.stringify(content, data)
  if (raw.includes('\r\n')) serialized = serialized.replace(/\r?\n/g, '\r\n')
  await fs.writeFile(filePath, serialized, 'utf8')
}

export async function deleteCollectionPost(
  siteDir: string,
  coll: CollectionDef,
  id: string,
  toTrash: (path: string) => Promise<void>
): Promise<void> {
  const filePath = resolveFile(resolveDir(siteDir, coll), id)
  try {
    await toTrash(filePath)
  } catch {
    await fs.rm(filePath, { force: true })
  }
}
