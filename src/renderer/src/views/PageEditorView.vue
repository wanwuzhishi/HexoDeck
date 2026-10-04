<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NButton, NIcon, NPopconfirm, NSpace, NTag } from 'naive-ui'
import { ChevronBackOutline } from '@vicons/ionicons5'
import MarkdownIt from 'markdown-it'
import { useSiteStore } from '../stores/site'
import { usePagesStore } from '../stores/pages'
import { useWorkspaceStore } from '../stores/workspace'
import { useUiStore } from '../stores/ui'
import { message } from '../composables/message'
import { countWords } from '../composables/wordcount'
import { load as loadYaml } from 'js-yaml'
import MarkdownEditor from '../components/MarkdownEditor.vue'
import CodeEditor from '../components/CodeEditor.vue'
import type { PageDetail } from '@shared/ipc'

const route = useRoute()
const router = useRouter()
const pages = usePagesStore()
const siteStore = useSiteStore()
const ws = useWorkspaceStore()
const ui = useUiStore()

const md = new MarkdownIt({ html: true, linkify: true })

const id = computed(() => String(route.query.id ?? ''))
const detail = ref<PageDetail | null>(null)
const form = ref({ title: '', date: '', content: '' })
const snapshot = ref('')
const saving = ref(false)
const lastSavedAt = ref('')

/** 分栏预览开关：与文章编辑器共用同一个记忆键，保持一致的阅读习惯 */
const PREVIEW_KEY = 'hexodeck-editor-preview'
const showPreview = ref(localStorage.getItem(PREVIEW_KEY) !== '0')

function togglePreview(): void {
  showPreview.value = !showPreview.value
  localStorage.setItem(PREVIEW_KEY, showPreview.value ? '1' : '0')
}

/**
 * 参数侧栏默认关闭：每次打开页面编辑器都从收起状态开始。
 * 刻意不做持久化——展开参数是临时查看动作，记住它反而让每次进来都要手动收一次。
 */
const showParams = ref(false)

function toggleParams(): void {
  showParams.value = !showParams.value
}

// ---------- 页面参数：YAML 大输入框 ----------

/**
 * 大框内容：完整 front-matter 的 YAML 原文（含 title / date）。
 * 页面编辑器不再单独提供标题、日期输入框——同一份数据只在一处可编辑，
 * 避免两处不同步；顶部只读展示当前标题与日期作为身份提示。
 */
const paramsYaml = ref('')

/**
 * 轻量 YAML 序列化：只处理标量/数组/普通对象（front-matter 的常见形态）。
 * 不用 js-yaml 的 dump 是为了避免它给长字符串加折行、给日期加引号等噪音。
 */
function dumpYaml(obj: Record<string, unknown>, indent = 0): string {
  const pad = '  '.repeat(indent)
  const lines: string[] = []
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) {
      lines.push(`${pad}${k}:`)
    } else if (Array.isArray(v)) {
      if (!v.length) lines.push(`${pad}${k}: []`)
      else {
        lines.push(`${pad}${k}:`)
        for (const item of v) lines.push(`${pad}  - ${scalarText(item)}`)
      }
    } else if (typeof v === 'object') {
      lines.push(`${pad}${k}:`)
      lines.push(dumpYaml(v as Record<string, unknown>, indent + 1))
    } else {
      lines.push(`${pad}${k}: ${scalarText(v)}`)
    }
  }
  return lines.join('\n')
}

function scalarText(v: unknown): string {
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  const s = String(v)
  if (s === '') return "''"
  if (/^[\w./:@^~+%=-]+$/.test(s)) return s
  return JSON.stringify(s)
}

/** 把完整 front-matter 回填到大框 */
function frontMatterToYaml(fm: Record<string, unknown>): string {
  if (!Object.keys(fm).length) return ''
  return dumpYaml(fm)
}

