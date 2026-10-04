import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  Api,
  AppSettings,
  BuildCommand,
  ConfigPathKind,
  DeployConfig,
  PageCreateOptions,
  PagePatch,
  PostKind,
  PostPatch,
  SiteConfigPatch,
  UpdateStatus
} from '../shared/ipc'

const api: Api = {
  openSiteDialog: () => ipcRenderer.invoke('site:openDialog'),
  openSite: (path: string) => ipcRenderer.invoke('site:open', path),
  closeSite: () => ipcRenderer.invoke('site:close'),
  createSite: (name: string, parentDir: string) => ipcRenderer.invoke('site:create', name, parentDir),
  pickDirectory: () => ipcRenderer.invoke('site:pickDirectory'),
  listRecentSites: () => ipcRenderer.invoke('site:recent'),
  removeRecentSite: (path: string) => ipcRenderer.invoke('site:removeRecent', path),
  pickSiteIcon: () => ipcRenderer.invoke('site:pickIcon'),
  setSiteIcon: (fileName: string, base64: string) =>
    ipcRenderer.invoke('site:setIcon', fileName, base64),
  clearSiteIcon: () => ipcRenderer.invoke('site:clearIcon'),

  getAppInfo: () => ipcRenderer.invoke('app:info'),
  saveAppSettings: (patch: Partial<AppSettings>) => ipcRenderer.invoke('app:saveSettings', patch),
  openLogFolder: () => ipcRenderer.invoke('app:openLogs'),

  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('window:toggleMaximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  isWindowMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  onWindowMaximized: (cb: (maximized: boolean) => void) => {
    const handler = (_e: unknown, maximized: boolean): void => cb(maximized)
    ipcRenderer.on('evt:window-maximized', handler)
    return () => ipcRenderer.removeListener('evt:window-maximized', handler)
  },
  checkForUpdate: () => ipcRenderer.invoke('app:checkUpdate'),
  installUpdate: () => ipcRenderer.invoke('app:installUpdate'),

  listPosts: () => ipcRenderer.invoke('post:list'),
  readPost: (id: string) => ipcRenderer.invoke('post:read', id),
  createPost: (kind: PostKind, title: string) => ipcRenderer.invoke('post:create', kind, title),
  savePost: (id: string, patch: PostPatch) => ipcRenderer.invoke('post:save', id, patch),
  deletePost: (id: string) => ipcRenderer.invoke('post:delete', id),
  publishDraft: (id: string) => ipcRenderer.invoke('post:publishDraft', id),
  searchPosts: (keyword: string) => ipcRenderer.invoke('post:search', keyword),
  getStats: () => ipcRenderer.invoke('stats:get'),
  saveImage: (fileName: string, base64: string) => ipcRenderer.invoke('asset:saveImage', fileName, base64),

  listPages: () => ipcRenderer.invoke('page:list'),
  readPage: (id: string) => ipcRenderer.invoke('page:read', id),
  createPage: (options: PageCreateOptions) => ipcRenderer.invoke('page:create', options),
  savePage: (id: string, patch: PagePatch) => ipcRenderer.invoke('page:save', id, patch),
  deletePage: (id: string) => ipcRenderer.invoke('page:delete', id),

  runBuild: (command: BuildCommand) => ipcRenderer.invoke('build:run', command),
  startPreview: (includeDrafts: boolean) => ipcRenderer.invoke('preview:start', includeDrafts),
  stopPreview: () => ipcRenderer.invoke('preview:stop'),

  readSiteConfig: () => ipcRenderer.invoke('config:read'),
  saveBaseConfig: (patch: SiteConfigPatch) => ipcRenderer.invoke('config:saveBase', patch),
  saveDeployConfig: (deploy: DeployConfig) => ipcRenderer.invoke('config:saveDeploy', deploy),
  readRawConfig: () => ipcRenderer.invoke('config:readRaw'),
  saveRawConfig: (content: string) => ipcRenderer.invoke('config:saveRaw', content),
  getConfigPath: (kind: ConfigPathKind) => ipcRenderer.invoke('config:getPath', kind),
  pickConfigPath: (kind: ConfigPathKind) => ipcRenderer.invoke('config:pickPath', kind),
  useDefaultConfigPath: (kind: ConfigPathKind) => ipcRenderer.invoke('config:useDefaultPath', kind),
  clearConfigPath: (kind: ConfigPathKind) => ipcRenderer.invoke('config:clearPath', kind),
  listThemes: () => ipcRenderer.invoke('theme:list'),
  switchTheme: (name: string) => ipcRenderer.invoke('theme:switch', name),
  installThemeFromDialog: () => ipcRenderer.invoke('theme:installDialog'),
  installThemeFromArchive: (archivePath: string) =>
    ipcRenderer.invoke('theme:installArchive', archivePath),
  // 拖拽的 File 对象在渲染进程拿不到磁盘路径，需经 webUtils 转换（Electron 32+）
  pathForFile: (file: File) => {
    try {
      return webUtils.getPathForFile(file)
    } catch {
      return ''
    }
  },
  readThemeConfig: () => ipcRenderer.invoke('theme:readConfig'),
  saveThemeConfig: (content: string) => ipcRenderer.invoke('theme:saveConfig', content),
  listPlugins: () => ipcRenderer.invoke('plugin:list'),
  installPlugin: (name: string) => ipcRenderer.invoke('plugin:install', name),
  uninstallPlugin: (name: string) => ipcRenderer.invoke('plugin:uninstall', name),

  onLog: (cb: (line: string) => void) => {
    const handler = (_e: unknown, line: string): void => cb(line)
    ipcRenderer.on('evt:log', handler)
    return () => ipcRenderer.removeListener('evt:log', handler)
  },
  onFsChanged: (cb: () => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('evt:fs', handler)
    return () => ipcRenderer.removeListener('evt:fs', handler)
  },
  onPreviewStopped: (cb: () => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('evt:preview-stopped', handler)
    return () => ipcRenderer.removeListener('evt:preview-stopped', handler)
  },
  onUpdateStatus: (cb: (status: UpdateStatus) => void) => {
    const handler = (_e: unknown, status: UpdateStatus): void => cb(status)
    ipcRenderer.on('evt:update-status', handler)
    return () => ipcRenderer.removeListener('evt:update-status', handler)
  },

  reportError: (message: string) => ipcRenderer.send('app:renderer-error', message)
}

contextBridge.exposeInMainWorld('api', api)
