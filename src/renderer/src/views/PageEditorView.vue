<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NButton, NDatePicker, NIcon, NInput, NPopconfirm, NSpace, NTag } from 'naive-ui'
import { ChevronBackOutline } from '@vicons/ionicons5'
import MarkdownIt from 'markdown-it'
import { useSiteStore } from '../stores/site'
import { usePagesStore } from '../stores/pages'
import { useWorkspaceStore } from '../stores/workspace'
import { useUiStore } from '../stores/ui'
import { message } from '../composables/message'
import { countWords } from '../composables/wordcount'
import { FIELD_NAME_RE, useCustomFields } from '../composables/customFields'
import MarkdownEditor from '../components/MarkdownEditor.vue'
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

/** 参数侧栏默认关闭，点击顶部按钮展开；选择按站点记忆 */
const PARAMS_KEY = 'hexodeck-editor-params'
const showParams = ref(localStorage.getItem(PARAMS_KEY) === '1')

function toggleParams(): void {
  showParams.value = !showParams.value
  localStorage.setItem(PARAMS_KEY, showParams.value ? '1' : '0')
}

// ---------- 页面参数：与文章编辑器共用同一套「参数名 + 值」卡片逻辑 ----------

/** 页面的内置字段（由上方表单维护，不计入自定义参数） */
const BUILTIN_KEYS = ['title', 'date']

const {
  customFields,
  fieldLabel,
  applyFrom,
  add: addField,
  remove: removeField,
  buildExtra,
  readOnlyMeta,
  setFrontMatter
} = useCustomFields({ builtinKeys: BUILTIN_KEYS, onSnapshot: () => takeSnapshot() })

/** 添加参数弹窗 */
const showAddField = ref(false)
const newFieldKey = ref('')
const newFieldLabel = ref('')
const addFieldError = ref('')

function openAddField(): void {
  newFieldKey.value = ''
  newFieldLabel.value = ''
  addFieldError.value = ''
  showAddField.value = true
}

function confirmAddField(): void {
  const key = newFieldKey.value.trim()
  if (!key) return
  if (!FIELD_NAME_RE.test(key)) {
    addFieldError.value = '参数名只能包含字母、数字、下划线和连字符，且不能以数字开头'
    return
  }
  if (BUILTIN_KEYS.includes(key)) {
    addFieldError.value = `${key} 是内置字段，无需添加`
    return
  }
  if (customFields.value.some((f) => f.key === key)) {
    addFieldError.value = `参数 ${key} 已存在`
    return
  }
  addField(key, newFieldLabel.value.trim())
  showAddField.value = false
}

function removeCustomField(i: number): void {
  removeField(i)
}

const liveWordCount = computed(() => countWords(form.value.content))

const previewHtml = computed(() => {
  const html = md.render(form.value.content)
  return ws.previewUrl ? html.replace(/(src=)"(\/[^"@]*)"/g, `$1="${ws.previewUrl}$2"`) : html
})

function takeSnapshot(): void {
  snapshot.value = JSON.stringify([form.value.title, form.value.date, form.value.content, customFields.value])
}

const dirty = computed(
  () =>
    detail.value !== null &&
    JSON.stringify([form.value.title, form.value.date, form.value.content, customFields.value]) !==
      snapshot.value
)

async function load(): Promise<void> {
  if (!id.value) return
  const r = await window.api.readPage(id.value)
  if (r.ok && r.data) {
    detail.value = r.data
    form.value = {
      title: r.data.title,
      date: r.data.date,
      // CodeMirror 以 LF 为行分隔符，统一后再比较，避免 CRLF 文件被误判为已修改
      content: r.data.content.replace(/\r\n/g, '\n')
    }
    setFrontMatter(r.data.frontMatter ?? {})
    applyFrom(r.data.frontMatter ?? {})
    takeSnapshot()
  } else {
    message.error(r.error ?? '读取页面失败')
    router.replace('/pages')
  }
}

