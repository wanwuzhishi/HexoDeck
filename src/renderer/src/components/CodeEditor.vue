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
  '&': { fontSize: '13px', height: '100%', backgroundColor: 'transparent' },
  '.cm-scroller': {
    fontFamily: "Consolas, 'Courier New', monospace",
    lineHeight: '1.65'
  },
  '.cm-gutters': { backgroundColor: 'transparent', borderRight: 'none' },
  '.cm-activeLine': { backgroundColor: 'var(--accent-soft)' },
  '.cm-panels': {
    backgroundColor: 'var(--glass-strong)',
    color: 'var(--text-1)',
    borderBottom: '1px solid var(--glass-border)'
  },
  '.cm-panel.cm-search input, .cm-panel.cm-search button': {
    borderRadius: '8px'
  },
  '.cm-searchMatch': { outline: '1px solid var(--accent)' },
  '.cm-searchMatch-selected': { backgroundColor: 'var(--accent-soft)' }
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
