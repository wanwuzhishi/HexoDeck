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
const customFields = ref<Array<{ key: string; value: string }>>([])

/** 值可能是数组/对象，统一转为可读字符串回填输入框 */
function toFieldValue(v: unknown): string {
  if (v == null) return ''
  if (Array.isArray(v)) return v.map(String).join(', ')
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/** 从 front-matter 提取自定义字段（排除内置项） */
function extractCustomFields(fm: Record<string, unknown>): Array<{ key: string; value: string }> {
  return Object.entries(fm)
    .filter(([k]) => !BUILTIN_KEYS.includes(k))
    .map(([k, v]) => ({ key: k, value: toFieldValue(v) }))
}

/** 侧栏「其他元数据」：非自定义字段、非内置字段的只读展示（如 layout、comments） */
const readOnlyMeta = computed(() => {
  const fm = detail.value?.frontMatter ?? {}
  const customKeys = customFields.value.map((f) => f.key)
  return Object.entries(fm)
    .filter(([k]) => !BUILTIN_KEYS.includes(k) && !customKeys.includes(k))
    .map(([k, v]) => ({ key: k, value: toFieldValue(v) || '（空）' }))
})

function addCustomField(): void {
  customFields.value.push({ key: '', value: '' })
  // 空键不会写入文件（见 buildExtra），但要让脏检查认为无改动，
  // 否则自动保存会立刻重载文件、把刚添加的空行冲掉
  takeSnapshotOnly()
}

/** 仅刷新快照、不触发保存：用于新增空行这类本地编辑态变更 */
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
  customFields.value.splice(i, 1)
  // 不在此处立即保存：等自动保存触发即可，避免保存后重载把其他编辑中的空行一并清掉
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
        // 仅当没有待填写的空行时才用文件内容重建，避免把编辑中的新参数冲掉
        const hasBlankRow = customFields.value.some((f) => !f.key.trim())
        if (!hasBlankRow) {
          customFields.value = extractCustomFields(fresh.data.frontMatter ?? {})
        }
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

      <div class="editor-body" :class="{ split: showPreview, 'with-params': showParams }">
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
              <div class="field-label">
                自定义参数
                <n-button size="tiny" quaternary title="新增参数" @click="addCustomField">＋</n-button>
              </div>
              <div v-if="customFields.length" class="custom-list">
                <div v-for="(f, i) in customFields" :key="i" class="custom-row">
                  <n-input
                    v-model:value="f.key"
                    size="tiny"
                    placeholder="键"
                    class="custom-key"

                  />
                  <n-input
                    v-model:value="f.value"
                    size="tiny"
                    placeholder="值"
                    class="custom-value"

                  />
                  <n-button size="tiny" quaternary type="error" title="删除该参数" @click="removeCustomField(i)">
                    ✕
                  </n-button>
                </div>
              </div>
              <div v-else class="muted small">
                可添加任意 front-matter 字段，如 <code>permalink</code>、<code>cover</code>、<code>sticky</code>
              </div>
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
.editor-body.split {
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
