import { ref, computed } from 'vue'
import { useSiteStore } from '../stores/site'

/** 参数类型：键值式（文本输入）或开关式（勾选框） */
export type CustomFieldType = 'kv' | 'switch'

/** 自定义 front-matter 参数（文章与页面共用同一套收集 / 编辑 / 登记逻辑） */
export interface CustomField {
  key: string
  value: string
  /** 界面显示名（中文），未登记时等于 key */
  label?: string
  /** 参数类型；缺省为键值式 */
  type?: CustomFieldType
  /** 开关式：选中时写入的值（默认 'true'） */
  onValue?: string
  /** 开关式：取消时写入的值（默认 'false'） */
  offValue?: string
}

/** 站点登记的自定义参数：key 为 front-matter 键名，label 为界面显示名 */
export interface SiteField {
  key: string
  label: string
  type?: CustomFieldType
  onValue?: string
  offValue?: string
}

const SITE_FIELDS_KEY = 'hexodeck-custom-fields'
/** 合法的 YAML 键名 */
export const FIELD_NAME_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/

/** 开关式参数的默认写入值 */
export const SWITCH_ON_DEFAULT = 'true'
export const SWITCH_OFF_DEFAULT = 'false'

/** 开关的选中值（缺省 true） */
export function switchOnOf(f: Pick<CustomField, 'onValue'>): string {
  return f.onValue || SWITCH_ON_DEFAULT
}

/** 开关的取消值（缺省 false） */
export function switchOffOf(f: Pick<CustomField, 'offValue'>): string {
  return f.offValue || SWITCH_OFF_DEFAULT
}

/** 开关当前是否勾选：值等于选中值即勾选 */
export function switchIsOn(f: Pick<CustomField, 'value' | 'onValue'>): boolean {
  return (f.value || '') === switchOnOf(f)
}

/** 切换开关：写入对应的选中/取消值 */
export function switchToggle(f: CustomField, checked: boolean): void {
  f.value = checked ? switchOnOf(f) : switchOffOf(f)
}

/** 开关写入 front-matter 的值：true/false 用布尔（模板里字符串 'false' 是真值），自定义值保持字符串 */
export function switchFrontValue(f: Pick<CustomField, 'value' | 'onValue' | 'offValue'>): string | boolean {
  const v = f.value === '' ? switchOffOf(f) : f.value
  if (v === 'true') return true
  if (v === 'false') return false
  return v
}

type SiteFieldMap = Record<string, SiteField[]>

/** 兼容旧版纯字符串数组（无中文名时以键名代显示）；旧条目视为键值式 */
function normalizeSiteFields(raw: unknown): SiteField[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      if (typeof item === 'string') return { key: item, label: item }
      const o = item as Record<string, unknown>
      const key = typeof o.key === 'string' ? o.key : ''
      if (!key) return null
      const label = typeof o.label === 'string' && o.label ? o.label : key
      const type = o.type === 'switch' ? 'switch' : 'kv'
      const base: SiteField = { key, label }
      if (type === 'switch') {
        base.type = 'switch'
        base.onValue = typeof o.onValue === 'string' ? o.onValue : SWITCH_ON_DEFAULT
        base.offValue = typeof o.offValue === 'string' ? o.offValue : SWITCH_OFF_DEFAULT
      }
      return base
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

  /** 把当前参数名列表写回该站点的登记表（开关式参数连同类型与写入值一起登记） */
  function persistSiteFields(): void {
    const sitePath = siteStore.site?.path
    if (!sitePath) return
    saveSiteFields(
      sitePath,
      customFields.value.map((f) => {
        const base: SiteField = { key: f.key, label: f.label ?? fieldLabel(f.key) }
        if (f.type === 'switch') {
          base.type = 'switch'
          base.onValue = switchOnOf(f)
          base.offValue = switchOffOf(f)
        }
        return base
      })
    )
  }

  /** 从 front-matter 提取自定义字段，并补上站点登记但本篇为空的参数。
   *  登记为开关式的参数按开关类型回填（取值匹配选中值即勾选）。 */
  function extract(fm: Record<string, unknown>): CustomField[] {
    const sitePath = siteStore.site?.path
    const registered = sitePath ? (loadSiteFieldMap()[sitePath] ?? []) : []
    const regOf = (key: string) => registered.find((r) => r.key === key)

    const inFile = Object.entries(fm)
      .filter(([k]) => !builtinKeys.includes(k))
      .map(([k, v]) => {
        const reg = regOf(k)
        const base: CustomField = { key: k, value: toFieldValue(v), label: reg?.label }
        if (reg?.type === 'switch') {
          base.type = 'switch'
          base.onValue = switchOnOf(reg)
          base.offValue = switchOffOf(reg)
        }
        return base
      })

    const seen = new Set(inFile.map((f) => f.key))
    const extra = registered
      .filter((r) => !seen.has(r.key))
      .map((r): CustomField => {
        const base: CustomField = { key: r.key, value: '', label: r.label }
        if (r.type === 'switch') {
          // 登记的开关参数在新文档里默认为取消态
          base.type = 'switch'
          base.onValue = switchOnOf(r)
          base.offValue = switchOffOf(r)
          base.value = switchOffOf(r)
        }
        return base
      })

    return [...inFile, ...extra]
  }

  /** 载入文档时重建字段列表 */
  function applyFrom(fm: Record<string, unknown>): void {
    customFields.value = extract(fm)
  }

  function add(
    key: string,
    label: string,
    opts?: { type?: CustomFieldType; onValue?: string; offValue?: string }
  ): void {
    const base: CustomField = { key, value: '', label: label || key }
    if (opts?.type === 'switch') {
      base.type = 'switch'
      base.onValue = opts.onValue || SWITCH_ON_DEFAULT
      base.offValue = opts.offValue || SWITCH_OFF_DEFAULT
      base.value = base.offValue
    }
    customFields.value.push(base)
    persistSiteFields()
    onSnapshot?.()
  }

  function remove(index: number): void {
    // 移除本文档的该字段，并从站点登记表删除（后续文档不再默认显示）
    customFields.value.splice(index, 1)
    persistSiteFields()
  }

  /** 序列化为 extra 补丁；值为空串表示删除该键 */
  function buildExtra(): Record<string, string | boolean | null> {
    const extra: Record<string, string | boolean | null> = {}
    for (const f of customFields.value) {
      const key = f.key.trim()
      if (!key) continue
      // 开关式参数写入布尔（true/false 字面量）或自定义字符串值
      extra[key] = f.type === 'switch' ? switchFrontValue(f) : f.value === '' ? null : f.value
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
