import { createDiscreteApi } from 'naive-ui'

// 全局可用的 message API（不依赖 setup 上下文）
export const { message } = createDiscreteApi(['message'])
