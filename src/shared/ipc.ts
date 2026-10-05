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
  /** 完整 front-matter（含自定义字段），供参数侧栏展示与编辑 */
  frontMatter: Record<string, unknown>
}

/** 自定义 front-matter 字段（参数侧栏可增删） */
export interface CustomField {
  key: string
  /** 值的字符串形式；布尔/数字原样保留由 YAML 序列化决定 */
  value: string
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
  /**
   * 自定义 front-matter 字段：写入时合并到现有元数据。
   * value 为 null 表示删除该键。
   */
  extra?: Record<string, string | boolean | null>
}

export interface SiteInfo {
  path: string
  name: string
  title: string
  subtitle: string
  postCount: number
  draftCount: number
  /** 站点图标（favicon）在磁盘上的绝对路径；未设置时为 undefined */
  iconPath?: string
  /** 供 <img> 直接使用的图标地址（file:// 带版本参数破缓存） */
  iconUrl?: string
}

/** 页面（source/ 下非文章目录的 markdown，如 about/index.md） */
export interface PageMeta {
  /** 相对 source 的路径，如 'about/index.md' */
  id: string
  title: string
  date: string
  wordCount: number
}

export interface PageDetail extends PageMeta {
  raw: string
  content: string
  /** 完整 front-matter（含自定义字段） */
  frontMatter: Record<string, unknown>
}

export interface PageCreateOptions {
  title: string
  /** 相对 source 的目标路径，如 'about/index' 或 'contact'；省略扩展名 */
  path: string
  /** 初始 front-matter（YAML 原文，解析后写入） */
  frontMatterYaml?: string
  content?: string
}

export interface PagePatch {
  title?: string
  date?: string
  content?: string
  /**
   * 自定义 front-matter 字段：写入时合并到现有元数据。
   * value 为 null 表示删除该键。
   */
  extra?: Record<string, string | boolean | null>
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

/** 自定义文集：侧栏入口（名称/图标可自定义）+ 站点根目录内的一个文章目录 */
export interface CollectionDef {
  id: string
  /** 侧栏显示名（限 8 字以内） */
  name: string
  /** 侧栏图标（预置 emoji） */
  icon: string
  /** 相对站点根目录的 posix 路径，如 source/notes */
  dir: string
}

export interface CollectionPostMeta {
  /** 相对文集目录的 posix 路径，如 '2026/notes-1.md' */
  id: string
  title: string
  date: string
  wordCount: number
}

export interface CollectionPostDetail extends CollectionPostMeta {
  raw: string
  content: string
  frontMatter: Record<string, unknown>
}

export interface CollectionPostPatch {
  title?: string
  date?: string
  content?: string
  /** 自定义 front-matter 字段；value 为 null 表示删除该键 */
  extra?: Record<string, string | boolean | null>
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

/** 配置文件路径设定的对象：站点 _config.yml 或当前主题的 YAML 配置 */
export type ConfigPathKind = 'site' | 'theme'

/** 配置文件路径记忆状态（首次打开时弹窗由用户指定，之后记住不再询问） */
export interface ConfigPathInfo {
  kind: ConfigPathKind
  /** kind=theme 时对应的主题名 */
  theme?: string
  /** 已记住的路径；null 表示尚未指定（下次打开会再次弹窗） */
  path: string | null
  /** 已记住的路径文件当前是否存在 */
  exists: boolean
  /** 约定俗成的默认路径（弹窗中展示，可一键采用） */
  defaultPath: string
}

export interface PluginInfo {
  name: string
  version: string
  description: string
  /** 该插件在 _config.yml 中的配置键（无独立配置键时为 null） */
  configKey: string | null
}

/** 统计项（标签/分类排行） */
export interface StatCountItem {
  name: string
  count: number
}

export interface StatMonthPoint {
  month: string
  count: number
  words: number
}

export interface StatYearPoint {
  year: string
  count: number
  words: number
}

/** 站点统计（统计页数据源） */
export interface SiteStats {
  postCount: number
  draftCount: number
  totalWords: number
  totalChars: number
  avgWords: number
  longest: { title: string; words: number } | null
  shortest: { title: string; words: number } | null
  tagCount: number
  categoryCount: number
  topTags: StatCountItem[]
  topCategories: StatCountItem[]
  firstPostDate: string | null
  lastPostDate: string | null
  activeDays: number
  busiestDay: { date: string; count: number } | null
  byYear: StatYearPoint[]
  byMonth: StatMonthPoint[]
  thisWeek: number
  thisMonth: number
  uncategorized: number
  untagged: number
}

/** 应用级设置（与站点配置无关） */
export interface AppSettings {
  /** 关闭窗口时最小化到托盘而非退出 */
  closeToTray: boolean
  /** 启动时自动检查更新 */
  autoCheckUpdate: boolean
}

export interface AppInfo {
  version: string
  logFile: string
  closeToTray: boolean
  autoCheckUpdate: boolean
}

/** 自动更新状态（主进程推送） */
export interface UpdateStatus {
  state:
    | 'idle'
    | 'checking'
    | 'available'
    | 'not-available'
    | 'downloading'
    | 'downloaded'
    | 'error'
    | 'unsupported'
  version?: string
  percent?: number
  message?: string
}

/** preload 暴露给渲染进程的 API（window.api） */
export interface Api {
  openSiteDialog(): Promise<SiteInfo | null>
  openSite(path: string): Promise<Result<SiteInfo>>
  closeSite(): Promise<void>
  createSite(name: string, parentDir: string): Promise<Result<SiteInfo>>
  pickDirectory(): Promise<string | null>
  listRecentSites(): Promise<RecentSite[]>
  removeRecentSite(path: string): Promise<void>

