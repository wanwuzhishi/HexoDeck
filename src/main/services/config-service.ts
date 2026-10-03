import { promises as fs } from 'fs'
import { join } from 'path'
import type { RecentSite } from '@shared/ipc'

export interface AppConfigState {
  recentSites: RecentSite[]
}

const DEFAULTS: AppConfigState = { recentSites: [] }

/** 应用配置持久化（userData/hexodeck.json） */
export class AppConfig {
  private cache: AppConfigState | null = null

  constructor(private readonly file: string) {}

  async read(): Promise<AppConfigState> {
    if (this.cache) return this.cache
    try {
      const parsed = JSON.parse(await fs.readFile(this.file, 'utf8')) as Partial<AppConfigState>
      this.cache = { ...DEFAULTS, ...parsed, recentSites: parsed.recentSites ?? [] }
    } catch {
      this.cache = { ...DEFAULTS }
    }
    return this.cache
  }

  async addRecentSite(path: string, name: string): Promise<void> {
    const state = await this.read()
    state.recentSites = [
      { path, name, lastOpened: Date.now() },
      ...state.recentSites.filter((s) => s.path !== path)
    ].slice(0, 10)
    await this.write(state)
  }

  async write(state: AppConfigState): Promise<void> {
    this.cache = state
    await fs.mkdir(join(this.file, '..'), { recursive: true })
    await fs.writeFile(this.file, JSON.stringify(state, null, 2), 'utf8')
  }
}