/** 大框的实时校验结果 */
const paramsError = computed(() => {
  const text = paramsYaml.value.trim()
  if (!text) return ''
  try {
    const parsed = loadYaml(text, { json: true })
    if (parsed != null && (typeof parsed !== 'object' || Array.isArray(parsed))) {
      return '参数需要是键值对形式，例如 layout: page'
    }
  } catch (e) {
    return `YAML 语法错误：${(e as Error).message.split('\n')[0]}`
  }
  return ''
})

/** 解析大框为参数对象；非法时返回 null */
function parseParams(): Record<string, unknown> | null {
  const text = paramsYaml.value.trim()
  if (!text) return {}
  try {
    const parsed = loadYaml(text, { json: true })
    if (parsed == null) return {}
    if (typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

/** 顶部只读展示：大框里的标题/日期，未填时回退到原值 */
const previewTitle = computed(() => String(parseParams()?.title ?? detail.value?.title ?? ''))
const previewDate = computed(() => String(parseParams()?.date ?? detail.value?.date ?? ''))

const liveWordCount = computed(() => countWords(form.value.content))

const previewHtml = computed(() => {
  const html = md.render(form.value.content)
  return ws.previewUrl ? html.replace(/(src=)"(\/[^"@]*)"/g, `$1="${ws.previewUrl}$2"`) : html
})

function takeSnapshot(): void {
  snapshot.value = JSON.stringify([form.value.content, paramsYaml.value])
}

const dirty = computed(
  () =>
    detail.value !== null &&
    JSON.stringify([form.value.content, paramsYaml.value]) !== snapshot.value
)

async function load(): Promise<void> {
  if (!id.value) return
  const r = await window.api.readPage(id.value)
  if (r.ok && r.data) {
    detail.value = r.data
    form.value = {
      // 标题/日期不再单独编辑，但保留一份用于只读展示与标题兜底
      title: r.data.title,
      date: r.data.date,
      // CodeMirror 以 LF 为行分隔符，统一后再比较，避免 CRLF 文件被误判为已修改
      content: r.data.content.replace(/\r\n/g, '\n')
    }
    paramsYaml.value = frontMatterToYaml(r.data.frontMatter ?? {})
    takeSnapshot()
  } else {
    message.error(r.error ?? '读取页面失败')
    router.replace('/pages')
  }
}

async function save(): Promise<void> {
  if (!detail.value || saving.value) return
  if (paramsError.value) {
    message.error('参数 YAML 有语法错误，请先修正')
    return
  }
  const parsed = parseParams()
  if (!parsed) {
    message.error('参数需要是键值对形式')
    return
  }

  saving.value = true
  try {
    // front-matter 全量走 extra（大框是标题/日期的唯一编辑处）；
    // 数组/对象转为文本以匹配 extra 的字符串契约
    const extra: Record<string, string | null> = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (v == null || v === '') extra[k] = null
      else if (Array.isArray(v)) extra[k] = v.map(String).join(', ')
      else if (typeof v === 'object') extra[k] = JSON.stringify(v)
      else extra[k] = String(v)
    }

    // 注意：form 是响应式 Proxy，直接传对象给 IPC 会因结构化克隆失败
    const r = await window.api.savePage(detail.value.id, {
      title: previewTitle.value,
      date: previewDate.value,
      content: form.value.content,
      extra: { ...extra }
    })
    if (r.ok) {
      takeSnapshot()
      lastSavedAt.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
      // 重新读取以同步 YAML 归一化后的 front-matter
      const fresh = await window.api.readPage(detail.value.id)
      if (fresh.ok && fresh.data) {
        detail.value = fresh.data
        form.value.title = fresh.data.title
        form.value.date = fresh.data.date
        paramsYaml.value = frontMatterToYaml(fresh.data.frontMatter ?? {})
        takeSnapshot()
      }
      await pages.load()
    } else {
      message.error(r.error ?? '保存失败')
    }
  } finally {
    saving.value = false
  }
}

// 自动保存：停止输入后按设置延迟静默保存；YAML 有语法错误时暂停
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null
watch(
  [form, paramsYaml],
  () => {
    if (!detail.value || !dirty.value || paramsError.value) return
    if (autoSaveTimer) clearTimeout(autoSaveTimer)
    autoSaveTimer = setTimeout(() => {
      if (dirty.value && !paramsError.value) save()
    }, ui.autoSaveDelay)
  },
  { deep: true }
)

const autoSaveSeconds = computed(() => String(Number((ui.autoSaveDelay / 1000).toFixed(1))))

async function removePage(): Promise<void> {
  if (!detail.value) return
  try {
    await pages.remove(detail.value.id)
    message.success('已删除')
    router.replace('/pages')
  } catch (e) {
    message.error((e as Error).message)
  }
}

function onKeydown(e: KeyboardEvent): void {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    save()
  }
}

