<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { basicSetup } from 'codemirror'
import { yaml } from '@codemirror/lang-yaml'
import { search, searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { oneDark } from '@codemirror/theme-one-dark'

const props = defineProps<{ modelValue: string; dark: boolean; placeholder?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const container = ref<HTMLDivElement | null>(null)
const view = shallowRef<EditorView | null>(null)
const themeCompartment = new Compartment()

// 查找/替换面板中文化
const phrases = EditorState.phrases.of({
  Find: '查找',
  Replace: '替换',
  next: '下一个',
  previous: '上一个',
  all: '全部',
  'match case': '区分大小写',
  regexp: '正则表达式',
  'by word': '整词匹配',
  replace: '替换',
  'replace all': '全部替换',
  close: '关闭',
  'current match': '当前匹配',
  'replaced $ matches': '已替换 $ 处',
  'replaced match on line $': '已替换第 $ 行',
  'on line': '在行'
})

const baseTheme = EditorView.theme({
  '&': { fontSize: '14px', height: '100%', backgroundColor: 'transparent' },
  '.cm-scroller': {
    fontFamily: "Consolas, 'Courier New', monospace",
    lineHeight: '1.7'
  },
  '.cm-content': { caretColor: 'var(--accent)', padding: '10px 0' },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    borderRight: '1px solid var(--bg-grid)',
    color: 'var(--text-3)'
  },
  '.cm-activeLine': { backgroundColor: 'var(--accent-soft)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--accent)' },

  // 查找/替换面板：玻璃拟态，与全局 UI 统一
  '.cm-panels': { backgroundColor: 'transparent', color: 'var(--text-1)' },
  '.cm-panel.cm-search': {
    backgroundColor: 'var(--glass-strong)',
    backdropFilter: 'blur(18px) saturate(1.5)',
    padding: '12px 16px',
    borderBottom: '1px solid var(--glass-border)',
    boxShadow: 'var(--glass-glow)',
    fontSize: '13px'
  },
  '.cm-search label': {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '7px',
    marginRight: '12px'
  },
  '.cm-search input:not([type=checkbox])': {
    background: 'var(--accent-soft)',
    border: '1px solid var(--glass-border)',
    borderRadius: '9px',
    padding: '6px 12px',
    color: 'var(--text-1)',
    font: 'inherit',
    outline: 'none',
    minWidth: '180px',
    transition: 'border-color .15s ease, box-shadow .15s ease'
  },
  '.cm-search input:not([type=checkbox]):focus': {
    borderColor: 'var(--accent)',
    boxShadow: 'var(--accent-glow)'
  },
  '.cm-search input[type=checkbox]': {
    accentColor: 'var(--accent)',
    width: '14px',
    height: '14px'
  },
  '.cm-search .cm-button-row': {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '7px',
    marginTop: '10px'
  },
  '.cm-search button': {
    background: 'var(--accent-soft)',
    border: '1px solid var(--glass-border)',
    borderRadius: '9px',
    padding: '5px 14px',
    color: 'var(--text-1)',
    font: 'inherit',
    cursor: 'pointer',
    transition: 'border-color .15s ease, box-shadow .15s ease, color .15s ease'
  },
  '.cm-search button:hover': {
    borderColor: 'var(--accent)',
    boxShadow: 'var(--accent-glow)',
    color: 'var(--accent)'
  },
  '.cm-search button[name=close]': {
    borderRadius: '999px',
    padding: '5px 11px',
    marginLeft: 'auto'
  },

  // 匹配高亮：主色描边 + 半透明填充，替代默认黄色
  '.cm-searchMatch': {
    outline: '1px solid var(--accent)',
    backgroundColor: 'color-mix(in srgb, var(--accent) 18%, transparent)',
    borderRadius: '2px'
  },
  '.cm-searchMatch-selected': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 40%, transparent)'
  },
  '.cm-selectionMatch': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 14%, transparent)'
  }
})

function createView(): EditorView {
  const state = EditorState.create({
    doc: props.modelValue,
    extensions: [
      phrases,
      basicSetup,
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
      yaml(),
      // 内置查找/替换面板：Ctrl+F 呼出，Enter 跳下一个匹配
      search({ top: true }),
      highlightSelectionMatches(),
      themeCompartment.of(props.dark ? oneDark : []),
      baseTheme,
      EditorView.updateListener.of((u) => {
        if (u.docChanged) emit('update:modelValue', u.state.doc.toString())
      })
    ]
  })
  return new EditorView({ state, parent: container.value!, root: document })
}

onMounted(() => {
  view.value = createView()
})

onBeforeUnmount(() => {
  view.value?.destroy()
  view.value = null
})

// 外部赋值时整体替换文档；内容一致则跳过，避免光标跳动
watch(
  () => props.modelValue,
  (v) => {
    const cm = view.value
    if (cm && v !== cm.state.doc.toString()) {
      cm.dispatch({ changes: { from: 0, to: cm.state.doc.length, insert: v } })
    }
  }
)

watch(
  () => props.dark,
  (dark) => {
    view.value?.dispatch({ effects: themeCompartment.reconfigure(dark ? oneDark : []) })
  }
)

/** 定位到指定行（0 基）：滚动到屏幕中央并选中该行 */
function revealLine(lineIdx: number): void {
  const cm = view.value
  if (!cm) return
  const doc = cm.state.doc
  const line = doc.line(Math.min(Math.max(1, lineIdx + 1), doc.lines))
  cm.dispatch({
    selection: { anchor: line.from, head: line.to },
    effects: EditorView.scrollIntoView(line.from, { y: 'center' })
  })
  cm.focus()
}

defineExpose({ revealLine })
</script>

<template>
  <div ref="container" class="code-editor"></div>
</template>

<style scoped>
.code-editor {
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.code-editor :deep(.cm-editor) {
  height: 100%;
}

.code-editor :deep(.cm-editor.cm-focused) {
  outline: none;
}
</style>
