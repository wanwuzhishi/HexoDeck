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

// 全局可用的 message API（不依赖 setup 上下文）
export const { message } = createDiscreteApi(['message'], { configProviderProps })
