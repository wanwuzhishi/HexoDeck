<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NButton, NCheckbox, NDatePicker, NIcon, NInput, NPopconfirm, NRadioButton, NRadioGroup, NSpace, NTag } from 'naive-ui'
import { ChevronBackOutline } from '@vicons/ionicons5'
import MarkdownIt from 'markdown-it'
import { useSiteStore } from '../stores/site'
import { useCollectionsStore } from '../stores/collections'
import CollectionIcon from '../components/CollectionIcon.vue'
import { useWorkspaceStore } from '../stores/workspace'
import { useUiStore } from '../stores/ui'
import { message } from '../composables/message'
import { countWords } from '../composables/wordcount'
import {
  FIELD_NAME_RE,
  switchIsOn,
  switchOffOf,
  switchOnOf,
  switchToggle,
  useCustomFields,
  type CustomFieldType
} from '../composables/customFields'
import MarkdownEditor from '../components/MarkdownEditor.vue'
import type { CollectionPostDetail } from '@shared/ipc'

const route = useRoute()
const router = useRouter()
const collections = useCollectionsStore()
const siteStore = useSiteStore()
const ws = useWorkspaceStore()
const ui = useUiStore()

const md = new MarkdownIt({ html: true, linkify: true })

const collectionId = computed(() => String(route.query.collection ?? ''))
const postId = computed(() => String(route.query.post ?? ''))
const def = computed(() => collections.def(collectionId.value))
const detail = ref<CollectionPostDetail | null>(null)
const form = ref({ title: '', date: '', content: '' })
const snapshot = ref('')
const saving = ref(false)
const lastSavedAt = ref('')

const PREVIEW_KEY = 'hexodeck-editor-preview'
const showPreview = ref(localStorage.getItem(PREVIEW_KEY) !== '0')

function togglePreview(): void {
  showPreview.value = !showPreview.value
  localStorage.setItem(PREVIEW_KEY, showPreview.value ? '1' : '0')
}

/** 参数侧栏默认关闭，点击顶部按钮展开 */
const showParams = ref(false)

function toggleParams(): void {
  showParams.value = !showParams.value
}

// ---------- 自定义参数（文章式卡片；文集文章无内置分类/标签表单） ----------

const BUILTIN_KEYS = ['title', 'date']

const {
  customFields,
  fieldLabel,
  applyFrom: applyCustomFields,
  add: addField,
  remove: removeField,
  buildExtra: buildCustomExtra,
  readOnlyMeta,
  setFrontMatter
} = useCustomFields({ builtinKeys: BUILTIN_KEYS, onSnapshot: () => takeSnapshotOnly() })

/** 添加参数弹窗 */
const showAddField = ref(false)
const newFieldKey = ref('')
const newFieldLabel = ref('')
const newFieldType = ref<CustomFieldType>('kv')
const newFieldOn = ref('')
const newFieldOff = ref('')
const addFieldError = ref('')

function openAddField(): void {
  newFieldKey.value = ''
  newFieldLabel.value = ''
  newFieldType.value = 'kv'
  newFieldOn.value = ''
  newFieldOff.value = ''
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
  addField(key, newFieldLabel.value.trim(), {
    type: newFieldType.value,
    onValue: newFieldOn.value.trim() || undefined,
    offValue: newFieldOff.value.trim() || undefined
  })
  showAddField.value = false
}

function removeCustomField(i: number): void {
  removeField(i)
}

/** 仅刷新快照、不触发保存：用于新增空字段这类本地编辑态变更 */
function takeSnapshotOnly(): void {
  snapshot.value = JSON.stringify([form.value.title, form.value.date, form.value.content, customFields.value])
}

const liveWordCount = computed(() => countWords(form.value.content))

const previewHtml = computed(() => {
  const html = md.render(form.value.content)
  return ws.previewUrl ? html.replace(/(src=)"(\/[^"@]*)"/g, `$1="${ws.previewUrl}$2"`) : html
})

function takeSnapshot(): void {
  takeSnapshotOnly()
}

