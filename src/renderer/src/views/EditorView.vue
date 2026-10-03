<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  NButton,
  NDatePicker,
  NInput,
  NPopconfirm,
  NSelect,
  NSpace,
  NTag
} from 'naive-ui'
import MarkdownIt from 'markdown-it'
import { useSiteStore } from '../stores/site'
import { usePostsStore } from '../stores/posts'
import { useWorkspaceStore } from '../stores/workspace'
import { useUiStore } from '../stores/ui'
import { message } from '../composables/message'
import { countWords } from '../composables/wordcount'
import MarkdownEditor from '../components/MarkdownEditor.vue'
import type { PostDetail } from '@shared/ipc'

const route = useRoute()
const router = useRouter()
const posts = usePostsStore()
const siteStore = useSiteStore()
const ws = useWorkspaceStore()
const ui = useUiStore()

const md = new MarkdownIt({ html: true, linkify: true })

const id = computed(() => String(route.query.id ?? ''))
const detail = ref<PostDetail | null>(null)
const form = ref({ title: '', date: '', tags: [] as string[], categories: [] as string[], content: '' })
const snapshot = ref('')
const saving = ref(false)
/** 分栏预览开关：默认开启，用户选择记入 localStorage（下次打开编辑器沿用） */
const PREVIEW_KEY = 'hexodeck-editor-preview'
const showPreview = ref(localStorage.getItem(PREVIEW_KEY) !== '0')

function togglePreview(): void {
  showPreview.value = !showPreview.value
  localStorage.setItem(PREVIEW_KEY, showPreview.value ? '1' : '0')
}

/** 文章参数侧栏：默认展开，选择同样记忆 */
const PARAMS_KEY = 'hexodeck-editor-params'
const showParams = ref(localStorage.getItem(PARAMS_KEY) !== '0')

function toggleParams(): void {
  showParams.value = !showParams.value
  localStorage.setItem(PARAMS_KEY, showParams.value ? '1' : '0')
}

/** 自定义 front-matter 字段（不含内置的 title/date/tags/categories） */
const BUILTIN_KEYS = ['title', 'date', 'tags', 'categories']
const customFields = ref<Array<{ key: string; value: string; label?: string }>>([])

/** 值可能是数组/对象，统一转为可读字符串回填输入框 */
function toFieldValue(v: unknown): string {
  if (v == null) return ''
  if (Array.isArray(v)) return v.map(String).join(', ')
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/**
 * 从 front-matter 提取自定义字段（排除内置项）。
 * 同时并入当前站点登记过的参数名：站点里定义过的参数是本篇没有值也会显示，
 * 方便逐篇填写；未登记但本篇存在的字段同样保留。
 */
function extractCustomFields(fm: Record<string, unknown>): Array<{ key: string; value: string }> {
  const inFile = Object.entries(fm)
    .filter(([k]) => !BUILTIN_KEYS.includes(k))
    .map(([k, v]) => ({ key: k, value: toFieldValue(v) }))

  const sitePath = siteStore.site?.path
  const registered = sitePath ? (loadSiteFieldMap()[sitePath] ?? []) : []
  const seen = new Set(inFile.map((f) => f.key))
  // 登记过但本篇 front-matter 里没有的参数：补一个空值项（显示中文名）
  const extra = registered
    .filter((r) => !seen.has(r.key))
    .map((r) => ({ key: r.key, value: '', label: r.label }))

  return [...inFile, ...extra]
}

/** 侧栏「其他元数据」：非自定义字段、非内置字段的只读展示（如 layout、comments） */
const readOnlyMeta = computed(() => {
  const fm = detail.value?.frontMatter ?? {}
  const customKeys = customFields.value.map((f) => f.key)
  return Object.entries(fm)
    .filter(([k]) => !BUILTIN_KEYS.includes(k) && !customKeys.includes(k))
    .map(([k, v]) => ({ key: k, value: toFieldValue(v) || '（空）' }))
})

/** 站点登记的自定义参数：key 为 front-matter 键名，label 为界面显示名（中文） */
interface SiteField { key: string; label: string }
const SITE_FIELDS_KEY = 'hexodeck-custom-fields'
// 按站点路径绑定；兼容旧版纯字符串数组（无中文名时以键名代显示）
type SiteFieldMap = Record<string, SiteField[]>

function normalizeSiteFields(raw: unknown): SiteField[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      if (typeof item === `string`) return { key: item, label: item }
      const o = item as { key?: unknown; label?: unknown }
      const key = typeof o.key === `string` ? o.key : ``
      if (!key) return null
      const label = typeof o.label === `string` && o.label ? o.label : key
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
  saveSiteFields(sitePath, customFields.value.map((f) => ({ key: f.key, label: (f as { label?: string }).label ?? fieldLabel(f.key) })))
}

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

/** 参数名校验：合法 YAML 键、非内置字段、不重复 */
const FIELD_NAME_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/

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

  // 参数值属于每篇文章各自的内容，这里只登记字段名，值留空由用户填写
  customFields.value.push({ key, value: '', label: newFieldLabel.value.trim() || key })
  persistSiteFields()
  takeSnapshotOnly()
  showAddField.value = false
}

