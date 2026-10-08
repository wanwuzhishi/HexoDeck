import { basename } from 'path'

/** Markdown 文件扩展名（大小写不敏感），各服务共用 */
export const MD_EXT = /\.md$/i

export function formatDate(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/**
 * front-matter 的 date 字段归一化为字符串；缺失时回退文件修改时间（与 hexo 行为一致）。
 */
export function toDate(v: unknown, mtimeMs?: number): string {
  if (v != null) return v instanceof Date ? formatDate(v) : String(v)
  return mtimeMs != null ? formatDate(new Date(mtimeMs)) : ''
}

/** 标题归一化为可用作文件名的片段，非法字符剔除、空标题兜底 */
export function sanitizeTitle(title: string): string {
  const cleaned = title
    .trim()
    .replace(/[\\/:*?"<>|\r\n\t]+/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 80)
  return cleaned || 'untitled'
}

/** front-matter 的 tags/categories 归一化为字符串数组（兼容单值与空值） */
export function toStringList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String)
  if (v == null || v === '') return []
  return [String(v)]
}

/** front-matter 无 title 时用文件名兜底 */
export function titleFrom(id: string, data: Record<string, unknown>): string {
  return String(data.title ?? basename(id).replace(MD_EXT, ''))
}

/** hexo new 默认脚手架：带 tags 空键 */
export const SCAFFOLD_WITH_TAGS = `---
title: {{ title }}
date: {{ date }}
tags:
---

`

/** 页面脚手架：无 tags */
export const SCAFFOLD_BARE = `---
title: {{ title }}
date: {{ date }}
---

`