const dirty = computed(() => detail.value !== null && snapshot.value !== JSON.stringify([
  form.value.title,
  form.value.date,
  form.value.content,
  customFields.value
]))

async function load(): Promise<void> {
  if (!collectionId.value || !postId.value) {
    router.replace('/posts')
    return
  }
  // 文集定义可能在路由跳转后尚未加载完成
  if (!def.value) await collections.load()
  if (!def.value) {
    message.warning('文集不存在或已被移除')
    router.replace('/posts')
    return
  }
  const r = await window.api.readCollectionPost(collectionId.value, postId.value)
  if (r.ok && r.data) {
    detail.value = r.data
    form.value = {
      title: r.data.title,
      date: r.data.date,
      content: r.data.content.replace(/\r\n/g, '\n')
    }
    setFrontMatter(r.data.frontMatter ?? {})
    applyCustomFields(r.data.frontMatter ?? {})
    takeSnapshot()
  } else {
    message.error(r.error ?? '读取文章失败')
    router.replace({ path: '/collection', query: { id: collectionId.value } })
  }
}

async function save(): Promise<void> {
  if (!detail.value || saving.value) return
  saving.value = true
  try {
    // form 是响应式 Proxy，直接传数组给 IPC 会因结构化克隆失败
    const r = await window.api.saveCollectionPost(collectionId.value, detail.value.id, {
      title: form.value.title,
      date: form.value.date,
      content: form.value.content,
      extra: { ...buildCustomExtra() }
    })
    if (r.ok) {
      takeSnapshot()
      lastSavedAt.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
      // 重新读取以同步 front-matter（删除的键、YAML 归一化后的值）
      const fresh = await window.api.readCollectionPost(collectionId.value, detail.value.id)
      if (fresh.ok && fresh.data) {
        detail.value = fresh.data
        setFrontMatter(fresh.data.frontMatter ?? {})
        applyCustomFields(fresh.data.frontMatter ?? {})
        takeSnapshot()
      }
      await collections.loadPosts(collectionId.value)
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

async function removePost(): Promise<void> {
  if (!detail.value) return
  try {
    await collections.removePost(collectionId.value, detail.value.id)
    message.success('已删除')
    router.replace({ path: '/collection', query: { id: collectionId.value } })
  } catch (e) {
    message.error((e as Error).message)
  }
}

/** 在资源管理器中定位当前文集文章文件 */
function revealPost(): void {
  if (!detail.value || !siteStore.site) return
  const dirPart = def.value ? (def.value.dir ? def.value.dir + '/' : '') : ''
  void window.api.revealInFolder(siteStore.site.path + '/' + dirPart + detail.value.id)
}

function onKeydown(e: KeyboardEvent): void {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    save()
  }
}

// 站点切换时当前文章属于旧站点，必须清空并回列表，否则会把 A 站文章存进 B 站
watch(
  () => siteStore.site?.path,
  (path, old) => {
    if (!old || path === old) return
    detail.value = null
    form.value = { title: '', date: '', content: '' }
    snapshot.value = ''
    router.replace('/posts')
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
        <span class="title coll-title">
          <CollectionIcon v-if="def" :icon="def.icon" :size="18" />
          {{ def?.name ?? '文集' }}
        </span>
        <n-tag v-if="detail" size="small" :bordered="false">文章</n-tag>
        <n-tag v-if="dirty" type="info" size="small" :bordered="false">未保存</n-tag>
      </n-space>
      <n-space align="center">
        <n-button
          size="small"
          :type="showParams ? 'primary' : 'default'"
          secondary
          :title="showParams ? '收起文章参数侧栏' : '展开文章参数侧栏'"
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
        <n-popconfirm v-if="detail" @positive-click="removePost">
          <template #trigger>
            <n-button quaternary type="error">删除</n-button>
          </template>
          删除后移入系统回收站，确定吗？
        </n-popconfirm>
        <n-button @click="router.push({ path: '/collection', query: { id: collectionId } })">
          返回列表
        </n-button>
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
      <span
        v-if="detail"
        class="muted small page-path path-link"
        :title="'点击打开所在文件夹：' + (def ? def.dir + '/' : '') + detail.id"
        @click="revealPost"
      >{{ def ? def.dir + '/' : '' }}{{ detail.id }}</span>
    </div>

    <div class="editor-body" :class="{ row: showPreview || showParams }">
      <MarkdownEditor v-model="form.content" :dark="ui.isDark" />
      <div v-if="showPreview" class="markdown-body" v-html="previewHtml"></div>

      <aside v-if="showParams" class="params-rail glass">
        <div class="params-head">
          <span class="params-title">文章参数</span>
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
                <n-checkbox
                  v-if="f.type === 'switch'"
                  :checked="switchIsOn(f)"
                  @update:checked="(v: boolean) => switchToggle(f, v)"
                >
                  {{ switchIsOn(f) ? switchOnOf(f) : switchOffOf(f) }}
                </n-checkbox>
                <n-input
                  v-else
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

      <button
        v-else
        class="params-open"
        type="button"
        title="展开文章参数侧栏"
        @click="toggleParams"
      >
        <n-icon :component="ChevronBackOutline" />
        <span class="params-open-label">文章参数</span>
      </button>
    </div>

    <n-modal v-model:show="showAddField" preset="card" title="添加自定义参数" style="width: 420px">
      <div class="muted small" style="margin-bottom: 10px">
        参数名即 front-matter 的键名，如 <code>permalink</code>、<code>cover</code>、<code>summary</code>。
      </div>
      <div class="field-inputs">
        <div class="field-col">
          <div class="field-col-label">中文显示名 <span class="muted small">（可选）</span></div>
          <n-input v-model:value="newFieldLabel" placeholder="如 封面" @keyup.enter="confirmAddField" />
        </div>
        <div class="field-col">
          <div class="field-col-label">英文键名 <span class="muted small">（必填）</span></div>
          <n-input v-model:value="newFieldKey" placeholder="如 cover" @keyup.enter="confirmAddField" />
        </div>
      </div>
      <div class="field-type-row">
        <div class="field-col-label">参数类型</div>
        <n-radio-group v-model:value="newFieldType" size="small">
          <n-radio-button value="kv">键值式</n-radio-button>
          <n-radio-button value="switch">开关式</n-radio-button>
        </n-radio-group>
        <span class="muted small">
          {{ newFieldType === 'switch' ? '在参数栏显示为可勾选的开关' : '填写任意文本值' }}
        </span>
      </div>
      <div v-if="newFieldType === 'switch'" class="field-inputs switch-values">
        <div class="field-col">
          <div class="field-col-label">选中时写入 <span class="muted small">（默认 true）</span></div>
          <n-input v-model:value="newFieldOn" placeholder="true" />
        </div>
        <div class="field-col">
          <div class="field-col-label">取消时写入 <span class="muted small">（默认 false）</span></div>
          <n-input v-model:value="newFieldOff" placeholder="false" />
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
.editor-page {
  flex: 1;
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

.coll-title {
  display: inline-flex;
  align-items: center;
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

.page-path {
  align-self: center;
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

.editor-body.row {
  flex-direction: row;
  gap: 14px;
}

.editor-body.row > :first-child {
  flex: 1;
  min-width: 0;
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

/* 参数侧栏：与文章编辑器同构 */
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
  gap: 8px;
}

.field-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2);
}

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
  font-size: 12px;
  color: var(--text-2);
  display: flex;
  gap: 4px;
}

.hint {
  color: var(--accent);
}

/* 添加参数弹窗 */
/* 参数类型选择行（弹窗内） */
.field-type-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
  flex-wrap: wrap;
}

.switch-values {
  margin-top: 10px;
}

/* 开关式参数卡片：勾选框与卡片内边距协调 */
.custom-item :deep(.n-checkbox) {
  margin: 2px 0;
}

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
</style>
