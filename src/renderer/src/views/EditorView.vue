<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  NButton,
  NCard,
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
import { message } from '../composables/message'
import type { PostDetail } from '@shared/ipc'

const route = useRoute()
const router = useRouter()
const posts = usePostsStore()

const md = new MarkdownIt({ html: true, linkify: true })

const id = computed(() => String(route.query.id ?? ''))
const detail = ref<PostDetail | null>(null)
const form = ref({ title: '', date: '', tags: [] as string[], categories: [] as string[], content: '' })
const snapshot = ref('')
const saving = ref(false)
const showPreview = ref(true)

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

const previewHtml = computed(() => md.render(form.value.content))

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
      content: r.data.content
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
    const r = await window.api.savePost(detail.value.id, {
      title: form.value.title,
      date: form.value.date,
      tags: form.value.tags,
      categories: form.value.categories,
      content: form.value.content
    })
    if (r.ok) {
      takeSnapshot()
      message.success('已保存')
      await posts.load()
    } else {
      message.error(r.error ?? '保存失败')
    }
  } finally {
    saving.value = false
  }
}

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
})
</script>

<template>
  <div class="page editor-page">
    <n-card :bordered="false" class="editor-card">
      <template #header>
        <n-space align="center">
          <span>编辑器</span>
          <n-tag v-if="detail" :type="detail.kind === 'draft' ? 'warning' : 'success'" size="small" :bordered="false">
            {{ detail.kind === 'draft' ? '草稿' : '正式文章' }}
          </n-tag>
          <n-tag v-if="dirty" type="info" size="small" :bordered="false">未保存</n-tag>
        </n-space>
      </template>
      <template #header-extra>
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
      </template>

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
        <n-input
          v-model:value="form.content"
          type="textarea"
          class="content-input"
          placeholder="正文（Markdown）"
          :input-props="{ spellcheck: false }"
        />
        <div v-if="showPreview" class="markdown-body" v-html="previewHtml"></div>
      </div>
    </n-card>
  </div>
</template>

<style scoped>
.editor-page {
  height: 100vh;
  display: flex;
}
.editor-card {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.editor-card :deep(.n-card__content) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.meta-row {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
}
.title-input {
  flex: 1;
}
.date-picker {
  width: 230px;
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
.content-input {
  flex: 1;
  height: 100%;
}
.content-input :deep(textarea) {
  height: 100%;
  font-family: Consolas, 'Courier New', monospace;
  font-size: 14px;
  line-height: 1.7;
  resize: none;
}
.markdown-body {
  flex: 1;
  overflow: auto;
  padding: 4px 14px;
  border: 1px solid rgba(128, 128, 128, 0.25);
  border-radius: 4px;
}
.label {
  font-size: 13px;
  opacity: 0.7;
}
</style>
