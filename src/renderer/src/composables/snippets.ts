import { ref } from 'vue'

/** 自定义插入片段：工具栏上的一个按钮，点击把 snippet 插入光标处 */
export interface Snippet {
  id: string
  /** 按钮显示文字（限 6 字，避免撑宽工具栏） */
  label: string
  /** 点击后插入到光标处的文本 */
  snippet: string
}

const STORAGE_KEY = 'hexodeck-snippets'
/** 按钮名上限：工具栏空间有限，太长会把其他按钮挤出可视区 */
export const SNIPPET_LABEL_MAX = 6
/** 片段内容上限，防止误粘贴巨量文本 */
export const SNIPPET_BODY_MAX = 2000

/** 兼容旧数据并过滤非法项 */
function load(): Snippet[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item) => {
        const o = item as Partial<Snippet>
        const label = typeof o.label === 'string' ? o.label.trim() : ''
        const snippet = typeof o.snippet === 'string' ? o.snippet : ''
        if (!label || !snippet) return null
        const id = typeof o.id === 'string' && o.id ? o.id : `sn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
        return { id, label: label.slice(0, SNIPPET_LABEL_MAX), snippet: snippet.slice(0, SNIPPET_BODY_MAX) }
      })
      .filter((s): s is Snippet => s !== null)
  } catch {
    return []
  }
}

/**
 * 自定义插入片段（全局共用，不区分站点）。
 * 这类片段是「写作习惯」而非「站点内容」——比如版权声明、个人签名，
 * 换站点时仍希望可用，因此不做站点隔离。
 */
export function useSnippets() {
  const snippets = ref<Snippet[]>(load())

  function persist(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snippets.value))
  }

  function add(label: string, snippet: string): Snippet {
    const item: Snippet = {
      id: `sn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      label: label.trim().slice(0, SNIPPET_LABEL_MAX),
      snippet: snippet.slice(0, SNIPPET_BODY_MAX)
    }
    snippets.value.push(item)
    persist()
    return item
  }

  function update(id: string, patch: Partial<Pick<Snippet, 'label' | 'snippet'>>): void {
    const target = snippets.value.find((s) => s.id === id)
    if (!target) return
    if (patch.label !== undefined) target.label = patch.label.trim().slice(0, SNIPPET_LABEL_MAX)
    if (patch.snippet !== undefined) target.snippet = patch.snippet.slice(0, SNIPPET_BODY_MAX)
    persist()
  }

  function remove(id: string): void {
    snippets.value = snippets.value.filter((s) => s.id !== id)
    persist()
  }

  return { snippets, add, update, remove }
}