// 站点切换时当前页面属于旧站点，必须清空并回列表，否则会把 A 站页面存进 B 站
watch(
  () => siteStore.site?.path,
  (path, old) => {
    if (!old || path === old) return
    detail.value = null
    form.value = { title: '', date: '', content: '' }
    // 大框内容也属于旧站点，必须一并清空，否则会串到新站点
    paramsYaml.value = ''
    snapshot.value = ''
    router.replace('/pages')
  }
)

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  void load()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="editor-page">
    <div class="editor-header">
      <n-space align="center">
        <span class="title">页面编辑器</span>
        <n-tag v-if="detail" size="small" :bordered="false">页面</n-tag>
        <n-tag v-if="dirty" type="info" size="small" :bordered="false">未保存</n-tag>
      </n-space>
      <n-space align="center">
        <!-- 参数侧栏开关放顶部工具条，收起后仍有明显入口 -->
        <n-button
          size="small"
          :type="showParams ? 'primary' : 'default'"
          secondary
          :title="showParams ? '收起页面参数侧栏' : '展开页面参数侧栏'"
          @click="toggleParams"
        >
          {{ showParams ? '▤ 参数已开' : '▥ 参数已关' }}
        </n-button>
        <n-button
          size="small"
          :type="showPreview ? 'primary' : 'default'"
          :secondary="!showPreview"
          :title="showPreview ? '关闭预览（仅显示编辑区）' : '开启预览（分栏显示渲染结果）'"
          @click="togglePreview"
        >
          {{ showPreview ? '◨ 预览已开' : '◧ 预览已关' }}
        </n-button>
        <n-popconfirm v-if="detail" @positive-click="removePage">
          <template #trigger>
            <n-button quaternary type="error">删除</n-button>
          </template>
          删除后移入系统回收站，确定吗？
        </n-popconfirm>
        <n-button @click="router.push('/pages')">返回列表</n-button>
        <n-button type="primary" :loading="saving" :disabled="!dirty" @click="save">
          保存（Ctrl+S）
        </n-button>
      </n-space>
    </div>

    <!-- 标题与日期在右侧参数大框里编辑，这里只读展示，避免两处输入不同步 -->
    <div class="meta-row">
      <span class="page-title" :title="previewTitle">{{ previewTitle || '（未设置标题）' }}</span>
      <span v-if="previewDate" class="muted small page-date">{{ previewDate }}</span>
      <span v-if="detail" class="muted small page-path" :title="detail.id">source/{{ detail.id }}</span>
    </div>

    <div class="editor-body" :class="{ row: showPreview || showParams }">
      <MarkdownEditor v-model="form.content" :dark="ui.isDark" />
      <div v-if="showPreview" class="markdown-body" v-html="previewHtml"></div>

      <!-- 页面参数侧栏：YAML 大输入框（不含标题 / 时间） -->
      <aside v-if="showParams" class="params-rail glass">
        <div class="params-head">
          <span class="params-title">页面参数</span>
          <n-button size="tiny" quaternary title="收起参数栏" @click="toggleParams">收起 ›</n-button>
        </div>

        <div class="params-scroll">
          <div class="field-group">
            <div class="field-label">页面参数（YAML）</div>
            <div class="muted small yaml-tip">
              直接写完整的 front-matter 键值对（含 <code>title</code>、<code>date</code>），保存时写回文件。
            </div>
            <div class="code-editor-wrap param-editor" :class="{ invalid: !!paramsError }">
              <CodeEditor v-model="paramsYaml" :dark="ui.isDark" placeholder="layout: page" />
            </div>
            <div v-if="paramsError" class="param-error">{{ paramsError }}</div>
            <div v-else class="param-ok">✓ YAML 格式正确</div>
          </div>
        </div>
      </aside>

      <!-- 收起态：贴边的竖向拉手，比原来的小箭头更易发现和点击 -->
      <button
        v-else
        class="params-open"
        type="button"
        title="展开页面参数侧栏"
        @click="toggleParams"
      >
        <n-icon :component="ChevronBackOutline" />
        <span class="params-open-label">页面参数</span>
      </button>
    </div>

    <div class="status-bar">
      <span>{{ liveWordCount }} 字</span>
      <span v-if="dirty && !paramsError">· 有未保存修改（{{ autoSaveSeconds }}s 后自动保存）</span>
      <span v-else-if="paramsError" class="err">· 参数有语法错误，已暂停自动保存</span>
      <span v-else-if="lastSavedAt">· 已保存于 {{ lastSavedAt }}</span>
      <span v-if="ws.previewUrl" class="hint">· 站内图片已映射到预览服务</span>
    </div>
  </div>
