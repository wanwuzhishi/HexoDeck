import { ref, computed } from 'vue'
import { useSiteStore } from '../stores/site'

/** 自定义 front-matter 参数（文章与页面共用同一套收集 / 编辑 / 登记逻辑） */
export interface CustomField {
  key: string
  value: string
  /** 界面显示名（中文），未登记时等于 key */
  label?: string
}

/** 站点登记的自定义参数：key 为 front-matter 键名，label 为界面显示名 */
export interface SiteField {
  key: string
  label: string
}

const SITE_FIELDS_KEY = 'hexodeck-custom-fields'
/** 合法的 YAML 键名 */
export const FIELD_NAME_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/

type SiteFieldMap = Record<string, SiteField[]>

/** 兼容旧版纯字符串数组（无中文名时以键名代显示） */
function normalizeSiteFields(raw: unknown): SiteField[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      if (typeof item === 'string') return { key: item, label: item }
      const o = item as { key?: unknown; label?: unknown }
      const key = typeof o.key === 'string' ? o.key : ''
      if (!key) return null
      const label = typeof o.label === 'string' && o.label ? o.label : key
      return { key, label }
    })
    .filter((f): f is SiteField => f !== null)
}

function loadSiteFieldMap(): SiteFieldMap {
  try {
    const parsed = JSON.parse(localStorage.getItem(SITE_FIELDS_KEY) ?? '{}') as Record<string, unknown>
    const map: SiteFieldMap = {}
    for (const [path, raw] of Object.entries(parsed)) {
      map[path] = normalizeSiteFields(raw)
    }
    return map
  } catch {
    return {}
  }
}

function saveSiteFields(sitePath: string, fields: SiteField[]): void {
  const map = loadSiteFieldMap()
  if (fields.length) map[sitePath] = fields
  else delete map[sitePath]
  localStorage.setItem(SITE_FIELDS_KEY, JSON.stringify(map))
}

/** 值可能是数组/对象，统一转为可读字符串回填输入框 */
export function toFieldValue(v: unknown): string {
  if (v == null) return ''
  if (Array.isArray(v)) return v.map(String).join(', ')
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

export interface UseCustomFieldsOptions {
  /** 由调用方维护的内置字段（不参与自定义参数收集） */
  builtinKeys: string[]
  /** 收集字段后、值变化时的回调（用于刷新脏检查快照） */
  onSnapshot?: () => void
}

/**
 * 自定义参数收集与编辑（文章编辑器与页面编辑器共用）。
 * - `extract(frontMatter)`：从 front-matter 提取自定义字段，并并入站点登记过、
 *   但本篇尚未填写的参数名（显示中文名与空值框），便于逐篇填写。
 * - 字段定义按站点登记在 localStorage，切换站点各自独立。
 */
export function useCustomFields(options: UseCustomFieldsOptions) {
  const siteStore = useSiteStore()
  const { builtinKeys, onSnapshot } = options

  const customFields = ref<CustomField[]>([])

  /** 取某键的中文显示名（登记表中有则用，否则显示键名） */
  function fieldLabel(key: string): string {
    const sitePath = siteStore.site?.path
    const f = sitePath ? loadSiteFieldMap()[sitePath]?.find((x) => x.key === key) : null
    return f?.label ?? key
  }

  /** 把当前参数名列表写回该站点的登记表 */
  function persistSiteFields(): void {
    const sitePath = siteStore.site?.path
    if (!sitePath) return
    saveSiteFields(
      sitePath,
      customFields.value.map((f) => ({ key: f.key, label: f.label ?? fieldLabel(f.key) }))
    )
  }

  /** 从 front-matter 提取自定义字段，并补上站点登记但本篇为空的参数 */
  function extract(fm: Record<string, unknown>): CustomField[] {
    const inFile = Object.entries(fm)
      .filter(([k]) => !builtinKeys.includes(k))
      .map(([k, v]) => ({ key: k, value: toFieldValue(v) }))

    const sitePath = siteStore.site?.path
    const registered = sitePath ? (loadSiteFieldMap()[sitePath] ?? []) : []
    const seen = new Set(inFile.map((f) => f.key))
    const extra = registered
      .filter((r) => !seen.has(r.key))
      .map((r) => ({ key: r.key, value: '', label: r.label }))

    return [...inFile, ...extra]
  }

  /** 载入文档时重建字段列表 */
  function applyFrom(fm: Record<string, unknown>): void {
    customFields.value = extract(fm)
  }

  function add(key: string, label: string): void {
    customFields.value.push({ key, value: '', label: label || key })
    persistSiteFields()
    onSnapshot?.()
  }

  function remove(index: number): void {
    // 移除本文档的该字段，并从站点登记表删除（后续文档不再默认显示）
    customFields.value.splice(index, 1)
    persistSiteFields()
  }

  /** 序列化为 extra 补丁；值为空串表示删除该键 */
  function buildExtra(): Record<string, string | null> {
    const extra: Record<string, string | null> = {}
    for (const f of customFields.value) {
      const key = f.key.trim()
      if (!key) continue
      extra[key] = f.value === '' ? null : f.value
    }
    return extra
  }

  /** 最近一次载入/保存后的完整 front-matter，供只读展示 */
  const lastFrontMatter = ref<Record<string, unknown>>({})

  function setFrontMatter(fm: Record<string, unknown>): void {
    lastFrontMatter.value = fm
  }

  /** 侧栏「其他元数据」：非自定义字段、非内置字段的只读展示 */
  const readOnlyMeta = computed(() => {
    const fm = lastFrontMatter.value
    const customKeys = customFields.value.map((f) => f.key)
    return Object.entries(fm)
      .filter(([k]) => !builtinKeys.includes(k) && !customKeys.includes(k))
      .map(([k, v]) => ({ key: k, value: toFieldValue(v) || '（空）' }))
  })

  return {
    customFields,
    fieldLabel,
    persistSiteFields,
    applyFrom,
    add,
    remove,
    buildExtra,
    readOnlyMeta,
    setFrontMatter
  }
}
