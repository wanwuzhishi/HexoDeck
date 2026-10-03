<script setup lang="ts">
import { NConfigProvider, NCard, NButton, NSpace, darkTheme, zhCN, dateZhCN } from 'naive-ui'
import { ref } from 'vue'

const theme = ref<typeof darkTheme | null>(null)
</script>

<template>
  <n-config-provider :theme="theme" :locale="zhCN" :date-locale="dateZhCN">
    <n-card title="HexoDeck" style="margin: 40px">
      <n-space vertical>
        <span>M0 脚手架已就绪 —— M1 将实现站点管理与文章编辑。</span>
      </n-space>
      <template #footer>
        <n-button @click="theme = theme ? null : darkTheme">切换主题</n-button>
      </template>
    </n-card>
  </n-config-provider>
</template>
