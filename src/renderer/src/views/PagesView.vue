<script setup lang="ts">
import { h, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  NButton,
  NDataTable,
  NForm,
  NFormItem,
  NInput,
  NModal,
  NPopconfirm,
  NSpace
} from 'naive-ui'
import type { DataTableColumns } from 'naive-ui'
import { usePagesStore } from '../stores/pages'
import { useWorkspaceStore } from '../stores/workspace'
import { message } from '../composables/message'
import CodeEditor from '../components/CodeEditor.vue'
import { useUiStore } from '../stores/ui'
import type { PageMeta } from '@shared/ipc'

const pages = usePagesStore()
const ws = useWorkspaceStore()
const ui = useUiStore()
const router = useRouter()

/** 新建页面的初始参数模板：Hexo 页面通常需要 layout: page */
const DEFAULT_FRONT_MATTER = 'layout: page\n'

const showCreate = ref(false)
const creating = ref(false)
const form = ref({ title: '', path: '', yaml: DEFAULT_FRONT_MATTER })

function openEditor(row: PageMeta): void {
  router.push({ path: '/page-editor', query: { id: row.id } })
}

async function remove(row: PageMeta): Promise<void> {
  try {
    await pages.remove(row.id)
    message.success('已删除（移入回收站）')
  } catch (e) {
    message.error((e as Error).message)
  }
}

const columns: DataTableColumns<PageMeta> = [
  {
    title: '标题',
    key: 'title',
    render: (row) => h('a', { class: 'page-link', onClick: () => openEditor(row) }, row.title)
  },
  {
    title: '路径',
    key: 'id',
    render: (row) => h('span', { class: 'mono-cell' }, `source/${row.id}`)
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

function openCreate(): void {
  form.value = { title: '', path: '', yaml: DEFAULT_FRONT_MATTER }
  showCreate.value = true
}

/** 由标题推导默认路径（英文标题即可直接用，中文标题留空由用户填写） */
function suggestPath(): void {
  if (form.value.path.trim()) return
  const slug = form.value.title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (slug) form.value.path = slug
}

async function doCreate(): Promise<void> {
  if (!form.value.title.trim()) {
    message.warning('请填写页面标题')
    return
  }
  creating.value = true
  try {
    const meta = await pages.create({
      title: form.value.title.trim(),
      path: form.value.path.trim(),
      frontMatterYaml: form.value.yaml
    })
    showCreate.value = false
    message.success(`页面已创建：source/${meta.id}`)
    openEditor(meta)
  } catch (e) {
    message.error((e as Error).message)
  } finally {
    creating.value = false
  }
}

onMounted(() => {
  if (!pages.loaded) pages.load()
})

// 文件变更（含新建页面/生成站点）后刷新列表
watch(
  () => ws.previewRefreshTick,
  () => pages.load()
)
</script>

<template>
  <div class="page">
    <section class="glass panel">
      <div class="panel-head">
        <div class="panel-title">页面管理</div>
        <n-space>
          <n-input
            v-model:value="pages.keyword"
            placeholder="搜索标题 / 路径"
            clearable
            style="width: 200px"
          />
          <n-button type="primary" @click="openCreate">新建页面</n-button>
          <n-button secondary @click="pages.load()">刷新</n-button>
        </n-space>
      </div>
      <div class="muted small hint">
        页面是 <code>source/</code> 下不属于文章目录的 Markdown 文件（如 <code>about/index.md</code>），
        常用于「关于」「留言板」「友链」等独立页面。这里只列出页面，
        <code>_posts/</code> 与 <code>_drafts/</code> 中的文章请在「文章」页管理。
      </div>

      <n-data-table
        class="pages-table"
        :columns="columns"
        :data="pages.filtered"
        :row-key="(row: PageMeta) => row.id"
        :bordered="false"
        size="small"
      />
      <div v-if="pages.loaded && !pages.pages.length" class="muted small empty">
        还没有页面，点击「新建页面」创建一个（例如路径填 <code>about/index</code>）。
      </div>
    </section>

    <n-modal v-model:show="showCreate" preset="card" title="新建页面" style="width: 620px">
      <n-form label-placement="left" :label-width="86">
        <n-form-item label="页面标题">
          <n-input
            v-model:value="form.title"
            placeholder="例如：关于"
            @blur="suggestPath"
          />
        </n-form-item>
        <n-form-item label="页面路径">
          <n-input v-model:value="form.path" placeholder="相对 source，如 about/index 或 contact" />
        </n-form-item>
        <n-form-item label="页面参数">
          <div class="yaml-block">
            <div class="muted small yaml-hint">
              直接写 front-matter（YAML），创建后仍可在编辑器里修改。内置的
              <code>title</code>、<code>date</code> 会自动生成，无需在此填写。
            </div>
            <div class="code-editor-wrap create-editor">
              <CodeEditor v-model="form.yaml" :dark="ui.isDark" placeholder="layout: page" />
            </div>
          </div>
        </n-form-item>
      </n-form>
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
.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 10px;
}

.hint {
  margin-bottom: 10px;
  line-height: 1.8;
}

.hint code,
.empty code,
.yaml-hint code {
  font-family: var(--mono);
  padding: 1px 5px;
  border-radius: 5px;
  background: var(--accent-soft);
}

.pages-table {
  background: transparent;
}

.pages-table :deep(.n-data-table-th),
.pages-table :deep(.n-data-table-td) {
  background: transparent;
}

.page-link {
  cursor: pointer;
  color: var(--accent);
  text-decoration: none;
}

.page-link:hover {
  text-decoration: underline;
}

.mono-cell {
  font-family: var(--mono);
  font-size: 12px;
  color: var(--text-2);
}

.empty {
  margin-top: 10px;
}

/* 新建弹窗里的 YAML 输入区 */
.yaml-block {
  width: 100%;
}

.yaml-hint {
  margin-bottom: 6px;
  line-height: 1.7;
}

.code-editor-wrap {
  border: 1px solid var(--glass-border);
  border-radius: var(--radius);
  background: var(--glass-strong);
  overflow: hidden;
}

.create-editor {
  height: 160px;
}
</style>
