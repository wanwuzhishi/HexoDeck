import { promises as fs } from 'fs'
import { join } from 'path'
import type { AppSettings, RecentSite } from '@shared/ipc'

export interface AppConfigState {
  recentSites: RecentSite[]
  settings: AppSettings
  /** 用户指定的配置文件路径记忆（键见 siteConfigKey/themeConfigKey） */
  configPaths: Record<string, string>
}

/** 站点配置文件（_config.yml）路径记忆键 */
export function siteConfigKey(siteDir: string): string {
  return `site:${siteDir}`
}

/** 主题配置文件路径记忆键：按「站点 + 主题」分别记住 */
export function themeConfigKey(siteDir: string, theme: string): string {
  return `theme:${siteDir}|${theme}`
}

export const DEFAULT_SETTINGS: AppSettings = {
  closeToTray: false,
  autoCheckUpdate: true
}

/** 应用配置持久化（userData/hexodeck.json） */
export class AppConfig {
  private cache: AppConfigState | null = null

  constructor(private readonly file: string) {}

  async read(): Promise<AppConfigState> {
    if (this.cache) return this.cache
    try {
      const parsed = JSON.parse(await fs.readFile(this.file, 'utf8')) as Partial<AppConfigState>
      this.cache = {
        recentSites: parsed.recentSites ?? [],
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
        configPaths: parsed.configPaths ?? {}
      }
    } catch {
      this.cache = { recentSites: [], settings: { ...DEFAULT_SETTINGS }, configPaths: {} }
    }
    return this.cache
  }

  async getConfigPath(key: string): Promise<string | null> {
    return (await this.read()).configPaths[key] ?? null
  }

  async setConfigPath(key: string, path: string): Promise<void> {
    const state = await this.read()
    state.configPaths[key] = path
    await this.write(state)
  }

  async clearConfigPath(key: string): Promise<void> {
    const state = await this.read()
    if (!(key in state.configPaths)) return
    delete state.configPaths[key]
    await this.write(state)
  }

  async addRecentSite(path: string, name: string): Promise<void> {
    const state = await this.read()
    state.recentSites = [
      { path, name, lastOpened: Date.now() },
      ...state.recentSites.filter((s) => s.path !== path)
    ].slice(0, 10)
    await this.write(state)
  }

  async removeRecentSite(path: string): Promise<void> {
    const state = await this.read()
    state.recentSites = state.recentSites.filter((s) => s.path !== path)
    await this.write(state)
  }

  async getSettings(): Promise<AppSettings> {
    return (await this.read()).settings
  }

  async patchSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    const state = await this.read()
    state.settings = { ...state.settings, ...patch }
    await this.write(state)
    return state.settings
  }

  async write(state: AppConfigState): Promise<void> {
    this.cache = state
    await fs.mkdir(join(this.file, '..'), { recursive: true })
    await fs.writeFile(this.file, JSON.stringify(state, null, 2), 'utf8')
  }
}
