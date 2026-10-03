import { fork, spawn, type ChildProcess } from 'child_process'
import { createServer } from 'net'
import type { BuildCommand, BuildResult } from '@shared/ipc'

export interface ChildBase {
  childScript: string
}

function childEnv(): NodeJS.ProcessEnv {
  return { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
}

function pipeLogs(child: ChildProcess, onLog: (line: string) => void): void {
  const forward = (stream: NodeJS.ReadableStream | null): void => {
    if (!stream) return
    let buf = ''
    stream.setEncoding('utf8')
    stream.on('data', (chunk: string) => {
      buf += chunk
      let idx: number
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).replace(/\r$/, '')
        buf = buf.slice(idx + 1)
        if (line) onLog(line)
      }
    })
  }
  forward(child.stdout)
  forward(child.stderr)
}

/** 串行队列：避免多个 hexo 子进程并发写 db.json */
let queue: Promise<unknown> = Promise.resolve()
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.then(task, task)
  queue = next.catch(() => undefined)
  return next
}

export function runHexoBuild(
  base: ChildBase,
  siteDir: string,
  command: BuildCommand,
  onLog: (line: string) => void
): Promise<BuildResult> {
  return enqueue(
    () =>
      new Promise<BuildResult>((resolveBuild) => {
        const started = Date.now()
        onLog(`$ hexo ${command}`)
        const child = fork(base.childScript, [siteDir, command, '0', '0'], {
          silent: true,
          env: childEnv(),
          execPath: process.execPath
        })
        let done = false
        let error: string | undefined
        pipeLogs(child, onLog)
        child.on('message', (m: { type?: string; message?: string }) => {
          if (m?.type === 'done') done = true
          if (m?.type === 'error') error = m.message
        })
        child.on('error', (e) => {
          error = String(e)
        })
        child.on('exit', (code) => {
          resolveBuild({
            ok: done && code === 0,
            command,
            durationMs: Date.now() - started,
            error: error ?? (code !== 0 ? `进程退出码 ${code}` : undefined)
          })
        })
      })
  )
}

/** 在新建的站点目录执行 npm install（需要用户机器上有 Node/npm） */
export function runNpmInstall(siteDir: string, onLog: (line: string) => void): Promise<boolean> {
  return enqueue(
    () =>
      new Promise<boolean>((resolveInstall) => {
        onLog('$ npm install')
        const child = spawn('npm', ['install', '--no-fund', '--no-audit'], {
          cwd: siteDir,
          shell: true,
          env: process.env
        })
        pipeLogs(child, onLog)
        child.on('error', (e) => {
          onLog(`npm 启动失败：${String(e)}。请手动在站点目录执行 npm install。`)
          resolveInstall(false)
        })
        child.on('exit', (code) => resolveInstall(code === 0))
      })
  )
}

export async function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolvePort) => {
    const probe = createServer()
    probe.once('error', () => resolvePort(false))
    probe.once('listening', () => probe.close(() => resolvePort(true)))
    probe.listen(port, '127.0.0.1')
  })
}

export async function findFreePort(preferred = 4000): Promise<number> {
  for (let p = preferred; p < preferred + 50; p++) {
    if (await isPortFree(p)) return p
  }
  return 0 // 让系统随机分配
}

export interface ServerSession {
  port: number
  stop: () => Promise<void>
}

/** 启动 hexo server 子进程；resolve 表示已就绪，reject 表示启动失败 */
export function startHexoServer(
  base: ChildBase,
  siteDir: string,
  port: number,
  includeDrafts: boolean,
  onLog: (line: string) => void,
  onStopped?: () => void
): Promise<ServerSession> {
  return new Promise<ServerSession>((resolveSession, rejectSession) => {
    onLog(`$ hexo server${includeDrafts ? ' --draft' : ''}`)
    const child = fork(
      base.childScript,
      [siteDir, 'server', String(port), includeDrafts ? '1' : '0'],
      { silent: true, env: childEnv(), execPath: process.execPath }
    )
    let settled = false
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        child.kill()
        rejectSession(new Error('预览服务启动超时（60s）'))
      }
    }, 60_000)

    pipeLogs(child, onLog)
    child.on('message', (m: { type?: string; message?: string; port?: number }) => {
      if (m?.type === 'ready') {
        settled = true
        clearTimeout(timer)
        resolveSession({
          port: m.port ?? port,
          stop: () =>
            new Promise<void>((resolveStop) => {
              const killTimer = setTimeout(() => child.kill('SIGKILL'), 3000)
              child.once('exit', () => {
                clearTimeout(killTimer)
                resolveStop()
              })
              child.send('stop')
            })
        })
      }
      if (m?.type === 'error') {
        settled = true
        clearTimeout(timer)
        rejectSession(new Error(m.message ?? 'hexo server 启动失败'))
      }
    })
    child.on('exit', (code) => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        rejectSession(new Error(`hexo server 进程退出（码 ${code}），请检查日志`))
      } else {
        onStopped?.()
      }
    })
  })
}