  /** 站点图标：选择图片文件并写入站点 source/ */
  pickSiteIcon(): Promise<Result<SiteInfo>>
  /** 从拖拽的图片文件设置站点图标 */
  setSiteIcon(fileName: string, base64: string): Promise<Result<SiteInfo>>
  /** 移除站点图标（删除站点内的 favicon 文件） */
  clearSiteIcon(): Promise<Result<SiteInfo>>

  /** 应用信息与设置 */
  getAppInfo(): Promise<AppInfo>
  saveAppSettings(patch: Partial<AppSettings>): Promise<Result<AppSettings>>
  openLogFolder(): Promise<void>

  /** 自绘标题栏的窗口控制（无边框窗口用） */
  minimizeWindow(): Promise<void>
  toggleMaximizeWindow(): Promise<boolean>
  closeWindow(): Promise<void>
  isWindowMaximized(): Promise<boolean>
  /** 最大化状态变化（由主进程推送，用于切换按钮图标） */
  onWindowMaximized(cb: (maximized: boolean) => void): () => void
  /** 手动检查更新（结果通过 onUpdateStatus 推送） */
  checkForUpdate(): Promise<void>
  /** 退出并安装已下载的更新 */
  installUpdate(): Promise<void>
  onUpdateStatus(cb: (status: UpdateStatus) => void): () => void

  listPosts(): Promise<PostMeta[]>
  readPost(id: string): Promise<Result<PostDetail>>
  createPost(kind: PostKind, title: string): Promise<Result<PostMeta>>
  savePost(id: string, patch: PostPatch): Promise<Result>
  deletePost(id: string): Promise<Result>
  publishDraft(id: string): Promise<Result<PostMeta>>
  /** 全文搜索（标题/标签/分类 + 正文），返回带摘录的命中项 */
  searchPosts(keyword: string): Promise<Result<SearchHit[]>>
  /** 站点统计（统计页用） */
  getStats(): Promise<Result<SiteStats>>
  /** 保存图片到 source/images，返回可直接插入 Markdown 的 URL */
  saveImage(fileName: string, base64: string): Promise<Result<string>>

  /** 页面（source/ 下非文章目录的 markdown） */
  listPages(): Promise<PageMeta[]>
  readPage(id: string): Promise<Result<PageDetail>>
  createPage(options: PageCreateOptions): Promise<Result<PageMeta>>
  savePage(id: string, patch: PagePatch): Promise<Result>
  deletePage(id: string): Promise<Result>

  /** 自定义文集：按站点记忆的侧栏入口（名称/图标可自定义，目录限站点根内） */
  listCollections(): Promise<CollectionDef[]>
  /** 弹出目录选择器（限站点根目录内），返回站点内相对路径 */
  pickCollectionDir(): Promise<Result<{ dir: string } | null>>
  addCollection(name: string, icon: string, dir: string): Promise<Result<CollectionDef[]>>
  updateCollection(id: string, patch: { name?: string; icon?: string }): Promise<Result<CollectionDef[]>>
  removeCollection(id: string): Promise<Result<CollectionDef[]>>
  /** 文集文章 CRUD（id 为相对文集目录的路径） */
  listCollectionPosts(collectionId: string): Promise<CollectionPostMeta[]>
  readCollectionPost(collectionId: string, id: string): Promise<Result<CollectionPostDetail>>
  createCollectionPost(collectionId: string, title: string): Promise<Result<CollectionPostMeta>>
  saveCollectionPost(collectionId: string, id: string, patch: CollectionPostPatch): Promise<Result>
  deleteCollectionPost(collectionId: string, id: string): Promise<Result>

  runBuild(command: BuildCommand): Promise<BuildResult>
  startPreview(includeDrafts: boolean): Promise<Result<string>>
  stopPreview(): Promise<void>

  readSiteConfig(): Promise<Result<SiteConfigForm>>
  saveBaseConfig(patch: SiteConfigPatch): Promise<Result>
  saveDeployConfig(deploy: DeployConfig): Promise<Result>
  /** 高级：直接读写配置文件原文（保存前校验 + 备份）。路径由用户指定并记忆，不再自动定位 */
  readRawConfig(): Promise<Result<{ path: string; content: string }>>
  saveRawConfig(content: string): Promise<Result>
  /** 配置文件路径记忆：查询当前站点/主题的设定状态 */
  getConfigPath(kind: ConfigPathKind): Promise<Result<ConfigPathInfo>>
  /** 弹出文件对话框选择配置文件路径并记住（取消时 ok=false、error='canceled'） */
  pickConfigPath(kind: ConfigPathKind): Promise<Result<ConfigPathInfo>>
  /** 采用约定默认路径并记住 */
  useDefaultConfigPath(kind: ConfigPathKind): Promise<Result<ConfigPathInfo>>
  /** 清除路径记忆（下次打开重新弹窗询问） */
  clearConfigPath(kind: ConfigPathKind): Promise<Result<ConfigPathInfo>>
  listThemes(): Promise<Result<ThemeInfo[]>>
  switchTheme(name: string): Promise<Result>
  /** 打开文件对话框选择主题压缩包并安装 */
  installThemeFromDialog(): Promise<Result<{ name: string }>>
  /** 从压缩包路径安装主题（拖拽安装用） */
  installThemeFromArchive(archivePath: string): Promise<Result<{ name: string }>>
  /** 从拖拽的文件对象中提取磁盘路径（Electron 提供 webUtils.getPathForFile） */
  pathForFile(file: File): string
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
