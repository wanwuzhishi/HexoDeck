import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { ProgressInfo, UpdateInfo } from 'electron-updater'
import type { UpdateStatus } from '@shared/ipc'
import { logLine } from './logger'

let emit: (s: UpdateStatus) => void = () => undefined
let autoCheck = true
let wired = false
let lastProgressLogged = -1

function status(s: UpdateStatus, log = true): void {
  emit(s)
  if (!log) return
  const extra = [
    s.version ? `v${s.version}` : '',
    s.percent != null ? `${Math.round(s.percent)}%` : '',
    s.message ?? ''
  ]
    .filter(Boolean)
    .join(' ')
  void logLine(`[updater] ${s.state}${extra ? ' ' + extra : ''}`)
}

/** 注入向渲染进程广播状态的通道 */
export function setUpdateEmitter(fn: (s: UpdateStatus) => void): void {
  emit = fn
}

/** 初始化自动更新（仅打包版本；开发模式直接上报 unsupported） */
export function initUpdater(): void {
  if (wired) return
  wired = true
  if (!app.isPackaged) {
    status({ state: 'unsupported', message: '开发模式不支持自动更新（打包版本可用）' })
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  // electron-updater 日志接入运行日志文件
  autoUpdater.logger = {
    info: (m?: unknown) => void logLine(`[updater] ${String(m)}`),
    warn: (m?: unknown) => void logLine(`[updater][warn] ${String(m)}`),
    error: (m?: unknown) => void logLine(`[updater][error] ${String(m)}`),
    debug: () => undefined
  }

  autoUpdater.on('checking-for-update', () => {
    lastProgressLogged = -1
    status({ state: 'checking' })
  })
  autoUpdater.on('update-available', (info: UpdateInfo) =>
    status({ state: 'available', version: info.version })
  )
  autoUpdater.on('update-not-available', (info: UpdateInfo) =>
    status({ state: 'not-available', version: info.version })
  )
  autoUpdater.on('download-progress', (p: ProgressInfo) => {
    // 状态每次推送（界面进度条），日志每跨 10% 记一条避免刷屏
    const rounded = Math.round(p.percent)
    const shouldLog = rounded >= lastProgressLogged + 10 || rounded === 100
    if (shouldLog) lastProgressLogged = rounded
    status({ state: 'downloading', percent: p.percent }, shouldLog)
  })
  autoUpdater.on('update-downloaded', (info: UpdateInfo) =>
    status({ state: 'downloaded', version: info.version })
  )
  autoUpdater.on('error', (e: Error) =>
    status({ state: 'error', message: String(e?.message ?? e) })
  )
}

export function setAutoCheck(v: boolean): void {
  autoCheck = v
}

/** 手动/自动检查更新 */
export async function checkForUpdates(): Promise<void> {
  if (!app.isPackaged) {
    status({ state: 'unsupported', message: '开发模式不支持自动更新（打包版本可用）' })
    return
  }
  try {
    await autoUpdater.checkForUpdates()
  } catch (e) {
    status({ state: 'error', message: String((e as Error)?.message ?? e) })
  }
}

/** 退出并安装已下载的更新 */
export function quitAndInstall(): void {
  if (!app.isPackaged) return
  autoUpdater.quitAndInstall()
}

/** 启动后延时检查一次 + 每 6 小时轮询（尊重自动检查开关） */
export function scheduleUpdateChecks(): void {
  if (!app.isPackaged) return
  setTimeout(() => {
    if (autoCheck) void checkForUpdates()
  }, 8_000)
  setInterval(
    () => {
      if (autoCheck) void checkForUpdates()
    },
    6 * 60 * 60 * 1000
  )
}
