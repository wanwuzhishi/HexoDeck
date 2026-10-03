<script setup lang="ts">
import { h, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  NButton,
  NCard,
  NDataTable,
  NInput,
  NModal,
  NPopconfirm,
  NSpace,
  NTag
} from 'naive-ui'
import type { DataTableColumns } from 'naive-ui'
import { usePostsStore } from '../stores/posts'
import { message } from '../composables/message'
import type { PostMeta } from '@shared/ipc'

const posts = usePostsStore()
const router = useRouter()

const showCreate = ref(false)
const createKind = ref<'post' | 'draft'>('post')
const createTitle = ref('')
const creating = ref(false)

function openEditor(row: PostMeta): void {
  router.push({ path: '/editor', query: { id: row.id } })
}

async function remove(row: PostMeta): Promise<void> {
  try {
    await posts.remove(row.id)
    message.success('已删除（移入回收站）')
  } catch (e) {
    message.error((e as Error).message)
  }
}

const columns: DataTableColumns<PostMeta> = [
  {
    title: '标题',
    key: 'title',
    render: (row) =>
      h(
        'a',
        { class: 'post-link', onClick: () => openEditor(row) },
        row.title
      )
  },
  {
    title: '状态',
    key: 'kind',
    width: 80,
    render: (row) =>
      h(
        NTag,
        { type: row.kind === 'draft' ? 'warning' : 'success', size: 'small', bordered: false },
        { default: () => (row.kind === 'draft' ? '草稿' : '正式') }
      )
  },
  { title: '日期', key: 'date', width: 180 },
  {
    title: '标签',
    key: 'tags',
    render: (row) => (row.tags.length ? h('span', row.tags.join('、')) : h('span', { class: 'muted-cell' }, '—'))
  },
  {
    title: '分类',
    key: 'categories',
    render: (row) =>
      row.categories.length ? h('span', row.categories.join('、')) : h('span', { class: 'muted-cell' }, '—')
  },
  { title: '字数', key: 'wordCount', width: 80 },
  {
    title: '操作',
    key: 'actions',
    width: 150,
    render: (row) =>
      h(NSpace, { size: 6 }, {
        default: () => [
          h(NButton, { size: 'tiny', secondary: true, onClick: () => openEditor(row) }, { default: () => '编辑' }),
          h(
            NPopconfirm,
            { onPositiveClick: () => remove(row) },
            {
              trigger: () =>
                h(NButton, { size: 'tiny', type: 'error', quaternary: true }, { default: () => '删除' }),
              default: () => '删除后移入系统回收站，确定吗？'
            }
          )
        ]
      })
  }
]

function openCreate(kind: 'post' | 'draft'): void {
  createKind.value = kind
  createTitle.value = ''
  showCreate.value = true
}

async function doCreate(): Promise<void> {
  if (!createTitle.value.trim()) {
    message.warning('请填写标题')
    return
  }
  creating.value = true
  try {
    const meta = await posts.create(createKind.value, createTitle.value.trim())
    showCreate.value = false
    if (meta) openEditor(meta)
  } catch (e) {
    message.error((e as Error).message)
  } finally {
    creating.value = false
  }
}

onMounted(() => {
  if (!posts.loaded) posts.load()
})
</script>

<template>
  <div class="page page-full">
    <n-card :bordered="false">
      <template #header>文章管理</template>
      <template #header-extra>
        <n-space>
          <n-input
            v-model:value="posts.keyword"
            placeholder="搜索标题 / 标签 / 分类"
            clearable
            style="width: 220px"
          />
          <n-button type="primary" @click="openCreate('post')">新建文章</n-button>
          <n-button @click="openCreate('draft')">新建草稿</n-button>
          <n-button quaternary @click="posts.load()">刷新</n-button>
        </n-space>
      </template>

      <n-data-table
        :columns="columns"
        :data="posts.filtered"
        :row-key="(row: PostMeta) => row.id"
        :bordered="false"
        size="small"
        style="margin-top: 12px"
      />
    </n-card>

    <n-modal v-model:show="showCreate" preset="card" style="width: 440px" :title="createKind === 'post' ? '新建文章' : '新建草稿'">
      <n-input v-model:value="createTitle" placeholder="文章标题" @keyup.enter="doCreate" />
      <template #footer>
        <n-space justify="end">
          <n-button @click="showCreate = false">取消</n-button>
          <n-button type="primary" :loading="creating" @click="doCreate">创建并打开编辑器</n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<style scoped>
.page-full {
  height: 100vh;
  display: flex;
  flex-direction: column;
}
.post-link {
  cursor: pointer;
  color: #2080f0;
  text-decoration: none;
}
.post-link:hover {
  text-decoration: underline;
}
.muted-cell {
  opacity: 0.4;
}
</style>
