import { defineStore } from 'pinia'
import { setDiscreteTheme } from '../composables/message'

const AUTOSAVE_KEY = 'hexodeck-autosave-ms'
const DEFAULT_AUTOSAVE = 1500

function loadAutoSave(): number {
  const v = Number(localStorage.getItem(AUTOSAVE_KEY))
  return Number.isFinite(v) && v >= 500 && v <= 10000 ? v : DEFAULT_AUTOSAVE
}

export const useUiStore = defineStore('ui', {
  state: () => ({
    isDark: localStorage.getItem('hexodeck-theme') === 'dark',
    navCollapsed: localStorage.getItem('hexodeck-nav') === '1',
    /** 编辑器自动保存延迟（毫秒） */
    autoSaveDelay: loadAutoSave()
  }),
  actions: {
    toggle(): void {
      this.setDark(!this.isDark)
    },
    setDark(v: boolean): void {
      this.isDark = v
      localStorage.setItem('hexodeck-theme', v ? 'dark' : 'light')
      setDiscreteTheme(v)
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
