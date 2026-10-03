import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type { BuildCommand, PostKind, PostPatch, Result, SiteInfo } from '@shared/ipc'
import type { AppConfig } from './services/config-service'
import {
  createSite,
  openSite as openSiteInfo
} from './services/site-service'
import {
  createPost,
  deletePost,
  listPosts,
  publishDraft,
  readPost,
  savePost
} from './services/post-service'
import {
  findFreePort,
  runHexoBuild,
  runNpmInstall,
  startHexoServer,
  type ChildBase,
  type ServerSession
} from './services/hexo-process-service'
import { watchSource, type SourceWatch } from './services/watch-service'

export interface IpcContext {
  childBase: ChildBase
  config: AppConfig
}

const EVT_LOG = 'evt:log'
const EVT_FS = 'evt:fs'
const EVT_PREVIEW_STOPPED = 'evt:preview-stopped'

export function registerIpc(ctx: IpcContext): void {
  let currentSite: string | null = null
  let watcher: SourceWatch | null = null
  let preview: ServerSession | null = null

  const broadcast = (channel: string, payload?: unknown): void => {
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send(channel, payload)
  }
  const onLog = (line: string): void => broadcast(EVT_LOG, line)
  const okResult = <T>(data?: T): Result<T> => ({ ok: true, data })

  const stopPreview = async (): Promise<void> => {
    if (preview) {
      const session = preview
      preview = null
      await session.stop()
      broadcast(EVT_PREVIEW_STOPPED)
    }
  }

  const attachSite = async (dir: string, name: string): Promise<SiteInfo> => {
    await stopPreview()
    watcher?.close()
    watcher = watchSource(dir, () => broadcast(EVT_FS))
    currentSite = dir
    await ctx.config.addRecentSite(dir, name)
    return openSiteInfo(dir)
  }

  const openByPath = async (rawPath: string): Promise<Result<SiteInfo>> => {
    try {
      const info = await openSiteInfo(rawPath)
      const full = await attachSite(info.path, info.name)
      return okResult(full)
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }

  ipcMain.handle('site:openDialog', async () => {
    const picked = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: '选择 Hexo 站点目录（包含 _config.yml）'
    })
    if (picked.canceled || picked.filePaths.length === 0) return null
    const result = await openByPath(picked.filePaths[0])
    return result.ok ? result.data ?? null : null
  })

  ipcMain.handle('site:open', (_e, path: string) => openByPath(path))

  ipcMain.handle('site:close', async () => {
    await stopPreview()
    watcher?.close()
    watcher = null
    currentSite = null
  })

  ipcMain.handle('site:pickDirectory', async () => {
    const picked = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: '选择站点存放位置'
    })
    return picked.canceled || picked.filePaths.length === 0 ? null : picked.filePaths[0]
  })

  ipcMain.handle('site:create', async (_e, name: string, parentDir: string): Promise<Result<SiteInfo>> => {
    try {
      if (!name.trim()) return { ok: false, error: '站点名称不能为空' }
      const dir = await createSite(name.trim(), parentDir)
      onLog(`站点已创建：${dir}，正在安装依赖（需要本机已安装 Node.js）…`)
      const installed = await runNpmInstall(dir, onLog)
      if (!installed) onLog('依赖安装未完成，可稍后在站点目录手动执行 npm install。')
      const info = await openSiteInfo(dir)
      const full = await attachSite(info.path, info.name)
      return okResult(full)
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('site:recent', async () => (await ctx.config.read()).recentSites)

  const requireSite = (): string => {
    if (!currentSite) throw new Error('尚未打开站点')
    return currentSite
  }

  ipcMain.handle('post:list', async () => (currentSite ? listPosts(currentSite) : []))

  ipcMain.handle('post:read', async (_e, id: string) => {
    try {
      return okResult(await readPost(requireSite(), id))
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('post:create', async (_e, kind: PostKind, title: string) => {
    try {
      return okResult(await createPost(requireSite(), kind, title))
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('post:save', async (_e, id: string, patch: PostPatch): Promise<Result> => {
    try {
      await savePost(requireSite(), id, patch)
      return okResult()
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('post:delete', async (_e, id: string): Promise<Result> => {
    try {
      const site = requireSite()
      await deletePost(site, id, (p) => shell.trashItem(p))
      return okResult()
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('post:publishDraft', async (_e, id: string) => {
    try {
      return okResult(await publishDraft(requireSite(), id))
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('build:run', async (_e, command: BuildCommand) => {
    try {
      return await runHexoBuild(ctx.childBase, requireSite(), command, onLog)
    } catch (e) {
      onLog(`✗ ${(e as Error).message}`)
      return { ok: false, command, durationMs: 0, error: (e as Error).message }
    }
  })

  ipcMain.handle('preview:start', async (_e, includeDrafts: boolean): Promise<Result<string>> => {
    try {
      const site = requireSite()
      await stopPreview()
      const port = await findFreePort(4000)
      preview = await startHexoServer(
        ctx.childBase,
        site,
        port,
        includeDrafts,
        onLog,
        () => {
          preview = null
          broadcast(EVT_PREVIEW_STOPPED)
        }
      )
      const url = `http://127.0.0.1:${preview.port}/`
      onLog(`✓ 预览已启动：${url}`)
      return okResult(url)
    } catch (e) {
      preview = null
      return { ok: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('preview:stop', async () => {
    await stopPreview()
  })
}