/** 仅刷新快照、不触发保存：用于新增空字段这类本地编辑态变更 */
function takeSnapshotOnly(): void {
  snapshot.value = JSON.stringify([
    form.value.title,
    form.value.date,
    form.value.tags,
    form.value.categories,
    form.value.content,
    customFields.value
  ])
}

function removeCustomField(i: number): void {
  // 移除本篇文章的该字段，并从站点登记表删除（后续文章不再默认显示）
  customFields.value.splice(i, 1)
  persistSiteFields()
}

/** 把自定义字段序列化为 extra 补丁；值为空串时表示删除该键 */
function buildExtra(): Record<string, string | null> {
  const extra: Record<string, string | null> = {}
  for (const f of customFields.value) {
    const key = f.key.trim()
    if (!key) continue
    extra[key] = f.value === '' ? null : f.value
  }
  return extra
}
const lastSavedAt = ref('')

const dirty = computed(
  () =>
    detail.value !== null &&
    JSON.stringify([
      form.value.title,
      form.value.date,
      form.value.tags,
      form.value.categories,
      form.value.content,
      // 自定义参数也纳入脏检查，否则改完不会触发保存
      customFields.value
    ]) !== snapshot.value
)

const liveWordCount = computed(() => countWords(form.value.content))

// 真实预览运行中，把站内绝对路径图片映射到预览服务器
const previewHtml = computed(() => {
  const html = md.render(form.value.content)
  return ws.previewUrl ? html.replace(/(src=)"(\/[^"@]*)"/g, `$1="${ws.previewUrl}$2"`) : html
})

const tagOptions = computed(() => posts.allTags.map((t) => ({ label: t, value: t })))
const categoryOptions = computed(() => posts.allCategories.map((c) => ({ label: c, value: c })))

function takeSnapshot(): void {
  snapshot.value = JSON.stringify([
    form.value.title,
    form.value.date,
    form.value.tags,
    form.value.categories,
    form.value.content,
    customFields.value
  ])
}

async function load(): Promise<void> {
  if (!id.value) return
  const r = await window.api.readPost(id.value)
  if (r.ok && r.data) {
    detail.value = r.data
    form.value = {
      title: r.data.title,
      date: r.data.date,
      tags: [...r.data.tags],
      categories: [...r.data.categories],
      // CodeMirror 内部以 LF 为行分隔符，这里统一后再比较，避免 CRLF 文件被误判为已修改
      content: r.data.content.replace(/\r\n/g, '\n')
    }
    customFields.value = extractCustomFields(r.data.frontMatter ?? {})
    takeSnapshot()
  } else {
    message.error(r.error ?? '读取文章失败')
    router.replace('/posts')
  }
}