</template>

<style scoped>
/* 与文章编辑器保持一致的布局节奏。
   高度由外层 .main（列向 flex 容器）通过 flex:1 给定，
   不再用 100vh 计算——否则状态栏会被内容挤出视口底部 */
.editor-page {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 540px;
  padding: 2px 4px 8px;
  gap: 10px;
  box-sizing: border-box;
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
}

.editor-header .title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-1);
}

/* 只读身份行：标题与日期由右侧参数大框维护，这里仅作展示 */
.meta-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
}

.page-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.page-date {
  flex: none;
  font-family: var(--mono);
}

.page-path {
  flex: none;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--mono);
}

.editor-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* 横向布局：预览或参数侧栏任一开启时生效 */
.editor-body.row {
  flex-direction: row;
  gap: 14px;
}

.editor-body > :first-child {
  flex: 1;
  min-width: 0;
}

.editor-body .markdown-body {
  flex: 1;
  min-width: 0;
  overflow: auto;
  padding: 14px 18px;
  border-radius: var(--radius);
  border: 1px solid var(--glass-border);
  background: var(--glass-strong);
}

/* 参数侧栏 */
.params-rail {
  width: 300px;
  flex: none;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 12px;
  box-sizing: border-box;
}

.params-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}

.params-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-1);
}

.params-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2);
}

.yaml-tip {
  line-height: 1.6;
}

.yaml-tip code {
  font-family: var(--mono);
  padding: 1px 4px;
  border-radius: 4px;
  background: var(--accent-soft);
}

.code-editor-wrap {
  border: 1px solid var(--glass-border);
  border-radius: var(--radius);
  background: var(--glass-strong);
  overflow: hidden;
}

.param-editor {
  height: 220px;
}

.param-editor.invalid {
  border-color: var(--danger);
}

.param-error {
  font-size: 12px;
  color: var(--danger);
  line-height: 1.5;
  word-break: break-all;
}

.param-warn {
  font-size: 12px;
  color: var(--warn);
  line-height: 1.5;
}

.param-ok {
  font-size: 12px;
  color: var(--ok);
}

/* 收起态：贴边竖向拉手，悬停点亮，明确可点击 */
.params-open {
  flex: none;
  align-self: stretch;
  width: 30px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  color: var(--text-2);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius);
  background: var(--accent-soft);
  transition: color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}

.params-open:hover {
  color: var(--accent);
  border-color: var(--accent);
  box-shadow: var(--accent-glow);
}

.params-open-label {
  writing-mode: vertical-rl;
  letter-spacing: 2px;
}

.status-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-2);
  flex-wrap: wrap;
}

.status-bar .hint {
  color: var(--accent);
}

.status-bar .err {
  color: var(--danger);
}
</style>
