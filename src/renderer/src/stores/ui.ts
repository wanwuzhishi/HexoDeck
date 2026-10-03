import { defineStore } from 'pinia'
import { setDiscreteTheme } from '../composables/message'

export const useUiStore = defineStore('ui', {
  state: () => ({
    isDark: localStorage.getItem('hexodeck-theme') === 'dark',
    navCollapsed: localStorage.getItem('hexodeck-nav') === '1'
  }),
  actions: {
    toggle(): void {
      this.isDark = !this.isDark
      localStorage.setItem('hexodeck-theme', this.isDark ? 'dark' : 'light')
      setDiscreteTheme(this.isDark)
    },
    toggleNav(): void {
      this.navCollapsed = !this.navCollapsed
      localStorage.setItem('hexodeck-nav', this.navCollapsed ? '1' : '0')
    }
  }
})
