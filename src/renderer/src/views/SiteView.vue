<script setup lang="ts">
import { ref } from 'vue'
import { NButton, NCard, NDescriptions, NDescriptionsItem, NEmpty, NForm, NFormItem, NInput, NInputGroup, NList, NListItem, NModal, NPopconfirm, NSpace, NThing } from 'naive-ui'
import { useSiteStore } from '../stores/site'
import { message } from '../composables/message'

const siteStore = useSiteStore()

const showCreate = ref(false)
const creating = ref(false)
const createForm = ref({ name: '', parentDir: '' })

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
      <n-card title="站点信息">
        <n-descriptions bordered :column="2" label-placement="left">
          <n-descriptions-item label="站点标题">{{ siteStore.site.title || '—' }}</n-descriptions-item>
          <n-descriptions-item label="副标题">{{ siteStore.site.subtitle || '—' }}</n-descriptions-item>
          <n-descriptions-item label="路径">{{ siteStore.site.path }}</n-descriptions-item>
          <n-descriptions-item label="统计">
            {{ siteStore.site.postCount }} 篇文章 · {{ siteStore.site.draftCount }} 篇草稿
          </n-descriptions-item>
        </n-descriptions>
        <template #footer>
          <n-space>
            <n-button @click="siteStore.openViaDialog()">切换站点</n-button>
            <n-popconfirm @positive-click="closeSite">
              <template #trigger>
                <n-button quaternary type="warning">关闭站点</n-button>
              </template>
              关闭后需要重新选择站点目录，确定吗？
            </n-popconfirm>
          </n-space>
        </template>
      </n-card>
    </template>

    <template v-else>
      <n-card title="打开 Hexo 站点">
        <n-space vertical :size="20">
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

          <div v-if="siteStore.recents.length">
            <h3 class="recent-title">最近打开</h3>
            <n-list hoverable clickable>
              <n-list-item v-for="r in siteStore.recents" :key="r.path" @click="siteStore.open(r.path)">
                <n-thing :title="r.name" :description="r.path" />
              </n-list-item>
            </n-list>
          </div>
        </n-space>
      </n-card>
    </template>

    <n-modal
      v-model:show="showCreate"
      preset="card"
      title="新建 Hexo 站点"
      style="width: 520px"
    >
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
.page {
  padding: 18px 22px;
}
.recent-title {
  font-size: 14px;
  margin: 0 0 8px;
}
</style>
