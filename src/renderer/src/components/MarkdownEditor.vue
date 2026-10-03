<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { basicSetup } from 'codemirror'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { oneDark } from '@codemirror/theme-one-dark'
import { redo, undo } from '@codemirror/commands'
import { NButton } from 'naive-ui'
import { message } from '../composables/message'

const props = defineProps<{ modelValue: string; dark: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const container = ref<HTMLDivElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const view = shallowRef<EditorView | null>(null)
const themeCompartment = new Compartment()

function createView(): EditorView {
  const state = EditorState.create({
    doc: props.modelValue,
    extensions: [
      basicSetup,
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      EditorView.lineWrapping,
      themeCompartment.of(props.dark ? oneDark : []),
      EditorView.theme({
        '&': { fontSize: '14px', height: '100%', backgroundColor: 'transparent' },
        '.cm-scroller': {
          fontFamily: "Consolas, 'Courier New', monospace",
          lineHeight: '1.7'
        },
        '.cm-gutters': { backgroundColor: 'transparent', borderRight: 'none' }
      }),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) emit('update:modelValue', u.state.doc.toString())
      }),
      EditorView.domEventHandlers({
        paste: (event: ClipboardEvent) => {
          const files = event.clipboardData?.files
          if (!files || !Array.from(files).some((f) => f.type.startsWith('image/'))) return false
          event.preventDefault()
          void handleFiles(files)
          return true
        },
        drop: (event: DragEvent) => {
          const files = event.dataTransfer?.files
          if (!files || !Array.from(files).some((f) => f.type.startsWith('image/'))) return false
          event.preventDefault()
          void handleFiles(files)
          return true
        }
      })
    ]
  })
  return new EditorView({ state, parent: container.value! })
}

onMounted(() => {
  view.value = createView()
})

onBeforeUnmount(() => {
  view.value?.destroy()
  view.value = null
})

// 外部赋值（如切换文章）时整体替换文档；自身 emit 回流时内容一致则跳过，避免光标跳动
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

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolveFile) => {
    const reader = new FileReader()
    reader.onload = () => resolveFile(String(reader.result).split(',')[1] ?? '')
    reader.readAsDataURL(file)
  })
}

async function handleFiles(files: FileList | File[] | null): Promise<boolean> {
  const images = Array.from(files ?? []).filter((f) => f.type.startsWith('image/'))
  if (!images.length) return false
  for (const file of images) {
    const base64 = await fileToBase64(file)
    const r = await window.api.saveImage(file.name, base64)
    if (r.ok && r.data) {
      insertAtCursor(`![](${r.data})`)
      message.success(`图片已保存：${r.data}`)
    } else {
      message.error(r.error ?? '图片保存失败')
    }
  }
  return true
}

function pickImage(): void {
  fileInput.value?.click()
}

async function onPicked(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  await handleFiles(input.files)
  input.value = ''
}

function insertAtCursor(text: string): void {
  const cm = view.value
  if (!cm) return
  cm.dispatch(cm.state.replaceSelection(text))
  cm.focus()
}

function wrapSelection(before: string, after = before): void {
  const cm = view.value
  if (!cm) return
  const { from, to } = cm.state.selection.main
  const selected = cm.state.sliceDoc(from, to)
  cm.dispatch({
    changes: { from, to, insert: before + selected + after },
    selection: { anchor: from + before.length, head: from + before.length + selected.length }
  })
  cm.focus()
}

function prefixLines(prefix: string): void {
  const cm = view.value
  if (!cm) return
  const { from, to } = cm.state.selection.main
  const startLine = cm.state.doc.lineAt(from).number
  const endLine = cm.state.doc.lineAt(to).number
  const changes: Array<{ from: number; insert: string }> = []
  for (let n = startLine; n <= endLine; n++) {
    const line = cm.state.doc.line(n)
    if (!line.text.startsWith(prefix)) changes.push({ from: line.from, insert: prefix })
  }
  if (changes.length) cm.dispatch({ changes })
  cm.focus()
}

