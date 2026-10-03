/** HexoDeck 渲染进程与主进程的共享 IPC 契约 */

export type PostKind = 'post' | 'draft'
export type BuildCommand = 'generate' | 'clean' | 'deploy'

export interface PostMeta {
  /** 相对 source 的路径，如 '_posts/hello-world.md' */
  id: string
  kind: PostKind
  title: string
  date: string
  tags: string[]
  categories: string[]
  wordCount: number
}

export interface PostDetail extends PostMeta {
  raw: string
  content: string
}

/** 正文搜索命中项 */
export interface SearchHit extends PostMeta {
  /** 命中位置附近的正文摘录 */
  snippet?: string
}

export interface PostPatch {
  title?: string
  date?: string
  tags?: string[]
  categories?: string[]
  content?: string
}

export interface SiteInfo {
  path: string
  name: string
  title: string
  subtitle: string
  postCount: number
  draftCount: number
}

export interface RecentSite {
  path: string
  name: string
  lastOpened: number
}

export interface BuildResult {
  ok: boolean
  command: BuildCommand
  durationMs: number
  error?: string
}

export interface Result<T = undefined> {
  ok: boolean
  error?: string
  data?: T
}

/** 站点 _config.yml 表单化配置 */
export interface DeployConfig {
  type: string
  repo: string
  branch: string
}

export interface SiteConfigForm {
  title: string
  subtitle: string
  description: string
  author: string
  language: string
  timezone: string
  url: string
  root: string
  permalink: string
  perPage: number | null
  postAssetFolder: boolean
  theme: string
  deploy: DeployConfig
}

export interface SiteConfigPatch {
  title?: string
  subtitle?: string
  description?: string
  author?: string
  language?: string
  timezone?: string
  url?: string
  root?: string
  permalink?: string
  perPage?: number | null
  postAssetFolder?: boolean
}

export interface ThemeInfo {
  name: string
  active: boolean
  source: 'themes-dir' | 'npm'
}

export interface ThemeConfigFile {
  path: string
  content: string
  created: boolean
}

export interface PluginInfo {
  name: string
  version: string
  description: string
  /** 该插件在 _config.yml 中的配置键（无独立配置键时为 null） */
  configKey: string | null
}

/** preload 暴露给渲染进程的 API（window.api） */
export interface Api {
  openSiteDialog(): Promise<SiteInfo | null>
  openSite(path: string): Promise<Result<SiteInfo>>
  closeSite(): Promise<void>
  createSite(name: string, parentDir: string): Promise<Result<SiteInfo>>
  pickDirectory(): Promise<string | null>
  listRecentSites(): Promise<RecentSite[]>

  listPosts(): Promise<PostMeta[]>
  readPost(id: string): Promise<Result<PostDetail>>
  createPost(kind: PostKind, title: string): Promise<Result<PostMeta>>
  savePost(id: string, patch: PostPatch): Promise<Result>
  deletePost(id: string): Promise<Result>
  publishDraft(id: string): Promise<Result<PostMeta>>
  /** 全文搜索（标题/标签/分类 + 正文），返回带摘录的命中项 */
  searchPosts(keyword: string): Promise<Result<SearchHit[]>>
  /** 保存图片到 source/images，返回可直接插入 Markdown 的 URL */
  saveImage(fileName: string, base64: string): Promise<Result<string>>

  runBuild(command: BuildCommand): Promise<BuildResult>
  startPreview(includeDrafts: boolean): Promise<Result<string>>
  stopPreview(): Promise<void>

  readSiteConfig(): Promise<Result<SiteConfigForm>>
  saveBaseConfig(patch: SiteConfigPatch): Promise<Result>
  saveDeployConfig(deploy: DeployConfig): Promise<Result>
  /** 高级：直接读写 _config.yml 原文（保存前校验 + 备份） */
  readRawConfig(): Promise<Result<{ path: string; content: string }>>
  saveRawConfig(content: string): Promise<Result>
  listThemes(): Promise<Result<ThemeInfo[]>>
  switchTheme(name: string): Promise<Result>
  readThemeConfig(): Promise<Result<ThemeConfigFile>>
  saveThemeConfig(content: string): Promise<Result>
  listPlugins(): Promise<Result<PluginInfo[]>>
  installPlugin(name: string): Promise<Result>
  uninstallPlugin(name: string): Promise<Result>

  onLog(cb: (line: string) => void): () => void
  onFsChanged(cb: () => void): () => void
  onPreviewStopped(cb: () => void): () => void
  /** 渲染进程异常上报（主进程写入日志文件） */
  reportError(message: string): void
}
