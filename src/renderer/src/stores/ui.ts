import { defineStore } from 'pinia'

export const useUiStore = defineStore('ui', {
  state: () => ({
    isDark: localStorage.getItem('hexodeck-theme') === 'dark'
  }),
  actions: {
    toggle(): void {
      this.isDark = !this.isDark
      localStorage.setItem('hexodeck-theme', this.isDark ? 'dark' : 'light')
    }
  }
})