/** 去除选区中的行内格式标记（粗体/斜体/行内代码/删除线） */
function clearFormat(): void {
  const cm = view.value
  if (!cm) return
  const { from, to } = cm.state.selection.main
  if (from === to) {
    message.info('请先选中要清除格式的文字')
    return
  }
  const selected = cm.state.sliceDoc(from, to)
  cm.dispatch({
    changes: { from, to, insert: selected.replace(/(\*\*|__|\*|_|~~|`)/g, '') }
  })
  cm.focus()
}

function run(cmd: (v: EditorView) => boolean): void {
  const cm = view.value
  if (!cm) return
  cmd(cm)
  cm.focus()
}

interface Tool {
  label: string
  title: string
  action: () => void
}

/** 第一行：标题与行内格式 */
const toolsLine1: Array<Tool | 'sep'> = [
  { label: 'H1', title: '一级标题', action: () => prefixLines('# ') },
  { label: 'H2', title: '二级标题', action: () => prefixLines('## ') },
  { label: 'H3', title: '三级标题', action: () => prefixLines('### ') },
  { label: 'H4', title: '四级标题', action: () => prefixLines('#### ') },
  'sep',
  { label: 'B', title: '粗体', action: () => wrapSelection('**') },
  { label: 'I', title: '斜体', action: () => wrapSelection('*') },
  { label: 'S', title: '删除线', action: () => wrapSelection('~~') },
  { label: '`', title: '行内代码', action: () => wrapSelection('`') },
  'sep',
  { label: '代码块', title: '代码块', action: () => wrapSelection('\n```\n', '\n```\n') },
  { label: '引用', title: '引用', action: () => prefixLines('> ') },
  'sep',
  { label: '• 列表', title: '无序列表', action: () => prefixLines('- ') },
  { label: '1. 列表', title: '有序列表', action: () => prefixLines('1. ') },
  { label: '☑ 任务', title: '任务列表', action: () => prefixLines('- [ ] ') }
]

/** 第二行：插入与编辑操作 */
const toolsLine2: Array<Tool | 'sep'> = [
  { label: '链接', title: '插入链接', action: () => wrapSelection('[', '](https://)') },
  { label: '图片', title: '插入图片（也可直接粘贴/拖拽）', action: pickImage },
  {
    label: '表格',
    title: '插入表格',
    action: () =>
      insertAtCursor('\n| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |\n')
  },
  { label: '分割线', title: '分割线', action: () => insertAtCursor('\n---\n') },
  'sep',
  { label: '清除格式', title: '去除选区的粗体/斜体/代码/删除线标记', action: clearFormat },
  'sep',
  { label: '撤销', title: '撤销 (Ctrl+Z)', action: () => run(undo) },
  { label: '重做', title: '重做 (Ctrl+Y)', action: () => run(redo) }
]
</script>

<template>
  <div class="md-editor">
    <div class="toolbar">
      <div class="toolbar-row">
        <template v-for="(t, i) in toolsLine1" :key="`l1-${i}`">
          <span v-if="t === 'sep'" class="sep" />
          <n-button v-else size="tiny" quaternary :title="t.title" @click="t.action">
            {{ t.label }}
          </n-button>
        </template>
      </div>
      <div class="toolbar-row">
        <template v-for="(t, i) in toolsLine2" :key="`l2-${i}`">
          <span v-if="t === 'sep'" class="sep" />
          <n-button v-else size="tiny" quaternary :title="t.title" @click="t.action">
            {{ t.label }}
          </n-button>
        </template>
      </div>
      <input ref="fileInput" type="file" accept="image/*" multiple hidden @change="onPicked" />
    </div>
    <div ref="container" class="cm-container"></div>
  </div>
</template>

<style scoped>
.md-editor {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--glass-border);
  border-radius: var(--radius);
  background: var(--glass-strong);
  box-shadow: var(--glass-glow);
  overflow: hidden;
}
.toolbar {
  border-bottom: 1px solid var(--glass-border);
  background: var(--accent-soft);
  padding: 3px 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.toolbar-row {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  align-items: center;
}
.sep {
  width: 1px;
  height: 16px;
  margin: 0 5px;
  background: rgba(128, 128, 128, 0.35);
}
.cm-container {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.cm-container :deep(.cm-editor) {
  height: 100%;
}
</style>
