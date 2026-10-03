import { computed, ref } from 'vue'
import { createDiscreteApi, darkTheme } from 'naive-ui'
import type { ConfigProviderProps } from 'naive-ui'

const discreteDark = ref(false)

/** 供 ui store 在主题切换时同步独立 message 弹层的主题 */
export function setDiscreteTheme(dark: boolean): void {
  discreteDark.value = dark
}

const configProviderProps = computed<ConfigProviderProps>(() => ({
  theme: discreteDark.value ? darkTheme : null
}))

// 全局可用的 message / dialog API（不依赖 setup 上下文）
export const { message, dialog } = createDiscreteApi(['message', 'dialog'], { configProviderProps })

/** 删除类操作的统一确认弹窗（标题 + 说明 + 可选的危险按钮文案） */
export function confirmDialog(options: {
  title: string
  content: string
  positiveText?: string
  negativeText?: string
}): Promise<boolean> {
  return new Promise((resolve) => {
    dialog.warning({
      title: options.title,
      content: options.content,
      positiveText: options.positiveText ?? '确定',
      negativeText: options.negativeText ?? '取消',
      onPositiveClick: () => resolve(true),
      onNegativeClick: () => resolve(false),
      onClose: () => resolve(false),
      onMaskClick: () => resolve(false)
    })
  })
}
