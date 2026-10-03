import { promises as fs } from 'fs'
import { join } from 'path'
import matter from 'gray-matter'

/** 单篇统计样本 */
interface PostSample {
  title: string
  date: Date | null
  tags: string[]
  categories: string[]
  words: number
  chars: number
  kind: 'post' | 'draft'
}

export interface CountItem {
  name: string
  count: number
}

export interface MonthPoint {
  /** YYYY-MM */
  month: string
  count: number
  words: number
}

export interface YearPoint {
  year: string
  count: number
  words: number
}

export interface SiteStats {
  /** 总量 */
  postCount: number
  draftCount: number
  totalWords: number
  totalChars: number
  /** 平均每篇字数（正式文章） */
  avgWords: number
  /** 最长/最短文章 */
  longest: { title: string; words: number } | null
  shortest: { title: string; words: number } | null
  /** 标签与分类 */
  tagCount: number
  categoryCount: number
  topTags: CountItem[]
  topCategories: CountItem[]
  /** 时间维度 */
  firstPostDate: string | null
  lastPostDate: string | null
  /** 写作天数（有文章发布的去重日期数） */
  activeDays: number
  busiestDay: { date: string; count: number } | null
  byYear: YearPoint[]
  /** 最近 12 个月趋势 */
  byMonth: MonthPoint[]
  /** 本周/本月新增 */
  thisWeek: number
  thisMonth: number
  /** 未分类/未打标签的文章数 */
  uncategorized: number
  untagged: number
}

const MD_EXT = /\.md$/i

/** 统计用的字符数：中英文都计入（去空白），比 hexo 的 wordCount 更适合中文博客 */
function countChars(content: string): number {
  return content.replace(/\s/g, '').length
}

/**
 * 字数口径（全应用统一）：
 * 汉字/假名/谚文按字计，拉丁文按单词计——这是中文博客通行的「字数」语义，
 * 与 hexo 内置的 wordCount（仅统计英文单词）不同，也不同于「字符数」。
 * 文章列表、侧栏统计、统计页共用此实现，避免同一应用出现两个数字。
 */
export function countWords(content: string): number {
  const cjk = (content.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) ?? []).length
  const latin = (
    content.replace(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g, ' ').match(/[A-Za-z0-9_'-]+/g) ?? []
  ).length
  return cjk + latin
}

async function readSamples(siteDir: string): Promise<PostSample[]> {
  const samples: PostSample[] = []
  const dirs: Array<{ dir: string; kind: 'post' | 'draft' }> = [
    { dir: join(siteDir, 'source', '_posts'), kind: 'post' },
    { dir: join(siteDir, 'source', '_drafts'), kind: 'draft' }
  ]

  for (const { dir, kind } of dirs) {
    let names: string[]
    try {
      names = await fs.readdir(dir)
    } catch {
      continue
    }
    for (const name of names) {
      if (!MD_EXT.test(name)) continue
      try {
        const filePath = join(dir, name)
        const raw = await fs.readFile(filePath, 'utf8')
        const parsed = matter(raw)
        const data = parsed.data as Record<string, unknown>
        const stat = await fs.stat(filePath)
        // 无 date 字段时回退文件修改时间（与 hexo 行为一致）
        const date =
          data.date instanceof Date
            ? data.date
            : typeof data.date === 'string'
              ? new Date(data.date)
              : stat.mtime
        samples.push({
          title: String(data.title ?? name.replace(MD_EXT, '')),
          date: Number.isNaN(date.getTime()) ? null : date,
          tags: toList(data.tags),
          categories: toList(data.categories),
          words: countWords(parsed.content),
          chars: countChars(parsed.content),
          kind
        })
      } catch {
        // 单文件解析失败跳过，不影响整体统计
      }
    }
  }
  return samples
}

function toList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String)
  if (v == null || v === '') return []
  return [String(v)]
}

function topN(map: Map<string, number>, n: number): CountItem[] {
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, n)
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 汇总站点统计（只统计正式文章用于趋势，草稿单列） */
export async function collectStats(siteDir: string): Promise<SiteStats> {
  const samples = await readSamples(siteDir)
  const posts = samples.filter((s) => s.kind === 'post')
  const drafts = samples.filter((s) => s.kind === 'draft')

  const totalWords = posts.reduce((s, p) => s + p.words, 0)
  const totalChars = posts.reduce((s, p) => s + p.chars, 0)

  const tagMap = new Map<string, number>()
  const catMap = new Map<string, number>()
  let uncategorized = 0
  let untagged = 0
  for (const p of posts) {
    if (!p.tags.length) untagged++
    else for (const t of p.tags) tagMap.set(t, (tagMap.get(t) ?? 0) + 1)
    if (!p.categories.length) uncategorized++
    else for (const c of p.categories) catMap.set(c, (catMap.get(c) ?? 0) + 1)
  }

  // 时间维度
  const dated = posts.filter((p) => p.date).sort((a, b) => a.date!.getTime() - b.date!.getTime())
  const firstPostDate = dated.length ? dayKey(dated[0].date!) : null
  const lastPostDate = dated.length ? dayKey(dated[dated.length - 1].date!) : null

  const dayMap = new Map<string, number>()
  const yearMap = new Map<string, { count: number; words: number }>()
  const monthMap = new Map<string, { count: number; words: number }>()
  for (const p of dated) {
    const dk = dayKey(p.date!)
    dayMap.set(dk, (dayMap.get(dk) ?? 0) + 1)

    const yk = String(p.date!.getFullYear())
    const y = yearMap.get(yk) ?? { count: 0, words: 0 }
    y.count++
    y.words += p.words
    yearMap.set(yk, y)

    const mk = monthKey(p.date!)
    const m = monthMap.get(mk) ?? { count: 0, words: 0 }
    m.count++
    m.words += p.words
    monthMap.set(mk, m)
  }

  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  // 最近 12 个月（含空月份，便于画连续趋势）
  const byMonth: MonthPoint[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = monthKey(d)
    const v = monthMap.get(key)
    byMonth.push({ month: key, count: v?.count ?? 0, words: v?.words ?? 0 })
  }

  const busiest = [...dayMap.entries()].sort((a, b) => b[1] - a[1])[0]

  const withWords = [...posts].sort((a, b) => b.words - a.words)

  return {
    postCount: posts.length,
    draftCount: drafts.length,
    totalWords,
    totalChars,
    avgWords: posts.length ? Math.round(totalWords / posts.length) : 0,
    longest: withWords.length ? { title: withWords[0].title, words: withWords[0].words } : null,
    shortest:
      withWords.length > 0
        ? { title: withWords[withWords.length - 1].title, words: withWords[withWords.length - 1].words }
        : null,
    tagCount: tagMap.size,
    categoryCount: catMap.size,
    topTags: topN(tagMap, 10),
    topCategories: topN(catMap, 8),
    firstPostDate,
    lastPostDate,
    activeDays: dayMap.size,
    busiestDay: busiest ? { date: busiest[0], count: busiest[1] } : null,
    byYear: [...yearMap.entries()]
      .map(([year, v]) => ({ year, count: v.count, words: v.words }))
      .sort((a, b) => a.year.localeCompare(b.year)),
    byMonth,
    thisWeek: dated.filter((p) => p.date! >= weekAgo).length,
    thisMonth: dated.filter((p) => p.date! >= monthStart).length,
    uncategorized,
    untagged
  }
}
