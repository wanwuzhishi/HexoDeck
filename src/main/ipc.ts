import { BrowserWindow, app, dialog, ipcMain, shell } from 'electron'
import { existsSync } from 'fs'
import { appendFile, readFile, stat } from 'fs/promises'
import { dirname, join, relative, resolve, sep } from 'path'
import type {
  AppSettings,
  BuildCommand,
  CollectionPostPatch,
  ConfigPathInfo,
  ConfigPathKind,
  PageCreateOptions,
  PagePatch,
  PostKind,
  PostPatch,
  Result,
  SiteInfo
} from '@shared/ipc'
import type { AppConfig } from './services/config-service'
import { siteConfigKey, themeConfigKey } from './services/config-service'
import { getLogFile, logLine } from './services/logger'
import { runtimeFlags } from './services/runtime-flags'
import {
  checkForUpdates,
  initUpdater,
  quitAndInstall,
  setAutoCheck,
  setUpdateEmitter
} from './services/updater'
import { createSite, openSite as openSiteInfo } from './services/site-service'
import {
  createPost,
  deletePost,
  listPosts,
  publishDraft,
  readPost,
  savePost,
  searchPosts
} from './services/post-service'
import {
  createPage,
  deletePage,
  listPages,
  readPage,
  savePage
} from './services/page-service'
import {
  clearSiteIcon,
  saveImage,
  saveSiteIcon
} from './services/asset-service'
import {
  createCollectionPost,
  deleteCollectionPost,
  listCollectionPosts,
  readCollectionPost,
  saveCollectionPost
} from './services/collection-service'
import { installThemeFromArchive, isArchive } from './services/theme-archive-service'
import { collectStats } from './services/stats-service'
import {
  defaultThemeConfigPath,
  listPlugins,
  listThemes,
  readRawConfig,
  readSiteConfig,
  readThemeConfig,
  saveBaseConfig,
  saveDeployConfig,
  saveRawConfig,
  saveThemeConfig,
  switchTheme,
  validateDeployConfig
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
const EVT_UPDATE_STATUS = 'evt:update-status'

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
      title: '选择已安装 Hexo 的博客文件夹（含 _config.yml）'
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

  // 自动更新：状态推送到所有窗口
  setUpdateEmitter((s) => broadcast(EVT_UPDATE_STATUS, s))
  initUpdater()

  ipcMain.handle('app:info', async () => {
    const settings = await ctx.config.getSettings()
    return {
      version: app.getVersion(),
      logFile: getLogFile(),
      closeToTray: settings.closeToTray,
      autoCheckUpdate: settings.autoCheckUpdate
    }
  })

  ipcMain.handle('app:saveSettings', async (_e, patch: Partial<AppSettings>) => {
    try {
      const settings = await ctx.config.patchSettings(patch)
      runtimeFlags.closeToTray = settings.closeToTray
      setAutoCheck(settings.autoCheckUpdate)
      void logLine(`应用设置已更新: ${JSON.stringify(settings)}`)
      return { ok: true, data: settings }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('app:checkUpdate', async () => {
    void checkForUpdates()
  })

  ipcMain.handle('app:installUpdate', async () => {
    quitAndInstall()
  })

  ipcMain.handle('shell:reveal', async (_e, path: string) => {
    if (typeof path !== 'string' || !path.trim()) return
    const target = resolve(path.trim())
    // 目录直接打开：showItemInFolder 对目录只会定位其父级，体验不符预期；
    // 文件则在资源管理器中定位并选中
    const st = await stat(target).catch(() => null)
    if (st?.isDirectory()) {
      await shell.openPath(target)
      return
    }
    shell.showItemInFolder(target)
  })

  ipcMain.handle('app:openLogs', async () => {
    const file = getLogFile()
    if (file) shell.showItemInFolder(file)
    else await shell.openPath(app.getPath('userData'))
  })

  // ---- 自绘标题栏的窗口控制（无边框窗口下由渲染进程按钮触发） ----

  /** 取发起调用的窗口；无边框窗口下必须按事件来源定位，不能假定单窗口 */
  const windowOf = (e: Electron.IpcMainInvokeEvent): BrowserWindow | null =>
    BrowserWindow.fromWebContents(e.sender)

  ipcMain.handle('window:minimize', async (e) => {
    windowOf(e)?.minimize()
  })

  ipcMain.handle('window:toggleMaximize', async (e) => {
    const win = windowOf(e)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
    return win.isMaximized()
  })

  ipcMain.handle('window:close', async (e) => {
    // 走 close 事件，保留「关闭到托盘」的既有逻辑
    windowOf(e)?.close()
  })

  ipcMain.handle('window:isMaximized', async (e) => windowOf(e)?.isMaximized() ?? false)

  const requireSite = (): string => {
    if (!currentSite) throw new Error('尚未打开站点')
    return currentSite
  }

  ipcMain.handle('post:list', async () => (currentSite ? listPosts(currentSite) : []))

  // ---- 站点图标：图片写入站点 source/，随站点走（Hexo 生成时网站也会用上） ----

  /** 保存图标后返回带最新 iconUrl 的站点信息，供界面立即刷新 */
  const siteInfoWithIcon = async (dir: string): Promise<SiteInfo> => {
    const info = await openSiteInfo(dir)
    void logLine(info.iconPath ? `站点图标已更新：${info.iconPath}` : '站点图标已移除')
    return info
  }

  ipcMain.handle('site:pickIcon', async (): Promise<Result<SiteInfo>> => {
    try {
      const site = requireSite()
      const picked = await dialog.showOpenDialog({
        title: '选择站点图标（favicon）',
        filters: [
          { name: '图片', extensions: ['ico', 'png', 'jpg', 'jpeg', 'svg', 'webp', 'gif', 'bmp'] }
        ],
        properties: ['openFile']
      })
      if (picked.canceled || picked.filePaths.length === 0) return { ok: false, error: 'canceled' }
      const file = picked.filePaths[0]
      const base64 = (await readFile(file)).toString('base64')
      await saveSiteIcon(site, file, base64)
      return okResult(await siteInfoWithIcon(site))
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  ipcMain.handle(
    'site:setIcon',
    async (_e, fileName: string, base64: string): Promise<Result<SiteInfo>> => {
      try {
        const site = requireSite()
        await saveSiteIcon(site, fileName, base64)
        return okResult(await siteInfoWithIcon(site))
      } catch (e) {
        return { ok: false, error: (e as Error).message }
      }
    }
  )

  ipcMain.handle('site:clearIcon', async (): Promise<Result<SiteInfo>> => {
    try {
      const site = requireSite()
      await clearSiteIcon(site)
      return okResult(await siteInfoWithIcon(site))
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  // ---- 页面（source/ 下非文章目录的 markdown） ----

  ipcMain.handle('page:list', async () => (currentSite ? listPages(currentSite) : []))

  ipcMain.handle('page:read', async (_e, id: string) => {
    try {
      return okResult(await readPage(requireSite(), id))
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('page:create', async (_e, options: PageCreateOptions) => {
    try {
      const meta = await createPage(requireSite(), options)
      onLog(`✓ 页面已创建：source/${meta.id}`)
      return okResult(meta)
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('page:save', async (_e, id: string, patch: PagePatch): Promise<Result> => {
    try {
      await savePage(requireSite(), id, patch)
      return okResult()
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('page:delete', async (_e, id: string): Promise<Result> => {
    try {
      const site = requireSite()
      await deletePage(site, id, (p) => shell.trashItem(p))
      return okResult()
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  // ---- 自定义文集（按站点记忆的侧栏入口 + 站点根目录内的文章目录） ----

  /** 名字（1-8 字）与图标入口的合法性校验 */
  const validCollName = (name: string): string | null => {
    const n = name.trim()
    if (!n) return '文集名称不能为空'
    if (n.length > 8) return '文集名称不能超过 8 个字符'
    return null
  }

  /** 取当前站点的文集定义；id 不存在时抛错 */
  const collOf = async (id: string) => {
    const site = requireSite()
    const def = (await ctx.config.listCollections(site)).find((c) => c.id === id)
    if (!def) throw new Error('文集不存在（可能已被移除），请刷新侧栏')
    return { site, def }
  }

  /** 校验「站点内相对路径」（如 source/_dynamics、notes）：拒绝穿越与绝对路径 */
  const normalizeInsideRel = (rel: string): string | null => {
    const cleaned = (rel ?? '').trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
    if (cleaned === '') return '' // 站点根目录本身
    const parts = cleaned.split('/')
    if (parts.some((p) => p === '..')) return null
    return parts.filter((p) => p && p !== '.').join('/')
  }

  /** 把绝对目录转换为站点内 posix 相对路径；不在站点内时返回 null。
   *  站点根目录本身返回空串（表示整个站点），任意深度的子目录均允许。 */
  const dirInsideSite = (siteDir: string, abs: string): string | null => {
    const root = resolve(siteDir)
    const target = resolve(abs)
    if (!target.startsWith(root + sep) && target !== root) return null
    return relative(root, target).split(sep).join('/')
  }

  ipcMain.handle('coll:list', async () => {
    try {
      return currentSite ? await ctx.config.listCollections(currentSite) : []
    } catch {
      return []
    }
  })

  ipcMain.handle('coll:pickDir', async (): Promise<Result<{ dir: string } | null>> => {
    try {
      const site = requireSite()
      const picked = await dialog.showOpenDialog({
        title: '选择文集目录（站点根目录内的文件夹）',
        defaultPath: site,
        properties: ['openDirectory']
      })
      if (picked.canceled || picked.filePaths.length === 0) {
        return okResult(null)
      }
      const dir = dirInsideSite(site, picked.filePaths[0])
      if (dir === null) {
        return { ok: false, error: '文集目录必须是站点根目录或其子目录' }
      }
      return okResult({ dir })
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  ipcMain.handle(
    'coll:add',
    async (_e, name: string, icon: string, dir: string): Promise<Result<import('@shared/ipc').CollectionDef[]>> => {
      try {
        const site = requireSite()
        const nameErr = validCollName(name)
        if (nameErr) return { ok: false, error: nameErr }
        const inside = normalizeInsideRel(dir)
        if (inside === null) return { ok: false, error: '文集目录必须是站点根目录或其子目录' }
        const defs = await ctx.config.addCollection(site, {
          id: `coll-${Date.now().toString(36)}`,
          name: name.trim(),
          icon: icon || '📁',
          dir: inside
        })
        void logLine(`新增文集「${name.trim()}」：${inside}`)
        return okResult(defs)
      } catch (e) {
        return { ok: false, error: (e as Error).message }
      }
    }
  )

  ipcMain.handle(
    'coll:update',
    async (_e, id: string, patch: { name?: string; icon?: string }): Promise<Result<import('@shared/ipc').CollectionDef[]>> => {
      try {
        const site = requireSite()
        if (patch.name !== undefined) {
          const nameErr = validCollName(patch.name)
          if (nameErr) return { ok: false, error: nameErr }
        }
        const defs = await ctx.config.updateCollection(site, id, patch)
        return okResult(defs)
      } catch (e) {
        return { ok: false, error: (e as Error).message }
      }
    }
  )

  ipcMain.handle('coll:remove', async (_e, id: string): Promise<Result<import('@shared/ipc').CollectionDef[]>> => {
    try {
      const site = requireSite()
      const defs = await ctx.config.removeCollection(site, id)
      void logLine('已移除文集（仅移除入口，不删除目录与文件）')
      return okResult(defs)
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('coll:postList', async (_e, collectionId: string) => {
    try {
      const { site, def } = await collOf(collectionId)
      return listCollectionPosts(site, def)
    } catch (e) {
      onLog(`✗ ${(e as Error).message}`)
      return []
    }
  })

  ipcMain.handle('coll:postRead', async (_e, collectionId: string, id: string) => {
    try {
      const { site, def } = await collOf(collectionId)
      return okResult(await readCollectionPost(site, def, id))
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('coll:postCreate', async (_e, collectionId: string, title: string) => {
    try {
      const { site, def } = await collOf(collectionId)
      return okResult(await createCollectionPost(site, def, title))
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  ipcMain.handle(
    'coll:postSave',
    async (_e, collectionId: string, id: string, patch: CollectionPostPatch): Promise<Result> => {
      try {
        const { site, def } = await collOf(collectionId)
        await saveCollectionPost(site, def, id, patch)
        return okResult()
      } catch (e) {
        return { ok: false, error: (e as Error).message }
      }
    }
  )

  ipcMain.handle(
    'coll:postDelete',
    async (_e, collectionId: string, id: string): Promise<Result> => {
      try {
        const { site, def } = await collOf(collectionId)
        await deleteCollectionPost(site, def, id, (p) => shell.trashItem(p))
        return okResult()
      } catch (e) {
        return { ok: false, error: (e as Error).message }
      }
    }
  )

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

  ipcMain.handle('stats:get', async () => {
    try {
      return okResult(await collectStats(requireSite()))
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('build:run', async (_e, command: BuildCommand) => {
    try {
      const site = requireSite()
      // 部署前必须先按当前源码生成静态页面，否则推送的是上一次 generate 的旧产物
      if (command === 'deploy') {
        const issue = await validateDeployConfig(site)
        if (issue) {
          onLog(`✗ ${issue}`)
          return { ok: false, command, durationMs: 0, error: issue }
        }
        onLog('— 部署前先执行 hexo generate（确保推送最新内容）—')
        const gen = await runHexoBuild(ctx.childBase, site, 'generate', onLog)
        if (!gen.ok) {
          const msg = `生成静态页面失败，已中止部署：${gen.error ?? '未知错误'}`
          onLog(`✗ ${msg}`)
          return { ok: false, command, durationMs: gen.durationMs, error: msg }
        }
      }
      const result = await runHexoBuild(ctx.childBase, site, command, onLog)
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

  // ---- 配置文件路径记忆：主题 YAML 与站点 _config.yml 均由用户指定，不自动定位 ----

  /** 解析当前站点/主题对应的记忆键与约定默认路径 */
  const resolvePathTarget = async (
    kind: ConfigPathKind
  ): Promise<{ key: string; defaultPath: string; theme?: string }> => {
    const site = requireSite()
    if (kind === 'site') {
      return { key: siteConfigKey(site), defaultPath: join(site, '_config.yml') }
    }
    const theme = (await readSiteConfig(site)).theme
    if (!theme) throw new Error('未设置主题，请先在「基础配置」中选择主题')
    return { key: themeConfigKey(site, theme), defaultPath: defaultThemeConfigPath(site, theme), theme }
  }

  const getPathInfo = async (kind: ConfigPathKind): Promise<ConfigPathInfo> => {
    const t = await resolvePathTarget(kind)
    const path = await ctx.config.getConfigPath(t.key)
    return { kind, theme: t.theme, path, exists: path ? existsSync(path) : false, defaultPath: t.defaultPath }
  }

  /** 读/写配置文件前取已记住的路径；未指定时明确报错，引导用户去点「自定义路径」 */
  const requireConfigPath = async (kind: ConfigPathKind): Promise<string> => {
    const t = await resolvePathTarget(kind)
    const path = await ctx.config.getConfigPath(t.key)
    if (!path) {
      throw new Error(
        kind === 'site'
          ? '尚未指定 Hexo 配置文件路径，请在「设置 → 高级」点击「自定义路径」选择'
          : '尚未指定主题配置文件路径，请在「设置 → 主题」点击「自定义路径」选择'
      )
    }
    return path
  }

  ipcMain.handle('config:getPath', async (_e, kind: ConfigPathKind) => {
    try {
      return okResult(await getPathInfo(kind))
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('config:pickPath', async (_e, kind: ConfigPathKind) => {
    try {
      const t = await resolvePathTarget(kind)
      const picked = await dialog.showOpenDialog({
        title:
          kind === 'site'
            ? '选择 Hexo 配置文件（_config.yml）'
            : `选择主题「${t.theme}」的配置文件（YAML）`,
        filters: [
          { name: 'YAML 配置文件', extensions: ['yml', 'yaml'] },
          { name: '所有文件', extensions: ['*'] }
        ],
        properties: ['openFile'],
        defaultPath: dirname(t.defaultPath)
      })
      if (picked.canceled || picked.filePaths.length === 0) return { ok: false, error: 'canceled' }
      await ctx.config.setConfigPath(t.key, picked.filePaths[0])
      void logLine(`配置文件路径已指定（${kind === 'site' ? '站点配置' : `主题 ${t.theme}`}）: ${picked.filePaths[0]}`)
      return okResult(await getPathInfo(kind))
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('config:useDefaultPath', async (_e, kind: ConfigPathKind) => {
    try {
      const t = await resolvePathTarget(kind)
      await ctx.config.setConfigPath(t.key, t.defaultPath)
      void logLine(`配置文件路径采用默认位置（${kind === 'site' ? '站点配置' : `主题 ${t.theme}`}）: ${t.defaultPath}`)
      return okResult(await getPathInfo(kind))
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('config:clearPath', async (_e, kind: ConfigPathKind) => {
    try {
      const t = await resolvePathTarget(kind)
      await ctx.config.clearConfigPath(t.key)
      void logLine(`已清除配置文件路径记忆（${kind === 'site' ? '站点配置' : `主题 ${t.theme}`}）`)
      return okResult(await getPathInfo(kind))
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

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
      return okResult(await readRawConfig(await requireConfigPath('site')))
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('config:saveRaw', async (_e, content: string) => {
    try {
      const path = await requireConfigPath('site')
      await saveRawConfig(path, content)
      onLog(`✓ 配置文件已保存：${path}（首次修改已自动备份为 *.hexodeck.bak）`)
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

  // 从压缩包安装主题（对话框选择 / 拖拽）
  const installThemeArchive = async (archivePath: string) => {
    try {
      const result = await installThemeFromArchive(requireSite(), archivePath, onLog)
      void logLine(`主题安装完成: ${result.name}`)
      return okResult({ name: result.name })
    } catch (e) {
      const msg = (e as Error).message
      onLog(`✗ 主题安装失败：${msg}`)
      return { ok: false, error: msg }
    }
  }

  ipcMain.handle('theme:installDialog', async () => {
    const picked = await dialog.showOpenDialog({
      title: '选择主题压缩包',
      filters: [{ name: '主题压缩包', extensions: ['zip', 'tar', 'gz', 'tgz'] }],
      properties: ['openFile']
    })
    if (picked.canceled || picked.filePaths.length === 0) return { ok: false, error: 'canceled' }
    return installThemeArchive(picked.filePaths[0])
  })

  ipcMain.handle('theme:installArchive', async (_e, archivePath: string) => {
    if (!isArchive(archivePath)) {
      return { ok: false, error: '仅支持 .zip / .tar / .tar.gz / .tgz 格式的主题压缩包' }
    }
    return installThemeArchive(archivePath)
  })

  ipcMain.handle('theme:readConfig', async () => {
    try {
      return okResult(await readThemeConfig(await requireConfigPath('theme')))
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  ipcMain.handle('theme:saveConfig', async (_e, content: string) => {
    try {
      const r = await saveThemeConfig(await requireConfigPath('theme'), content)
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