async function save(): Promise<void> {
  if (!detail.value || saving.value) return
  saving.value = true
  try {
    // 注意：form 是响应式 Proxy，直接传数组给 IPC 会因结构化克隆失败（An object could not be cloned）
    const r = await window.api.savePost(detail.value.id, {
      title: form.value.title,
      date: form.value.date,
      tags: [...form.value.tags],
      categories: [...form.value.categories],
      content: form.value.content,
      extra: { ...buildExtra() }
    })
    if (r.ok) {
      takeSnapshot()
      lastSavedAt.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
      // 重新读取以同步 front-matter（删除的键、YAML 归一化后的值）
      const fresh = await window.api.readPost(detail.value.id)
      if (fresh.ok && fresh.data) {
        detail.value = fresh.data
        // 用文件内容 + 站点登记表重建（extractCustomFields 已自动并入登记字段），
        // 不会再丢失用户登记的参数
        customFields.value = extractCustomFields(fresh.data.frontMatter ?? {})
        takeSnapshot()
      }
      await posts.load()
    } else {
      message.error(r.error ?? '保存失败')
    }
  } finally {
    saving.value = false
  }
}

// 自动保存：停止输入后按设置延迟静默保存（表单与自定义参数任一变化都触发）
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

async function publishDraft(): Promise<void> {
  if (!detail.value) return
  try {
    const meta = await posts.publish(detail.value.id)
    message.success('草稿已转为正式文章')
    if (meta) router.replace({ path: '/editor', query: { id: meta.id } })
  } catch (e) {
    message.error((e as Error).message)
  }
}

async function removePost(): Promise<void> {
  if (!detail.value) return
  try {
    await posts.remove(detail.value.id)
    message.success('已删除')
    router.replace('/posts')
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

// 站点切换时：当前文章属于旧站点，必须清空编辑状态并回文章列表，
// 否则会把 A 站的文章保存进 B 站（数据串站）；参数侧栏也会随 load 重新提取
watch(
  () => siteStore.site?.path,
  (newPath, oldPath) => {
    if (oldPath === undefined) return // 首次赋值不算切换
    if (newPath === oldPath) return
    if (detail.value) {
      detail.value = null
      snapshot.value = ''
      router.replace('/posts')
      message.info('站点已切换，已返回文章列表')
    }
  }
)

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  posts.load()
  load()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
})
</script>

