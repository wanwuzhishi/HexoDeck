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