async function save(): Promise<void> {
  if (!detail.value || saving.value) return
  saving.value = true
  try {
    // 注意：form 是响应式 Proxy，直接传对象给 IPC 会因结构化克隆失败
    const r = await window.api.savePage(detail.value.id, {
      title: form.value.title,
      date: form.value.date,
      content: form.value.content,
      extra: { ...buildExtra() }
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
        setFrontMatter(fresh.data.frontMatter ?? {})
        applyFrom(fresh.data.frontMatter ?? {})
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

// 自动保存：停止输入后按设置延迟静默保存
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null
watch(
  [form, customFields],
  () => {
    if (!detail.value || !dirty.value) return
    if (autoSaveTimer) clearTimeout(autoSaveTimer)
    autoSaveTimer = setTimeout(() => {
      if (dirty.value) save()
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

    <div class="meta-row">
      <n-input v-model:value="form.title" placeholder="标题" class="title-input" />
      <n-date-picker
        :formatted-value="form.date || null"
        type="datetime"
        format="yyyy-MM-dd HH:mm:ss"
        placeholder="日期"
        class="date-picker"
        @update:formatted-value="(v: string | null) => (form.date = v ?? '')"
      />
      <span v-if="detail" class="muted small page-path" :title="detail.id">source/{{ detail.id }}</span>
    </div>

    <div class="editor-body" :class="{ row: showPreview || showParams }">
      <MarkdownEditor v-model="form.content" :dark="ui.isDark" />
      <div v-if="showPreview" class="markdown-body" v-html="previewHtml"></div>

      <!-- 页面参数侧栏：与文章编辑器一致的「参数名 + 值」卡片 -->
      <aside v-if="showParams" class="params-rail glass">
        <div class="params-head">
          <span class="params-title">页面参数</span>
          <n-button size="tiny" quaternary title="收起参数栏" @click="toggleParams">收起 ›</n-button>
        </div>

        <div class="params-scroll">
          <div class="field-group">
            <div class="field-label">自定义参数</div>
            <div v-if="customFields.length" class="custom-list">
              <div v-for="(f, i) in customFields" :key="f.key" class="custom-item">
                <div class="custom-head">
                  <span class="custom-name" :title="f.key">{{ fieldLabel(f.key) }}</span>
                  <n-button size="tiny" quaternary type="error" title="移除该参数" @click="removeCustomField(i)">
                    移除
                  </n-button>
                </div>
                <n-input
                  v-model:value="f.value"
                  size="small"
                  type="textarea"
                  :autosize="{ minRows: 1, maxRows: 4 }"
                  :placeholder="`${fieldLabel(f.key)} 的值`"
                />
              </div>
            </div>
            <div v-else class="muted small">尚未添加自定义参数</div>
            <n-button size="small" block secondary class="add-param-btn" @click="openAddField">
              ＋ 添加自定义参数
            </n-button>
          </div>

          <div class="field-group">
            <div class="field-label">其他元数据</div>
            <div class="meta-list">
              <div v-for="m in readOnlyMeta" :key="m.key" class="meta-row-item">
                <span class="meta-key" :title="m.key">{{ m.key }}</span>
                <span class="meta-val" :title="m.value">{{ m.value }}</span>
              </div>
              <div v-if="!readOnlyMeta.length" class="muted small">无</div>
            </div>
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

    <n-modal v-model:show="showAddField" preset="card" title="添加自定义参数" style="width: 420px">
      <div class="muted small" style="margin-bottom: 10px">
        参数名即 front-matter 的键名，如 <code>permalink</code>、<code>layout</code>、<code>comments</code>。
      </div>
      <div class="field-inputs">
        <div class="field-col">
          <div class="field-col-label">中文显示名 <span class="muted small">（可选）</span></div>
          <n-input v-model:value="newFieldLabel" placeholder="如 布局" @keyup.enter="confirmAddField" />
        </div>
        <div class="field-col">
          <div class="field-col-label">英文键名 <span class="muted small">（必填）</span></div>
          <n-input v-model:value="newFieldKey" placeholder="如 layout" @keyup.enter="confirmAddField" />
        </div>
      </div>
      <div v-if="addFieldError" class="add-field-error">{{ addFieldError }}</div>
      <template #footer>
        <n-space justify="end">
          <n-button @click="showAddField = false">取消</n-button>
          <n-button type="primary" :disabled="!newFieldKey.trim()" @click="confirmAddField">添加</n-button>
        </n-space>
      </template>
    </n-modal>

    <div class="status-bar">
      <span>{{ liveWordCount }} 字</span>
      <span v-if="dirty">· 有未保存修改（{{ autoSaveSeconds }}s 后自动保存）</span>
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

.meta-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.title-input {
  flex: 1;
  min-width: 0;
}

.date-picker {
  width: 210px;
  flex: none;
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

.effective-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
}

.meta-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.meta-row-item {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 5px 8px;
  border-radius: 8px;
  background: var(--accent-soft);
}

.meta-key {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--text-2);
  flex: none;
}

.meta-val {
  font-size: 12px;
  color: var(--text-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 收起态：贴边竖向拉手，悬停点亮，明确可点击 */
.custom-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.custom-item {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 8px 10px;
  border: 1px solid var(--glass-border);
  border-radius: 10px;
  background: var(--accent-soft);
}

.custom-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.custom-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.add-param-btn {
  margin-top: 8px;
}

/* 添加参数弹窗：中文显示名（左）/ 英文键名（右） */
.field-inputs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.field-col {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.field-col-label {
  font-size: 12px;
  color: var(--text-1);
}

.add-field-error {
  margin-top: 10px;
  font-size: 12px;
  color: var(--danger);
}

.meta-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.meta-row-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  padding: 3px 6px;
  border-radius: 6px;
  background: var(--accent-soft);
}

.meta-key {
  font-family: var(--mono);
  color: var(--accent);
  flex: none;
}

.meta-val {
  color: var(--text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

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
