import { promises as fs } from 'fs'
import { existsSync } from 'fs'
import { join, relative, resolve, sep } from 'path'
import matter from 'gray-matter'
import { load as loadYaml } from 'js-yaml'
import type { PageCreateOptions, PageDetail, PageMeta, PagePatch } from '@shared/ipc'
import { MD_EXT, formatDate, titleFrom, toDate } from './content'
import { countWords } from './stats-service'

/** 递归扫描时跳过的目录名 */
const SKIP_DIRS = new Set(['node_modules', '.git', '.github', '.deploy_git'])

function sourceDir(siteDir: string): string {
  return join(siteDir, 'source')
}

/**
 * 把页面 id（相对 source 的路径，如 'about/index.md'）解析为绝对路径。
 * 必须校验解析结果仍落在 source/ 内，否则 '../' 之类的 id 会读写到站点之外。
 */
function idToPath(siteDir: string, id: string): string {
  const source = resolve(sourceDir(siteDir))
  const abs = resolve(source, id)
  if (abs !== source && !abs.startsWith(source + sep)) {
    throw new Error(`非法的页面路径：${id}`)
  }
  if (!MD_EXT.test(abs)) throw new Error(`页面必须是 .md 文件：${id}`)
  return abs
}

/** 页面 id 归一化为相对 source 的 posix 风格路径，保证跨平台一致 */
function toId(siteDir: string, absPath: string): string {
  return relative(resolve(sourceDir(siteDir)), absPath).split(sep).join('/')
}

function metaFrom(
  id: string,
  content: string,
  data: Record<string, unknown>,
  mtimeMs?: number
): PageMeta {
  return {
    id,
    title: titleFrom(id, data),
    date: toDate(data.date, mtimeMs),
    wordCount: countWords(content)
  }
}

/** 递归收集 source/ 下的页面文件（跳过文章目录与下划线目录） */
async function collectPageFiles(dir: string, out: string[] = []): Promise<string[]> {
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const name = entry.name
    // 下划线开头的目录（_posts/_drafts/_data 等）与构建产物目录都不是页面
    if (entry.isDirectory()) {
      if (name.startsWith('_') || name.startsWith('.') || SKIP_DIRS.has(name)) continue
      await collectPageFiles(join(dir, name), out)
    } else if (MD_EXT.test(name)) {
      out.push(join(dir, name))
    }
  }
  return out
}

export async function listPages(siteDir: string): Promise<PageMeta[]> {
  const source = sourceDir(siteDir)
  const files = await collectPageFiles(source)
  const metas: PageMeta[] = []
  for (const file of files) {
    try {
      const raw = await fs.readFile(file, 'utf8')
      const stat = await fs.stat(file)
      const parsed = matter(raw)
      metas.push(
        metaFrom(toId(siteDir, file), parsed.content, parsed.data as Record<string, unknown>, stat.mtimeMs)
      )
    } catch {
      // 单个文件解析失败不阻塞列表
    }
  }
  return metas.sort((a, b) => a.id.localeCompare(b.id))
}

export async function readPage(siteDir: string, id: string): Promise<PageDetail> {
  const filePath = idToPath(siteDir, id)
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

/** 把用户填写的路径规整为合法 id：去掉开头的 /、扩展名，清理非法字符 */
function normalizeTargetPath(path: string): string {
  const cleaned = path
    .trim()
    .replace(/^[\\/]+/, '')
    .replace(MD_EXT, '')
    .replace(/[\\/]+/g, '/')
  const segments = cleaned
    .split('/')
    .map((s) => s.replace(/[:*?"<>|\r\n\t]+/g, '').trim())
    .filter((s) => s && s !== '.' && s !== '..')
  return segments.join('/')
}

/**
 * 新建页面：路径即文件夹，在 source/ 下创建「<页面路径>/index.md」。
 * about、about/、about/index 都规整为文件夹 about；多级路径（docs/guide）保留层级。
 * 表单里的标题与参数 YAML 若有重合（如参数里也写了 title）自动去重，不提示：
 * 标题以表单为准；参数里写了 date 则沿用参数的，否则自动填当前时间。
 */
export async function createPage(siteDir: string, options: PageCreateOptions): Promise<PageMeta> {
  const title = options.title.trim()
  if (!title) throw new Error('页面标题不能为空')

  const folder = normalizeTargetPath(options.path || title)
    .replace(/(^|\/)index$/i, '')
    .replace(/\/+$/, '')
  if (!folder) throw new Error('页面路径不合法')

  const id = `${folder}/index.md`
  const filePath = idToPath(siteDir, id)
  if (existsSync(filePath)) throw new Error(`页面已存在：${id}`)

  // 初始参数：优先使用用户填写的 YAML，解析失败直接报错（避免写入坏文件）。
  // 与表单字段重合的键静默去重：title 以表单为准，date 以参数为准（表单不填日期）。
  const extra = parseYamlObject(options.frontMatterYaml ?? '')
  delete extra.title
  const yamlDate = extra.date
  delete extra.date

  const data: Record<string, unknown> = {
    ...extra,
    title,
    date: yamlDate ?? formatDate(new Date())
  }

  const body = options.content ?? '\n'
  const serialized = matter.stringify(body, data)
  await fs.mkdir(join(filePath, '..'), { recursive: true })
  await fs.writeFile(filePath, serialized, 'utf8')

  const parsed = matter(serialized)
  return metaFrom(id, parsed.content, parsed.data as Record<string, unknown>)
}

/** 解析 front-matter YAML：空内容返回空对象；非对象或语法错误时抛出可读错误 */
function parseYamlObject(text: string): Record<string, unknown> {
  if (!text.trim()) return {}
  let parsed: unknown
  try {
    parsed = loadYaml(text, { json: true })
  } catch (e) {
    throw new Error(`YAML 语法错误：${(e as Error).message.split('\n')[0]}`)
  }
  if (parsed == null) return {}
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('参数必须是键值对形式（YAML 映射）')
  }
  return parsed as Record<string, unknown>
}

export async function savePage(siteDir: string, id: string, patch: PagePatch): Promise<void> {
  const filePath = idToPath(siteDir, id)
  const raw = await fs.readFile(filePath, 'utf8')
  const parsed = matter(raw)
  const data = { ...(parsed.data as Record<string, unknown>) }

  if (patch.title !== undefined) data.title = patch.title
  if (patch.date !== undefined) data.date = patch.date

  // 自定义 front-matter 字段：null 表示删除该键
  if (patch.extra) {
    for (const [key, value] of Object.entries(patch.extra)) {
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

export async function deletePage(
  siteDir: string,
  id: string,
  toTrash: (path: string) => Promise<void>
): Promise<void> {
  const filePath = idToPath(siteDir, id)
  try {
    await toTrash(filePath)
  } catch {
    await fs.rm(filePath, { force: true })
  }
}
