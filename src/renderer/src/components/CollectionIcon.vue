<script setup lang="ts">
import { computed } from 'vue'
import { NIcon } from 'naive-ui'
import { FolderOpenOutline } from '@vicons/ionicons5'
import { COLLECTION_ICON_PRESETS, isImportedIcon } from '../constants/collectionIcons'

const props = defineProps<{ icon: string; size?: number }>()

/** 文集图标渲染：导入图片 → data URL；预置键 → ionicons；其他（旧 emoji 等）→ 默认文件夹 */
const resolved = computed(() => {
  const size = props.size ?? 16
  if (isImportedIcon(props.icon)) {
    return { kind: 'img' as const, src: props.icon, size }
  }
  const preset = COLLECTION_ICON_PRESETS.find((p) => p.key === props.icon)
  if (preset) return { kind: 'preset' as const, comp: preset.comp, size }
  return { kind: 'fallback' as const, comp: FolderOpenOutline, size }
})
</script>

<template>
  <img
    v-if="resolved.kind === 'img'"
    class="coll-icon-img"
    :src="resolved.src"
    :style="{ width: `${resolved.size}px`, height: `${resolved.size}px` }"
    alt=""
  />
  <n-icon v-else :size="resolved.size" :component="resolved.comp" />
</template>

<style scoped>
.coll-icon-img {
  object-fit: cover;
  border-radius: 4px;
  display: block;
}
</style>
