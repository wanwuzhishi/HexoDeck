import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { registerIpc } from './ipc'
import { AppConfig } from './services/config-service'
import type { ChildBase } from './services/hexo-process-service'

/** 子进程脚本与内嵌 hexo 的位置：开发时在项目目录，打包后在 app.asar.unpacked */
const childBase: ChildBase = app.isPackaged
  ? {
      childScript: join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'child', 'hexo-child.js')
    }
  : { childScript: join(app.getAppPath(), 'resources', 'child', 'hexo-child.js') }

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.on('ready-to-show', () => win.show())

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

app.whenReady().then(() => {
  const config = new AppConfig(join(app.getPath('userData'), 'hexodeck.json'))
  registerIpc({ childBase, config })
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
