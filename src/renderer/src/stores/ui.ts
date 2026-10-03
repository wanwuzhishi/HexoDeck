import { defineStore } from 'pinia'
import { setDiscreteTheme } from '../composables/message'

const AUTOSAVE_KEY = 'hexodeck-autosave-ms'
const DEFAULT_AUTOSAVE = 1500
/** 主题模式：dark=强制暗色，light=强制亮色，system=跟随系统 */
export type ThemeMode = 'light' | 'dark' | 'system'

function loadMode(): ThemeMode {
  const v = localStorage.getItem('hexodeck-theme-mode')
  if (v === 'light' || v === 'dark' || v === 'system') return v
  // 兼容旧版本仅存 isDark 的键
  const legacy = localStorage.getItem('hexodeck-theme')
  return legacy === 'dark' ? 'dark' : 'light'
}

function loadAutoSave(): number {
  const v = Number(localStorage.getItem(AUTOSAVE_KEY))
  return Number.isFinite(v) && v >= 500 && v <= 10000 ? v : DEFAULT_AUTOSAVE
}

/** 系统当前是否偏好暗色 */
function systemPrefersDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

export const useUiStore = defineStore('ui', {
  state: () => ({
    themeMode: loadMode() as ThemeMode,
    /** 系统暗色偏好（跟随系统模式下使用，由监听器更新） */
    systemDark: systemPrefersDark(),
    navCollapsed: localStorage.getItem('hexodeck-nav') === '1',
    autoSaveDelay: loadAutoSave()
  }),
  getters: {
    /** 实际生效的暗色状态：system 模式下取系统偏好 */
    isDark(state): boolean {
      if (state.themeMode === 'system') return state.systemDark
      return state.themeMode === 'dark'
    }
  },
  actions: {
    /** 三态切换：亮 → 暗 → 随系统 */
    cycleTheme(): void {
      const order: ThemeMode[] = ['light', 'dark', 'system']
      const next = order[(order.indexOf(this.themeMode) + 1) % order.length]
      this.setThemeMode(next)
    },
    setThemeMode(mode: ThemeMode): void {
      this.themeMode = mode
      localStorage.setItem('hexodeck-theme-mode', mode)
      setDiscreteTheme(this.isDark)
    },
    /** 系统主题变化时由 App 的监听器调用 */
    updateSystemDark(v: boolean): void {
      this.systemDark = v
      if (this.themeMode === 'system') setDiscreteTheme(this.isDark)
    },
    toggleNav(): void {
      this.navCollapsed = !this.navCollapsed
      localStorage.setItem('hexodeck-nav', this.navCollapsed ? '1' : '0')
    },
    setAutoSaveDelay(ms: number): void {
      const clamped = Math.min(10000, Math.max(500, Math.round(ms)))
      this.autoSaveDelay = clamped
      localStorage.setItem(AUTOSAVE_KEY, String(clamped))
    }
  }
})
