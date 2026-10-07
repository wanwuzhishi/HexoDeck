import { load as loadYaml } from 'js-yaml'

/**
 * 轻量 YAML 序列化：处理标量 / 数组 / 嵌套对象，包含「对象数组」
 * （如 links: [{ name, url, password }]）这类资源卡的常见形态。
 *
 * 不用 js-yaml 的 dump 是为了避免它给长字符串加折行、给日期加引号等噪音 ——
 * 写回 front-matter 时保持紧凑可读更符合手工编辑习惯。
 */
export function dumpYaml(obj: Record<string, unknown>, indent = 0): string {
  const lines: string[] = []
  for (const [k, v] of Object.entries(obj)) {
    lines.push(...dumpEntry(k, v, indent))
  }
  return lines.join('\n')
}

/** 单个键值对的 YAML 行（供 dumpYaml 递归复用） */
function dumpEntry(key: string, v: unknown, indent: number): string[] {
  const pad = '  '.repeat(indent)
  const lines: string[] = []

  if (v == null) {
    lines.push(`${pad}${key}:`)
    return lines
  }
  if (Array.isArray(v)) {
    if (!v.length) {
      lines.push(`${pad}${key}: []`)
      return lines
    }
    lines.push(`${pad}${key}:`)
    for (const item of v) {
      if (item != null && typeof item === 'object' && !Array.isArray(item)) {
        // 对象数组元素：首键紧跟 "- "，其余键与首键的正文列对齐。
        // 子块用 indent+1 生成（故首行前缀是 indent+1 级空白），
        // 这里把首行整体换成 "  - "，并把后续行的缩进补足一级。
        const subLines = dumpYaml(item as Record<string, unknown>, indent + 1).split('\n')
        const rest = subLines.slice(1).map((l) => (l.trim() ? `  ${l}` : l))
        lines.push(`${pad}  - ${subLines[0].trimStart()}`)
        lines.push(...rest)
      } else if (Array.isArray(item)) {
        // 嵌套数组（少见）：退化为行内 JSON，保证不丢数据
        lines.push(`${pad}  - ${JSON.stringify(item)}`)
      } else {
        lines.push(`${pad}  - ${scalarText(item)}`)
      }
    }
    return lines
  }
  if (typeof v === 'object') {
    // 嵌套对象：递归一层，其键用更深的缩进。
    // 注意对象数组元素的对齐依赖「子块首行无左侧空行」这一点。
    lines.push(`${pad}${key}:`)
    const sub = dumpYaml(v as Record<string, unknown>, indent + 1)
    if (sub) lines.push(sub)
    return lines
  }
  lines.push(`${pad}${key}: ${scalarText(v)}`)
  return lines
}

/** 标量值的 YAML 安全输出：常规字符裸输出，特殊字符加双引号 */
export function scalarText(v: unknown): string {
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  const s = String(v)
  if (s === '') return "''"
  // 纯数字字符串必须加引号：YAML 会把裸 1234 解析成 number，
  // 网盘密码、提取码这类含数字的值会因此丢失类型（如 "001234" 丢前导零）
  if (/^\d+(\.\d+)?$/.test(s)) return `"${s}"`
  if (/^[\w./:@^~+%=-]+$/.test(s)) return s
  return JSON.stringify(s)
}

/**
 * 序列化任意值（对象或顶层数组）为 YAML 文本。
 * 顶层数组用于 links 这类「字段值就是列表」的场景：
 *   - name: 蓝奏云
 *     url: ...
 */
export function dumpYamlValue(v: unknown): string {
  if (Array.isArray(v)) {
    return v.map((item) => dumpListItem(item, 0)).join('\n')
  }
  if (v != null && typeof v === 'object') {
    return dumpYaml(v as Record<string, unknown>)
  }
  return scalarText(v)
}

/** 序列化一个列表项（顶层数组用，不含键名） */
function dumpListItem(item: unknown, indent: number): string {
  const pad = '  '.repeat(indent)
  if (item != null && typeof item === 'object' && !Array.isArray(item)) {
    const subLines = dumpYaml(item as Record<string, unknown>, indent + 1).split('\n')
    const rest = subLines.slice(1).map((l) => (l.trim() ? `  ${l}` : l))
    return [`${pad}- ${subLines[0].trimStart()}`, ...rest].join('\n')
  }
  if (Array.isArray(item)) return `${pad}- ${JSON.stringify(item)}`
  return `${pad}- ${scalarText(item)}`
}

export interface ParsedField {
  ok: boolean
  /** 解析成功时的值（对象 / 数组 / 标量） */
  value?: unknown
  /** 解析失败时的可读错误 */
  error?: string
}

/**
 * 解析结构化参数字段的文本内容。
 * 允许空文本（表示不使用该参数）；顶层必须是映射或序列，不接受裸标量。
 */
export function parseYamlField(text: string): ParsedField {
  const trimmed = text.trim()
  if (!trimmed) return { ok: true, value: undefined }
  let parsed: unknown
  try {
    parsed = loadYaml(trimmed, { json: true })
  } catch (e) {
    return { ok: false, error: `YAML 语法错误：${(e as Error).message.split('\n')[0]}` }
  }
  if (parsed == null) return { ok: true, value: undefined }
  if (typeof parsed !== 'object') {
    return { ok: false, error: '结构化参数需要是键值对或列表（如需单个值请用「键值式」）' }
  }
  return { ok: true, value: parsed }
}

/**
 * 判断一个 front-matter 值是否应当按「结构化」参数处理。
 * 用于自动识别已有文章里的嵌套结构 —— 即使该键从未登记类型，
 * 打开时也不会被压成字符串而损坏。
 */
export function isStructuredValue(v: unknown): boolean {
  if (Array.isArray(v)) {
    // 纯标量数组（如 tags: [a, b]）按普通数组处理即可；
    // 含对象/嵌套数组的才算结构化
    return v.some((item) => item != null && typeof item === 'object')
  }
  return v != null && typeof v === 'object'
}
