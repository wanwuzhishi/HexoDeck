import type { GlobalThemeOverrides } from 'naive-ui'

/** 亮色：浅冰白 + 淡青蓝，低饱和 */
export const lightOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#38a8dc',
    primaryColorHover: '#55b9e4',
    primaryColorPressed: '#2b90c4',
    primaryColorSuppl: '#55b9e4',
    infoColor: '#38a8dc',
    successColor: '#3fb98f',
    warningColor: '#e0a53f',
    errorColor: '#e06a6a',
    borderRadius: '10px',
    borderRadiusSmall: '8px',
    bodyColor: 'transparent'
  },
  Card: { borderRadius: '18px' },
  Modal: { borderRadius: '18px' },
  Popover: { borderRadius: '14px' },
  Button: {
    borderRadius: '8px',
    // quaternary 极轻按钮（表格编辑/删除、工具栏、收起等）：
    // naive-ui 不为 quaternary 生成类名，CSS 够不到，只能在主题覆盖里配置。
    // 常态透明底 + 次级文字，悬停给主题浅底（亮色冰蓝 / 暗色霓虹青）。
    colorQuaternary: 'rgba(0, 0, 0, 0)',
    colorQuaternaryHover: 'rgba(56, 168, 220, 0.12)',
    colorQuaternaryPressed: 'rgba(56, 168, 220, 0.18)',
    colorQuaternaryFocus: 'rgba(56, 168, 220, 0.12)',
    textColorQuaternary: 'rgba(34, 56, 78, 0.62)',
    textColorTertiary: 'rgba(34, 56, 78, 0.62)'
  },
  DataTable: {
    borderRadius: '14px',
    color: 'transparent',
    thColor: 'transparent',
    thColorHover: 'transparent',
    tdColor: 'transparent',
    tdColorHover: 'rgba(56, 168, 220, 0.1)',
    tdColorStriped: 'transparent',
    borderColor: 'rgba(140, 195, 230, 0.35)'
  },
  Dialog: { borderRadius: '18px' }
}

/** 暗色：深空黑 + 霓虹青蓝 + 淡紫 */
export const darkOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#22d3ee',
    primaryColorHover: '#56e0f5',
    primaryColorPressed: '#14b8cf',
    primaryColorSuppl: '#56e0f5',
    infoColor: '#22d3ee',
    successColor: '#34d399',
    warningColor: '#fbbf24',
    errorColor: '#f87171',
    borderRadius: '10px',
    borderRadiusSmall: '8px',
    bodyColor: 'transparent'
  },
  Card: { borderRadius: '18px' },
  Modal: { borderRadius: '18px' },
  Popover: { borderRadius: '14px' },
  Button: {
    borderRadius: '8px',
    // quaternary 极轻按钮：同亮色的策略，用暗色主题的霓虹青与次级文字
    colorQuaternary: 'rgba(0, 0, 0, 0)',
    colorQuaternaryHover: 'rgba(34, 211, 238, 0.11)',
    colorQuaternaryPressed: 'rgba(34, 211, 238, 0.17)',
    colorQuaternaryFocus: 'rgba(34, 211, 238, 0.11)',
    textColorQuaternary: 'rgba(205, 225, 245, 0.6)',
    textColorTertiary: 'rgba(205, 225, 245, 0.6)'
  },
  DataTable: {
    borderRadius: '14px',
    color: 'transparent',
    thColor: 'transparent',
    thColorHover: 'transparent',
    tdColor: 'transparent',
    tdColorHover: 'rgba(34, 211, 238, 0.1)',
    tdColorStriped: 'transparent',
    borderColor: 'rgba(110, 200, 240, 0.18)'
  },
  Dialog: { borderRadius: '18px' }
}
