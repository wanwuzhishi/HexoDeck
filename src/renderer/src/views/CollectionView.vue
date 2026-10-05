<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NButton, NDataTable, NIcon, NInput, NModal, NPopconfirm, NSpace } from 'naive-ui'
import type { DataTableColumns } from 'naive-ui'
import { useCollectionsStore } from '../stores/collections'
import { useSiteStore } from '../stores/site'
import CollectionIcon from '../components/CollectionIcon.vue'
import { COLLECTION_ICON_PRESETS, isImportedIcon } from '../constants/collectionIcons'
import { CloudUploadOutline } from '@vicons/ionicons5'
import { confirmDialog, message } from '../composables/message'
import type { CollectionPostMeta } from '@shared/ipc'

const route = useRoute()
const router = useRouter()
const collections = useCollectionsStore()
const siteStore = useSiteStore()

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
const editForm = ref({ name: '', icon: 'Book' })
const savingEdit = ref(false)

function openEdit(): void {
  if (!def.value) return
  editForm.value = { name: def.value.name, icon: def.value.icon }
  showEdit.value = true
}

/** 从本地导入文集图标（编辑弹窗用） */
function pickEditIcon(): void {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.png,.jpg,.jpeg,.svg,.webp,.ico'
  input.onchange = () => {
    const file = input.files?.[0]
    if (!file) return
    if (file.size > 200 * 1024) {
      message.error('图标文件过大（超过 200KB），请换一张小图')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      editForm.value.icon = String(reader.result ?? '')
    }
    reader.onerror = () => message.error('读取图片失败')
    reader.readAsDataURL(file)
  }
  input.click()
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

/** 在资源管理器中打开/定位「站点内相对路径」（rel 已含站点根下的完整相对路径） */
function reveal(siteRel: string): void {
  if (!siteStore.site) return
  void window.api.revealInFolder(`${siteStore.site.path}/${siteRel}`)
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
  {
    title: '路径',
    key: 'path',
    render: (row) =>
      h(
        'span',
        {
          class: 'path-link mono-cell',
          title: '点击打开所在文件夹',
          // 路径列显示的含文集目录前缀，跳转同样要用完整相对路径
          onClick: () => reveal(`${def.value?.dir ? `${def.value.dir}/` : ''}${row.id}`)
        },
        `${def.value?.dir ? `${def.value.dir}/` : ''}${row.id}`
      )
  },
  { title: '日期', key: 'date', width: 170 },
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
          <CollectionIcon class="coll-icon" :icon="def.icon" :size="24" />
          <div>
            <!-- 标题行右侧紧跟「编辑 / 移除」：管理入口归属标题，不与主操作混排 -->
            <div class="title-line">
              <div class="panel-title">{{ def.name }}</div>
              <n-space :size="4" align="center">
                <!-- 两个管理按钮同款 secondary：形态一致，悬停时才区分主次（移除变红） -->
                <n-button size="tiny" secondary @click="openEdit">编辑</n-button>
                <n-button size="tiny" secondary class="btn-danger" @click="removeCollection">移除</n-button>
              </n-space>
            </div>
            <div
              class="muted small coll-dir-line path-link"
              :title="def.dir ? '点击打开所在文件夹' : '点击打开站点根目录'"
              @click="reveal(def.dir)"
            >
              目录：站点内 {{ def.dir || '（根目录）' }}
            </div>
          </div>
        </div>
        <!-- 右侧：搜索 → 新建（主操作）→ 刷新；刷新样式与文章页保持一致 -->
        <n-space align="center">
          <n-input
            v-model:value="keyword"
            placeholder="搜索标题"
            clearable
            size="small"
            style="width: 160px"
          />
          <n-button type="primary" @click="showCreate = true">新建{{ def.name }}</n-button>
          <n-button secondary @click="reload">刷新</n-button>
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
        {{ keyword ? '没有匹配的内容' : `「${def?.name ?? ''}」里还没有内容，点击「新建${def?.name ?? ''}」开始创作` }}
      </div>
    </section>

    <n-modal v-model:show="showCreate" preset="card" :title="`新建${def?.name ?? '内容'}`" style="width: 440px">
      <n-input
        v-model:value="createTitle"
        :placeholder="`${def?.name ?? '内容'}标题`"
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
            v-for="p in COLLECTION_ICON_PRESETS"
            :key="p.key"
            type="button"
            class="icon-choice"
            :class="{ active: editForm.icon === p.key }"
            :title="p.label"
            @click="editForm.icon = p.key"
          >
            <n-icon :component="p.comp" :size="17" />
          </button>
          <button
            type="button"
            class="icon-choice icon-choice-import"
            :class="{ active: isImportedIcon(editForm.icon) }"
            :title="isImportedIcon(editForm.icon) ? '重新导入外部图标' : '导入外部图标'"
            @click="pickEditIcon"
          >
            <img
              v-if="isImportedIcon(editForm.icon)"
              class="icon-choice-preview"
              :src="editForm.icon"
              alt=""
            />
            <n-icon v-else :component="CloudUploadOutline" :size="17" />
            <span class="import-badge">+</span>
          </button>
        </div>
        <div class="muted small">
          目录（站点内 {{ def?.dir || '（根目录）' }}）创建后不可更改，
          <span class="path-link" title="点击打开所在文件夹" @click="reveal(def?.dir ?? '')">打开所在文件夹</span>
        </div>
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

/* 标题与「编辑/移除」同行：管理入口贴标题，右侧留给搜索与主操作 */
.title-line {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
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

.icon-choice-preview {
  width: 17px;
  height: 17px;
  object-fit: cover;
  border-radius: 3px;
  display: block;
}

/* 导入图标格：虚线描边 + 右下角加号，与预置图标区分 */
.icon-choice-import {
  position: relative;
  border-style: dashed;
  border-color: var(--accent);
  color: var(--accent);
}

.import-badge {
  position: absolute;
  right: -3px;
  bottom: -3px;
  width: 13px;
  height: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  color: #fff;
  background: var(--accent);
  border-radius: 50%;
  pointer-events: none;
}

.icon-choice.active {
  border-color: var(--accent);
  background: var(--accent-soft);
  box-shadow: var(--accent-glow);
}
</style>
