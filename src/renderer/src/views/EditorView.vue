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
  NSwitch,
  NTag
} from 'naive-ui'
import MarkdownIt from 'markdown-it'
import { usePostsStore } from '../stores/posts'
import { useWorkspaceStore } from '../stores/workspace'
import { useUiStore } from '../stores/ui'
import { message } from '../composables/message'
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
const showPreview = ref(true)
const lastSavedAt = ref('')

const dirty = computed(
  () =>
    detail.value !== null &&
    JSON.stringify([
      form.value.title,
      form.value.date,
      form.value.tags,
      form.value.categories,
      form.value.content
    ]) !== snapshot.value
)

const liveWordCount = computed(() => form.value.content.replace(/\s/g, '').length)

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
    form.value.content
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
      content: form.value.content
    })
    if (r.ok) {
      takeSnapshot()
      lastSavedAt.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
      await posts.load()
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
  form,
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
        <n-space align="center" :size="6">
          <span class="label">分栏预览</span>
          <n-switch v-model:value="showPreview" size="small" />
        </n-space>
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
    <div class="meta-row">
      <n-select
        v-model:value="form.tags"
        multiple
        filterable
        tag
        clearable
        placeholder="标签（输入后回车新建）"
        :options="tagOptions"
        :max-tag-count="6"
        class="select-flex"
      />
      <n-select
        v-model:value="form.categories"
        multiple
        filterable
        tag
        clearable
        placeholder="分类（输入后回车新建）"
        :options="categoryOptions"
        :max-tag-count="6"
        class="select-flex"
      />
    </div>

    <div class="editor-body" :class="{ split: showPreview }">
      <MarkdownEditor v-model="form.content" :dark="ui.isDark" />
      <div v-if="showPreview" class="markdown-body" v-html="previewHtml"></div>
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
.select-flex {
  flex: 1;
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
