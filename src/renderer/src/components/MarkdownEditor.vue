<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { basicSetup } from 'codemirror'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { oneDark } from '@codemirror/theme-one-dark'
import { redo, undo } from '@codemirror/commands'
import { NButton, NForm, NFormItem, NInput, NModal, NPopconfirm, NSpace } from 'naive-ui'
import { message } from '../composables/message'
import { SNIPPET_BODY_MAX, SNIPPET_LABEL_MAX, useSnippets, type Snippet } from '../composables/snippets'

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

// ---------- 自定义插入片段（工具栏尾部，全局共用） ----------

const { snippets, add: addSnippet, update: updateSnippet, remove: removeSnippet } = useSnippets()

const showSnippets = ref(false)
/** 编辑中的片段；id 为空表示新增 */
const editing = ref<{ id: string; label: string; snippet: string }>({ id: '', label: '', snippet: '' })
const editingError = ref('')

const labelMax = SNIPPET_LABEL_MAX

function openSnippets(): void {
  editing.value = { id: '', label: '', snippet: '' }
  editingError.value = ''
  showSnippets.value = true
}

function startEdit(s: Snippet): void {
  editing.value = { id: s.id, label: s.label, snippet: s.snippet }
  editingError.value = ''
}

function cancelEdit(): void {
  editing.value = { id: '', label: '', snippet: '' }
  editingError.value = ''
}

function saveSnippet(): void {
  const label = editing.value.label.trim()
  const snippet = editing.value.snippet
  if (!label) {
    editingError.value = '请填写按钮名称'
    return
  }
  if (!snippet.trim()) {
    editingError.value = '请填写要插入的内容'
    return
  }
  if (snippet.length > SNIPPET_BODY_MAX) {
    editingError.value = `内容过长（上限 ${SNIPPET_BODY_MAX} 字）`
    return
  }
  if (editing.value.id) {
    updateSnippet(editing.value.id, { label, snippet })
    message.success('片段已更新')
  } else {
    addSnippet(label, snippet)
    message.success('片段已添加')
  }
  cancelEdit()
}

/** 把片段插入光标处（片段内的 {{date}} 替换为当前日期，便于写「更新于」这类模板） */
function applySnippet(s: Snippet): void {
  const text = s.snippet.replace(/\{\{date\}\}/g, new Date().toISOString().slice(0, 10))
  insertAtCursor(text)
  showSnippets.value = false
}
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
        <!-- 自定义片段：一个「＋」入口 + 每个片段一个按钮 -->
        <span class="sep" />
        <n-button
          v-for="s in snippets"
          :key="s.id"
          size="tiny"
          quaternary
          class="snippet-btn"
          :title="`插入片段：${s.label}`"
          @click="applySnippet(s)"
        >
          {{ s.label }}
        </n-button>
        <n-button
          size="tiny"
          quaternary
          title="自定义插入片段（可添加常用模板，如版权声明、更新日志）"
          @click="openSnippets"
        >
          ＋
        </n-button>
      </div>
      <input ref="fileInput" type="file" accept="image/*" multiple hidden @change="onPicked" />
    </div>

    <!-- 自定义片段管理 -->
    <n-modal v-model:show="showSnippets" preset="card" title="自定义插入片段" style="width: 560px">
      <div class="muted small snippet-tip">
        把常写的内容做成按钮：写文章时点一下即插入光标处。支持
        <code v-text="'{{date}}'"></code> 占位符，插入时自动替换为当天日期。
      </div>

      <div v-if="snippets.length" class="snippet-list">
        <div v-for="s in snippets" :key="s.id" class="snippet-item">
          <div class="snippet-head">
            <span class="snippet-name">{{ s.label }}</span>
            <n-space :size="4">
              <n-button size="tiny" secondary @click="startEdit(s)">编辑</n-button>
              <n-popconfirm @positive-click="removeSnippet(s.id)">
                <template #trigger>
                  <n-button size="tiny" secondary class="btn-danger">删除</n-button>
                </template>
                删除后该按钮会从工具栏移除（文章里已插入的内容不受影响）。
              </n-popconfirm>
            </n-space>
          </div>
          <div class="snippet-preview muted small">{{ s.snippet }}</div>
        </div>
      </div>
      <div v-else class="muted small snippet-empty">还没有自定义片段，在下方添加一个。</div>

      <n-form label-placement="left" :label-width="76" class="snippet-form">
        <n-form-item :label="editing.id ? '编辑片段' : '新增片段'">
          <n-space vertical :size="8" style="width: 100%">
            <n-input
              v-model:value="editing.label"
              :maxlength="labelMax"
              show-count
              placeholder="按钮名称（最多 6 字，如：版权、更新日志）"
            />
            <n-input
              v-model:value="editing.snippet"
              type="textarea"
              :autosize="{ minRows: 3, maxRows: 8 }"
              placeholder="点击按钮时插入的内容，例如：&#10;---&#10;本文采用 CC BY-NC 协议，转载请注明出处。"
            />
          </n-space>
        </n-form-item>
      </n-form>
      <div v-if="editingError" class="snippet-error">{{ editingError }}</div>

      <template #footer>
        <n-space justify="end">
          <n-button v-if="editing.id" @click="cancelEdit">取消编辑</n-button>
          <n-button @click="showSnippets = false">关闭</n-button>
          <n-button type="primary" @click="saveSnippet">
            {{ editing.id ? '保存修改' : '添加' }}
          </n-button>
        </n-space>
      </template>
    </n-modal>

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

/* 自定义片段按钮：与内置按钮区分，用主题色文字提示「这是你自己的模板」 */
.snippet-btn {
  color: var(--accent);
}

/* 片段管理弹窗 */
.snippet-tip {
  margin-bottom: 12px;
  line-height: 1.7;
}

.snippet-tip code {
  font-family: var(--mono);
  padding: 1px 4px;
  border-radius: 4px;
  background: var(--accent-soft);
}

.snippet-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
  max-height: 240px;
  overflow: auto;
}

.snippet-item {
  padding: 9px 11px;
  border: 1px solid var(--glass-border);
  border-radius: 10px;
  background: var(--accent-soft);
}

.snippet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.snippet-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-1);
}

.snippet-preview {
  margin-top: 5px;
  white-space: pre-wrap;
  word-break: break-all;
  line-height: 1.6;
  max-height: 60px;
  overflow: hidden;
}

.snippet-empty {
  margin-bottom: 12px;
}

.snippet-form {
  padding-top: 10px;
  border-top: 1px solid var(--glass-border);
}

.snippet-error {
  margin-top: 6px;
  font-size: 12px;
  color: var(--danger);
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
