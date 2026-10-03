import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { registerIpc } from './ipc'
import { AppConfig } from './services/config-service'
import { initLogger } from './services/logger'
import { createTray, focusWindow, notifyHidden } from './services/tray'
import { runtimeFlags } from './services/runtime-flags'
import type { ChildBase } from './services/hexo-process-service'

/** 子进程脚本与内嵌 hexo 的位置：开发时在项目目录，打包后在 app.asar.unpacked */
const childBase: ChildBase = app.isPackaged
  ? {
      childScript: join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'child', 'hexo-child.js')
    }
  : { childScript: join(app.getAppPath(), 'resources', 'child', 'hexo-child.js') }

/** 应用图标（托盘/窗口）：同样放在 app.asar.unpacked 便于原生模块读取 */
const iconPath = app.isPackaged
  ? join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'icon.png')
  : join(app.getAppPath(), 'resources', 'icon.png')

let mainWindow: BrowserWindow | null = null
let quitting = false

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    icon: iconPath,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.on('ready-to-show', () => win.show())

  // 关闭到托盘：设置开启时拦截关闭并隐藏窗口
  win.on('close', (e) => {
    if (!quitting && runtimeFlags.closeToTray) {
      e.preventDefault()
      win.hide()
      notifyHidden()
    }
  })

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

// 单实例锁：重复启动时唤回已有窗口（配合托盘使用，避免多开）
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) focusWindow(mainWindow)
  })

  app.whenReady().then(async () => {
    app.setAppUserModelId('com.hexodeck.app')

    const config = new AppConfig(join(app.getPath('userData'), 'hexodeck.json'))
    await initLogger(app.getPath('userData'))
    runtimeFlags.closeToTray = (await config.getSettings()).closeToTray

    registerIpc({ childBase, config })

    mainWindow = createWindow()

    createTray(iconPath, () => {
      if (mainWindow && !mainWindow.isDestroyed()) focusWindow(mainWindow)
      else mainWindow = createWindow()
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
    })
  })
}

app.on('before-quit', () => {
  quitting = true
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// 沙箱/兼容性问题的诊断出口：渲染进程或 GPU 崩溃时打印类型、原因与退出码
app.on('child-process-gone', (_event, details) => {
  console.error(
    `[HexoDeck] 子进程异常: type=${details.type} reason=${details.reason} exitCode=${details.exitCode}`
  )
})
