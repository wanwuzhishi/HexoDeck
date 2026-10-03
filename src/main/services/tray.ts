import { app, Menu, nativeImage, Tray, BrowserWindow } from 'electron'

let tray: Tray | null = null

/** 创建系统托盘：双击显示主窗口，右键菜单显示/启动预览/退出 */
export function createTray(iconPath: string, onShow: () => void): void {
  if (tray) return
  const image = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
  tray = new Tray(image)
  tray.setToolTip('HexoDeck')
  const menu = Menu.buildFromTemplate([
    { label: '显示主窗口', click: onShow },
    { type: 'separator' },
    {
      label: '退出 HexoDeck',
      click: () => {
        app.quit()
      }
    }
  ])
  tray.setContextMenu(menu)
  tray.on('double-click', onShow)
  tray.on('click', onShow)
}

/** 主窗口关闭到托盘时提示一次（气泡） */
export function notifyHidden(): void {
  tray?.displayBalloon?.({
    title: 'HexoDeck',
    content: '已最小化到托盘，双击托盘图标恢复窗口'
  })
}

export function getTray(): Tray | null {
  return tray
}

/** 供窗口恢复时聚焦 */
export function focusWindow(win: BrowserWindow): void {
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}
