<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { basicSetup } from 'codemirror'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { oneDark } from '@codemirror/theme-one-dark'
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
        '&': { fontSize: '14px', height: '100%' },
        '.cm-scroller': {
          fontFamily: "Consolas, 'Courier New', monospace",
          lineHeight: '1.7'
        },
        '.cm-gutters': { backgroundColor: 'transparent' }
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

const tools: Array<{ label: string; title: string; action: () => void }> = [
  { label: 'H2', title: '二级标题', action: () => prefixLines('## ') },
  { label: 'H3', title: '三级标题', action: () => prefixLines('### ') },
  { label: 'B', title: '粗体', action: () => wrapSelection('**') },
  { label: 'I', title: '斜体', action: () => wrapSelection('*') },
  { label: 'S', title: '删除线', action: () => wrapSelection('~~') },
  { label: '``', title: '行内代码', action: () => wrapSelection('`') },
  { label: '代码块', title: '代码块', action: () => wrapSelection('\n```\n', '\n```\n') },
  { label: '引用', title: '引用', action: () => prefixLines('> ') },
  { label: '• 列表', title: '无序列表', action: () => prefixLines('- ') },
  { label: '1. 列表', title: '有序列表', action: () => prefixLines('1. ') },
  { label: '链接', title: '插入链接', action: () => wrapSelection('[', '](https://)') },
  { label: '图片', title: '插入图片（也可直接粘贴/拖拽）', action: pickImage },
  {
    label: '表格',
    title: '插入表格',
    action: () =>
      insertAtCursor('\n| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |\n')
  },
  { label: '分割线', title: '分割线', action: () => insertAtCursor('\n---\n') }
]
</script>

<template>
  <div class="md-editor">
    <div class="toolbar">
      <n-button v-for="t in tools" :key="t.label" size="tiny" quaternary :title="t.title" @click="t.action">
        {{ t.label }}
      </n-button>
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
  border: 1px solid rgba(128, 128, 128, 0.25);
  border-radius: 4px;
  overflow: hidden;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 4px 6px;
  border-bottom: 1px solid rgba(128, 128, 128, 0.2);
  background: rgba(128, 128, 128, 0.06);
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
