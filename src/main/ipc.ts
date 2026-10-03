import { BrowserWindow, app, dialog, ipcMain, shell } from 'electron'
import { appendFile } from 'fs/promises'
import { join } from 'path'
import type { AppSettings, BuildCommand, PostKind, PostPatch, Result, SiteInfo } from '@shared/ipc'
import type { AppConfig } from './services/config-service'
import { getLogFile, logLine } from './services/logger'
import { runtimeFlags } from './services/runtime-flags'
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
  savePost,
  searchPosts
} from './services/post-service'
import { saveImage } from './services/asset-service'
import {
  listPlugins,
  listThemes,
  readRawConfig,
  readSiteConfig,
  readThemeConfig,
  saveBaseConfig,
  saveDeployConfig,
  saveRawConfig,
  saveThemeConfig,
  switchTheme
} from './services/site-config-service'
import type { BasePatch } from './services/site-config-service'
import {
  findFreePort,
  runHexoBuild,
  runNpm,
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
  // 渲染进程异常上报：落地到 userData/renderer-error.log，便于排查无控制台的打包环境
  ipcMain.on('app:renderer-error', (_e, message: string) => {
    console.error('[renderer]', message)
    const line = `[${new Date().toISOString()}] ${message}\n`
    appendFile(join(app.getPath('userData'), 'renderer-error.log'), line, 'utf8').catch(() => undefined)
  })

  let currentSite: string | null = null
  let watcher: SourceWatch | null = null
  let preview: ServerSession | null = null

  const broadcast = (channel: string, payload?: unknown): void => {
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send(channel, payload)
  }
  // 运行日志：同步送界面 + 落地到 userData/hexodeck.log
  const onLog = (line: string): void => {
    broadcast(EVT_LOG, line)
    void logLine(line)
  }
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
    void logLine(`打开站点: ${dir}`)
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

  ipcMain.handle('site:removeRecent', async (_e, path: string) => {
    await ctx.config.removeRecentSite(path)
  })

  // ============ 应用信息与设置（M4） ============

  ipcMain.handle('app:info', async () => ({
    version: app.getVersion(),
    logFile: getLogFile(),
    closeToTray: (await ctx.config.getSettings()).closeToTray
  }))

  ipcMain.handle('app:saveSettings', async (_e, patch: Partial<AppSettings>) => {
    try {
      const settings = await ctx.config.patchSettings(patch)
      runtimeFlags.closeToTray = settings.closeToTray
      void logLine(`应用设置已更新: ${JSON.stringify(settings)}`)
      return { ok: true, data: settings }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('app:openLogs', async () => {
    const file = getLogFile()
    if (file) shell.showItemInFolder(file)
    else await shell.openPath(app.getPath('userData'))
  })

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

  ipcMain.handle('post:search', async (_e, keyword: string) => {
    try {
      return currentSite ? okResult(await searchPosts(currentSite, keyword)) : okResult([])
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('asset:saveImage', async (_e, fileName: string, base64: string) => {
    try {
      return okResult(await saveImage(requireSite(), fileName, base64))
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('build:run', async (_e, command: BuildCommand) => {
    try {
      const result = await runHexoBuild(ctx.childBase, requireSite(), command, onLog)
      void logLine(`构建 ${command}: ${result.ok ? '成功' : '失败'}（${result.durationMs}ms）`)
      return result
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

  // ============ 站点配置 / 主题 / 插件（M3） ============

  ipcMain.handle('config:read', async () => {
    try {
      return okResult(await readSiteConfig(requireSite()))
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('config:saveBase', async (_e, patch: BasePatch) => {
    try {
      await saveBaseConfig(requireSite(), patch)
      onLog('✓ 基础配置已保存（原文件已备份为 _config.yml.hexodeck.bak）')
      return okResult()
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('config:saveDeploy', async (_e, deploy: { type: string; repo: string; branch: string }) => {
    try {
      await saveDeployConfig(requireSite(), deploy)
      onLog('✓ 部署配置已保存')
      return okResult()
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('config:readRaw', async () => {
    try {
      return okResult(await readRawConfig(requireSite()))
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('config:saveRaw', async (_e, content: string) => {
    try {
      await saveRawConfig(requireSite(), content)
      onLog('✓ _config.yml 已保存（原文件备份于 _config.yml.hexodeck.bak）')
      return okResult()
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('theme:list', async () => {
    try {
      return okResult(await listThemes(requireSite()))
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('theme:switch', async (_e, name: string) => {
    try {
      await switchTheme(requireSite(), name)
      onLog(`✓ 主题已切换为 ${name}，重新生成或重启预览后生效`)
      return okResult()
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('theme:readConfig', async () => {
    try {
      return okResult(await readThemeConfig(requireSite()))
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('theme:saveConfig', async (_e, content: string) => {
    try {
      const r = await saveThemeConfig(requireSite(), content)
      onLog(`✓ 主题配置已保存：${r.path}`)
      return okResult(r)
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('plugin:list', async () => {
    try {
      return okResult(await listPlugins(requireSite()))
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('plugin:install', async (_e, name: string) => {
    try {
      const site = requireSite()
      if (!/^[\w./@-]+$/.test(name)) return { ok: false, error: '非法的包名' }
      const ok = await runNpm(site, ['install', name, '--save', '--yes', '--no-fund', '--no-audit'], onLog)
      return ok ? okResult() : { ok: false, error: 'npm install 失败，详见运行日志' }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('plugin:uninstall', async (_e, name: string) => {
    try {
      const site = requireSite()
      if (!/^[\w./@-]+$/.test(name)) return { ok: false, error: '非法的包名' }
      const ok = await runNpm(site, ['uninstall', name, '--save', '--no-fund', '--no-audit'], onLog)
      return ok ? okResult() : { ok: false, error: 'npm uninstall 失败，详见运行日志' }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })
}
