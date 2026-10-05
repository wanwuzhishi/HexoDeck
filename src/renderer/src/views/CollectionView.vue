<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NButton, NDataTable, NInput, NModal, NPopconfirm, NSpace } from 'naive-ui'
import type { DataTableColumns } from 'naive-ui'
import { useCollectionsStore, COLLECTION_ICONS } from '../stores/collections'
import { confirmDialog, message } from '../composables/message'
import type { CollectionPostMeta } from '@shared/ipc'

const route = useRoute()
const router = useRouter()
const collections = useCollectionsStore()

const collectionId = computed(() => String(route.query.id ?? ''))
const def = computed(() => collections.def(collectionId.value))
const posts = computed(() => collections.postsOf(collectionId.value))

const keyword = ref('')
const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return posts.value
  return posts.value.filter((p) => p.title.toLowerCase().includes(kw))
})

const showEdit = ref(false)
const editForm = ref({ name: '', icon: COLLECTION_ICONS[0] })
const savingEdit = ref(false)

function openEdit(): void {
  if (!def.value) return
  editForm.value = { name: def.value.name, icon: def.value.icon }
  showEdit.value = true
}

async function saveEdit(): Promise<void> {
  if (!editForm.value.name.trim()) {
    message.warning('请填写文集名称')
    return
  }
  savingEdit.value = true
  try {
    await collections.update(collectionId.value, {
      name: editForm.value.name.trim(),
      icon: editForm.value.icon
    })
    showEdit.value = false
    message.success('文集信息已更新')
  } catch (e) {
    message.error((e as Error).message)
  } finally {
    savingEdit.value = false
  }
}

async function removeCollection(): Promise<void> {
  if (!def.value) return
  const ok = await confirmDialog({
    title: '移除文集',
    content: `确定从侧栏移除「${def.value.name}」吗？仅移除入口，不会删除目录与其中的文件。`,
    positiveText: '移除'
  })
  if (!ok) return
  try {
    await collections.remove(collectionId.value)
    message.success('文集已从侧栏移除')
    router.push('/')
  } catch (e) {
    message.error((e as Error).message)
  }
}

const creating = ref(false)
const showCreate = ref(false)
const createTitle = ref('')

async function doCreate(): Promise<void> {
  if (!createTitle.value.trim()) {
    message.warning('请填写文章标题')
    return
  }
  creating.value = true
  try {
    const meta = await collections.createPost(collectionId.value, createTitle.value.trim())
    showCreate.value = false
    createTitle.value = ''
    openEditor(meta)
  } catch (e) {
    message.error((e as Error).message)
  } finally {
    creating.value = false
  }
}

function openEditor(row: CollectionPostMeta): void {
  router.push({ path: '/collection-editor', query: { collection: collectionId.value, post: row.id } })
}

async function remove(row: CollectionPostMeta): Promise<void> {
  try {
    await collections.removePost(collectionId.value, row.id)
    message.success('已删除（移入回收站）')
  } catch (e) {
    message.error((e as Error).message)
  }
}

const columns: DataTableColumns<CollectionPostMeta> = [
  {
    title: '标题',
    key: 'title',
    render: (row) => h('a', { class: 'post-link', onClick: () => openEditor(row) }, row.title)
  },
  { title: '日期', key: 'date', width: 180 },
  { title: '字数', key: 'wordCount', width: 80 },
  {
    title: '操作',
    key: 'actions',
    width: 150,
    render: (row) =>
      h(NSpace, { size: 6 }, {
        default: () => [
          h(
            NButton,
            { size: 'tiny', secondary: true, onClick: () => openEditor(row) },
            { default: () => '编辑' }
          ),
          h(
            NPopconfirm,
            { onPositiveClick: () => remove(row) },
            {
              trigger: () =>
                h(
                  NButton,
                  { size: 'tiny', secondary: true, class: 'btn-danger' },
                  { default: () => '删除' }
                ),
              default: () => '删除后移入系统回收站，确定吗？'
            }
          )
        ]
      })
  }
]

