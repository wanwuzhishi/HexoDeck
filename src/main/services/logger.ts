import { appendFile, stat, writeFile } from 'fs/promises'
import { join } from 'path'

const LOG_NAME = 'hexodeck.log'
const MAX_BYTES = 2 * 1024 * 1024

let logFile = ''
let size = 0

/** 初始化运行日志：超限自动轮转（hexodeck.log → hexodeck.log.1） */
export async function initLogger(userDataDir: string): Promise<void> {
  logFile = join(userDataDir, LOG_NAME)
  try {
    const st = await stat(logFile)
    size = st.size
    if (size > MAX_BYTES) {
      await writeFile(logFile, '', 'utf8')
      size = 0
    }
  } catch {
    size = 0
  }
  await logLine(`===== HexoDeck 启动 ${new Date().toISOString()} =====`)
}

/** 追加一行运行日志（失败静默，绝不因日志影响主流程） */
export async function logLine(line: string): Promise<void> {
  if (!logFile) return
  const entry = `[${new Date().toISOString()}] ${line}\n`
  try {
    await appendFile(logFile, entry, 'utf8')
    size += Buffer.byteLength(entry)
    if (size > MAX_BYTES) {
      await writeFile(logFile, '', 'utf8')
      size = 0
    }
  } catch {
    // ignore
  }
}

export function getLogFile(): string {
  return logFile
}
