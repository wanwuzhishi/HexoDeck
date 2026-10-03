<script setup lang="ts">
import { ref } from 'vue'
import { NButton, NDescriptions, NDescriptionsItem, NEmpty, NForm, NFormItem, NInput, NInputGroup, NModal, NPopconfirm, NSpace } from 'naive-ui'
import { useSiteStore } from '../stores/site'
import { message } from '../composables/message'

const siteStore = useSiteStore()

const showCreate = ref(false)
const creating = ref(false)
const createForm = ref({ name: '', parentDir: '' })
const switching = ref('')

async function switchTo(path: string): Promise<void> {
  switching.value = path
  try {
    const r = await siteStore.open(path)
    if (r.ok) message.success('已切换站点')
    else message.error(r.error ?? '切换失败')
  } finally {
    switching.value = ''
  }
}

async function removeSite(r: { path: string; name: string }): Promise<void> {
  await siteStore.removeRecent(r.path)
  message.success(`已从列表移除 ${r.name}（磁盘文件未删除）`)
}

function refreshRecents(): void {
  void siteStore.loadRecents()
}

async function pickParentDir(): Promise<void> {
  const dir = await window.api.pickDirectory()
  if (dir) createForm.value.parentDir = dir
}

async function doCreate(): Promise<void> {
  if (!createForm.value.name.trim()) {
    message.warning('请填写站点名称')
    return
  }
  if (!createForm.value.parentDir) {
    message.warning('请选择站点存放位置')
    return
  }
  creating.value = true
  try {
    const r = await siteStore.createSite(createForm.value.name.trim(), createForm.value.parentDir)
    if (r.ok) {
      message.success('站点创建成功')
      showCreate.value = false
      createForm.value = { name: '', parentDir: '' }
    } else {
      message.error(r.error ?? '创建失败')
    }
  } finally {
    creating.value = false
  }
}

async function closeSite(): Promise<void> {
  await siteStore.close()
}
</script>

<template>
  <div class="page">
    <template v-if="siteStore.site">
      <section class="glass panel">
        <div class="panel-title">站点信息</div>
        <n-descriptions :column="2" label-placement="left" size="small">
          <n-descriptions-item label="站点标题">{{ siteStore.site.title || '—' }}</n-descriptions-item>
          <n-descriptions-item label="副标题">{{ siteStore.site.subtitle || '—' }}</n-descriptions-item>
          <n-descriptions-item label="路径">{{ siteStore.site.path }}</n-descriptions-item>
          <n-descriptions-item label="统计">
            {{ siteStore.site.postCount }} 篇文章 · {{ siteStore.site.draftCount }} 篇草稿
          </n-descriptions-item>
        </n-descriptions>
        <n-space class="actions">
          <n-button @click="siteStore.openViaDialog()">切换站点</n-button>
          <n-popconfirm @positive-click="closeSite">
            <template #trigger>
              <n-button quaternary type="warning">关闭站点</n-button>
            </template>
            关闭后需要重新选择站点目录，确定吗？
          </n-popconfirm>
        </n-space>
      </section>

      <section class="glass panel" style="margin-top: 12px">
        <div class="panel-head-row">
          <div class="panel-title">站点管理</div>
          <n-space :size="6">
            <n-button size="tiny" type="primary" @click="siteStore.openViaDialog()">添加站点</n-button>
            <n-button size="tiny" quaternary @click="refreshRecents">刷新</n-button>
          </n-space>
        </div>
        <div v-if="siteStore.recents.length" class="recents">
          <div v-for="r in siteStore.recents" :key="r.path" class="recent-item">
            <div class="r-main">
              <n-space align="center" :size="8">
                <span class="r-name">{{ r.name }}</span>
                <n-tag v-if="r.path === siteStore.site.path" size="small" type="success" round :bordered="false">
                  当前
                </n-tag>
              </n-space>
              <div class="r-path muted small">{{ r.path }}</div>
            </div>
            <n-space align="center" :size="6">
              <n-button
                v-if="r.path !== siteStore.site.path"
                size="tiny"
                secondary
                :loading="switching === r.path"
                @click="switchTo(r.path)"
              >
                切换
              </n-button>
              <n-button
                v-if="r.path !== siteStore.site.path"
                size="tiny"
                quaternary
                :title="r.path"
                @click="removeSite(r)"
              >
                移除
              </n-button>
            </n-space>
          </div>
        </div>
        <div v-else class="muted small">暂无其他站点，点击「添加站点」选择 Hexo 站点目录</div>
      </section>
    </template>

    <template v-else>
      <section class="glass panel">
        <div class="panel-title">打开 Hexo 站点</div>
        <n-empty description="选择一个包含 _config.yml 的 Hexo 站点目录">
          <template #extra>
            <n-space>
              <n-button type="primary" :loading="siteStore.loading" @click="siteStore.openViaDialog()">
                打开站点目录
              </n-button>
              <n-button @click="showCreate = true">新建站点</n-button>
            </n-space>
          </template>
        </n-empty>

        <div v-if="siteStore.recents.length" class="recents">
          <h3 class="recent-title muted">最近打开</h3>
          <div v-for="r in siteStore.recents" :key="r.path" class="recent-item">
            <div class="r-main clickable" @click="siteStore.open(r.path)">
              <span class="r-name">{{ r.name }}</span>
              <div class="r-path muted small">{{ r.path }}</div>
            </div>
            <n-popconfirm @positive-click="siteStore.removeRecent(r.path)">
              <template #trigger>
                <n-button size="tiny" quaternary type="error">移除</n-button>
              </template>
              从最近列表中移除该站点（不会删除磁盘文件），确定吗？
            </n-popconfirm>
          </div>
        </div>
      </section>
    </template>

    <n-modal v-model:show="showCreate" preset="card" title="新建 Hexo 站点" style="width: 520px">
      <n-form label-placement="left" :label-width="90">
        <n-form-item label="站点名称">
          <n-input v-model:value="createForm.name" placeholder="例如：my-blog（作为目录名）" />
        </n-form-item>
        <n-form-item label="存放位置">
          <n-input-group>
            <n-input v-model:value="createForm.parentDir" placeholder="选择父目录" readonly />
            <n-button @click="pickParentDir">选择…</n-button>
          </n-input-group>
        </n-form-item>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button @click="showCreate = false">取消</n-button>
          <n-button type="primary" :loading="creating" @click="doCreate">创建并安装依赖</n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<style scoped>
.actions {
  margin-top: 14px;
}

.recents {
  margin-top: 18px;
}

.recent-title {
  font-size: 13px;
  margin: 0 0 8px;
}

.recent-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 12px;
  border-radius: 10px;
  transition: background 0.15s ease, box-shadow 0.15s ease;
}

.recent-item:hover {
  background: var(--accent-soft);
  box-shadow: inset 0 0 0 1px var(--glass-border), var(--accent-glow);
}

.r-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.r-main.clickable {
  cursor: pointer;
  flex: 1;
}

.r-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-1);
}

.r-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