async function reload(): Promise<void> {
  if (!collectionId.value) return
  await collections.load()
  if (!def.value) {
    message.warning('文集不存在或已被移除')
    router.replace('/')
    return
  }
  await collections.loadPosts(collectionId.value)
}

onMounted(reload)
watch(collectionId, reload)
</script>

<template>
  <div class="page">
    <section v-if="def" class="glass panel">
      <div class="panel-head">
        <div class="head-title-row">
          <span class="coll-icon">{{ def.icon }}</span>
          <div>
            <div class="panel-title">{{ def.name }}</div>
            <div class="muted small coll-dir-line" :title="def.dir">目录：站点内 {{ def.dir }}</div>
          </div>
        </div>
        <n-space>
          <n-input
            v-model:value="keyword"
            placeholder="搜索标题"
            clearable
            size="small"
            style="width: 160px"
          />
          <n-button size="tiny" secondary @click="openEdit">编辑文集</n-button>
          <n-button size="tiny" type="error" quaternary @click="removeCollection">移除文集</n-button>
          <n-button type="primary" @click="showCreate = true">新建文章</n-button>
        </n-space>
      </div>

      <n-data-table
        class="posts-table"
        :columns="columns"
        :data="filtered"
        :row-key="(row: CollectionPostMeta) => row.id"
        :bordered="false"
        size="small"
      />
      <div v-if="!filtered.length" class="muted small empty-line">
        {{ keyword ? '没有匹配的文章' : '文集里还没有文章，点击「新建文章」开始创作' }}
      </div>
    </section>

    <n-modal v-model:show="showCreate" preset="card" title="新建文章" style="width: 440px">
      <n-input
        v-model:value="createTitle"
        placeholder="文章标题"
        maxlength="80"
        @keyup.enter="doCreate"
      />
      <template #footer>
        <n-space justify="end">
          <n-button @click="showCreate = false">取消</n-button>
          <n-button type="primary" :loading="creating" @click="doCreate">创建并打开编辑器</n-button>
        </n-space>
      </template>
    </n-modal>

    <n-modal v-model:show="showEdit" preset="card" title="编辑文集" style="width: 480px">
      <div class="edit-form">
        <div class="edit-label">名称（最多 8 个字）</div>
        <n-input v-model:value="editForm.name" maxlength="8" show-count placeholder="文集名称" />
        <div class="edit-label">图标</div>
        <div class="icon-picker">
          <button
            v-for="ic in COLLECTION_ICONS"
            :key="ic"
            type="button"
            class="icon-choice"
            :class="{ active: editForm.icon === ic }"
            @click="editForm.icon = ic"
          >
            {{ ic }}
          </button>
        </div>
        <div class="muted small">目录（站点内 {{ def?.dir }}）创建后不可更改</div>
      </div>
      <template #footer>
        <n-space justify="end">
          <n-button @click="showEdit = false">取消</n-button>
          <n-button type="primary" :loading="savingEdit" @click="saveEdit">保存</n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<style scoped>
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 10px;
}

.head-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.coll-icon {
  font-size: 24px;
  line-height: 1;
}

.panel-title {
  margin-bottom: 0;
}

.coll-dir-line {
  margin-top: 2px;
}

.posts-table {
  background: transparent;
}

.posts-table :deep(.n-data-table-th),
.posts-table :deep(.n-data-table-td) {
  background: transparent;
}

.post-link {
  cursor: pointer;
  color: var(--accent);
  text-decoration: none;
}

.post-link:hover {
  text-decoration: underline;
}

.empty-line {
  margin-top: 8px;
}

.edit-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.edit-label {
  font-size: 12px;
  color: var(--text-2);
}

.icon-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.icon-choice {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
  border: 1px solid var(--glass-border);
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.icon-choice:hover {
  background: var(--accent-soft);
}

.icon-choice.active {
  border-color: var(--accent);
  background: var(--accent-soft);
  box-shadow: var(--accent-glow);
}
</style>