<template>
  <div class="editor-page">
    <div class="editor-header">
      <n-space align="center">
        <span class="title">编辑器</span>
        <n-tag v-if="detail" :type="detail.kind === 'draft' ? 'warning' : 'success'" size="small" :bordered="false">
          {{ detail.kind === 'draft' ? '草稿' : '正式文章' }}
        </n-tag>
        <n-tag v-if="dirty" type="info" size="small" :bordered="false">未保存</n-tag>
      </n-space>
      <n-space align="center">
        <n-button
          size="small"
          :type="showPreview ? 'primary' : 'default'"
          :secondary="!showPreview"
          :title="showPreview ? '关闭预览（仅显示编辑区）' : '开启预览（分栏显示渲染结果）'"
          @click="togglePreview"
        >
          {{ showPreview ? '◨ 预览已开' : '◧ 预览已关' }}
        </n-button>
        <n-button v-if="detail?.kind === 'draft'" @click="publishDraft">转为正式文章</n-button>
        <n-popconfirm v-if="detail" @positive-click="removePost">
          <template #trigger>
            <n-button quaternary type="error">删除</n-button>
          </template>
          删除后移入系统回收站，确定吗？
        </n-popconfirm>
        <n-button @click="router.push('/posts')">返回列表</n-button>
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
        placeholder="发布日期"
        class="date-picker"
        @update:formatted-value="(v: string | null) => (form.date = v ?? '')"
      />
    </div>

      <div class="editor-body" :class="{ row: showPreview || showParams }">
        <MarkdownEditor v-model="form.content" :dark="ui.isDark" />
        <div v-if="showPreview" class="markdown-body" v-html="previewHtml"></div>

        <!-- 文章参数侧栏：分类、标签与自定义 front-matter 字段 -->
        <aside v-if="showParams" class="params-rail glass">
          <div class="params-head">
            <span class="params-title">文章参数</span>
            <n-button size="tiny" quaternary title="收起参数栏" @click="toggleParams">收起 ›</n-button>
          </div>

          <div class="params-scroll">
            <div class="field-group">
              <div class="field-label">分类</div>
              <n-select
                v-model:value="form.categories"
                multiple
                filterable
                tag
                clearable
                size="small"
                placeholder="输入后回车新建"
                :options="categoryOptions"
              />
            </div>

            <div class="field-group">
              <div class="field-label">标签</div>
              <n-select
                v-model:value="form.tags"
                multiple
                filterable
                tag
                clearable
                size="small"
                placeholder="输入后回车新建"
                :options="tagOptions"
              />
            </div>

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

        <n-button v-else size="tiny" quaternary vertical class="params-open" title="展开文章参数" @click="toggleParams">
          ‹
        </n-button>
      </div>

    <n-modal v-model:show="showAddField" preset="card" title="添加自定义参数" style="width: 420px">
      <div class="muted small" style="margin-bottom: 10px">
        参数名即 front-matter 的键名，如 <code>permalink</code>、<code>cover</code>、<code>sticky</code>、<code>comments</code>。
      </div>
      <div class="field-inputs">
        <div class="field-col">
          <div class="field-col-label">中文显示名 <span class="muted small">（可选）</span></div>
          <n-input
            v-model:value="newFieldLabel"
            placeholder="如 分类"
            @keyup.enter="confirmAddField"
          />
        </div>
        <div class="field-col">
          <div class="field-col-label">英文键名 <span class="muted small">（必填）</span></div>
          <n-input
            v-model:value="newFieldKey"
            placeholder="如 category"
            @keyup.enter="confirmAddField"
          />
        </div>
      </div>
      <div v-if="addFieldError" class="add-field-error">{{ addFieldError }}</div>
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
.editor-page {
  height: 100%;
  min-height: 540px;
  display: flex;
  flex-direction: column;
  padding: 2px 4px 8px;
  gap: 10px;
  box-sizing: border-box;
}
.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-1);
}
.meta-row {
  display: flex;
  gap: 10px;
}
.title-input {
  flex: 1;
}
.date-picker {
  width: 230px;
  flex: none;
}
.editor-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
/* 横向布局：预览或参数侧栏任一开启时生效（侧栏位置不再受预览开关影响） */
.editor-body.row {
  flex-direction: row;
  gap: 14px;
}

/* 文章参数侧栏 */
.params-rail {
  width: 258px;
  flex: none;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-radius: var(--radius);
  overflow: hidden;
}
.params-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 12px;
  border-bottom: 1px solid var(--glass-border);
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
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.field-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.field-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-2);
}
.custom-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.custom-row {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 4px;
  align-items: center;
}
.custom-key {
  font-family: var(--mono);
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
  align-self: flex-start;
  margin-top: 4px;
  height: 68px;
  flex: none;
}
.markdown-body {
  flex: 1;
  min-width: 0;
  overflow: auto;
  padding: 4px 16px;
  border: 1px solid var(--glass-border);
  border-radius: var(--radius);
  background: var(--glass);
  backdrop-filter: blur(18px) saturate(1.5);
  box-shadow: var(--glass-glow);
}
.status-bar {
  font-size: 12px;
  color: var(--text-2);
  display: flex;
  gap: 4px;
}
.hint {
  color: var(--accent);
}
.label {
  font-size: 13px;
  color: var(--text-2);
}
</style>
