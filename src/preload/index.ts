import { contextBridge, ipcRenderer } from 'electron'
import type { Api, BuildCommand, PostKind, PostPatch } from '../shared/ipc'

const api: Api = {
  openSiteDialog: () => ipcRenderer.invoke('site:openDialog'),
  openSite: (path: string) => ipcRenderer.invoke('site:open', path),
  closeSite: () => ipcRenderer.invoke('site:close'),
  createSite: (name: string, parentDir: string) => ipcRenderer.invoke('site:create', name, parentDir),
  pickDirectory: () => ipcRenderer.invoke('site:pickDirectory'),
  listRecentSites: () => ipcRenderer.invoke('site:recent'),

  listPosts: () => ipcRenderer.invoke('post:list'),
  readPost: (id: string) => ipcRenderer.invoke('post:read', id),
  createPost: (kind: PostKind, title: string) => ipcRenderer.invoke('post:create', kind, title),
  savePost: (id: string, patch: PostPatch) => ipcRenderer.invoke('post:save', id, patch),
  deletePost: (id: string) => ipcRenderer.invoke('post:delete', id),
  publishDraft: (id: string) => ipcRenderer.invoke('post:publishDraft', id),
  searchPosts: (keyword: string) => ipcRenderer.invoke('post:search', keyword),
  saveImage: (fileName: string, base64: string) => ipcRenderer.invoke('asset:saveImage', fileName, base64),

  runBuild: (command: BuildCommand) => ipcRenderer.invoke('build:run', command),
  startPreview: (includeDrafts: boolean) => ipcRenderer.invoke('preview:start', includeDrafts),
  stopPreview: () => ipcRenderer.invoke('preview:stop'),

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

  reportError: (message: string) => ipcRenderer.send('app:renderer-error', message)
}

contextBridge.exposeInMainWorld('api', api)
