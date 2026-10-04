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

/**
 * 部署失败在 hexo 侧不会体现为退出码：deployer 用 spawn(stdio:'inherit') 调 git，
 * push 失败并不中断主流程，子进程照样上报 done 并退出码 0，界面就会误报「部署完成」。
 * 这里从输出中识别 git/hexo 的失败特征，把假成功纠正为失败。
 */
const DEPLOY_FAILURE_PATTERNS: Array<{ re: RegExp; hint: string }> = [
  { re: /remote:\s*Repository not found/i, hint: '远程仓库不存在或无权访问，请检查仓库地址' },
  { re: /fatal:\s*repository '[^']*' not found/i, hint: '远程仓库不存在，请检查仓库地址' },
  { re: /fatal:\s*Authentication failed/i, hint: '认证失败，请检查 Git 凭据' },
  { re: /fatal:\s*Could not read from remote repository/i, hint: '无法访问远程仓库，请检查网络与权限' },
  { re: /fatal:\s*'[^']*' does not appear to be a git repository/i, hint: '仓库地址无效' },
  { re: /fatal:\s*The current branch .* has no upstream/i, hint: '分支配置有误（deploy.branch 可能为空）' },
  { re: /error:\s*failed to push some refs/i, hint: '推送被拒绝' },
  { re: /!\s*\[rejected\]/i, hint: '推送被远端拒绝' },
  { re: /fatal:\s*destination path '[^']*' is not an empty directory/i, hint: '远程目标目录非空' },
  { re: /ERROR\s+Deployer not found/i, hint: '未安装部署插件（如 hexo-deployer-git）' },
  { re: /fatal:\s*not a git repository/i, hint: '部署目录不是 git 仓库' }
]

/** 从构建/部署输出中提取失败原因；无失败特征时返回 undefined */
export function detectDeployFailure(output: string): string | undefined {
  for (const { re, hint } of DEPLOY_FAILURE_PATTERNS) {
    if (re.test(output)) {
      const line = output.split(/\r?\n/).find((l) => re.test(l))?.trim()
      return `${hint}${line ? `（${line}）` : ''}`
    }
  }
  return undefined
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
        // 收集输出用于部署失败判定（hexo 对 push 失败不上报非零退出码）
        const collected: string[] = []
        const collect = (line: string): void => {
          collected.push(line)
          if (collected.length > 500) collected.shift()
          onLog(line)
        }
        pipeLogs(child, collect)
        child.on('message', (m: { type?: string; message?: string }) => {
          if (m?.type === 'done') done = true
          if (m?.type === 'error') error = m.message
        })
        child.on('error', (e) => {
          error = String(e)
        })
        child.on('exit', (code) => {
          let ok = done && code === 0
          // 退出码为 0 也不代表部署成功，需从输出里识别被吞掉的 git 失败
          if (ok && command === 'deploy') {
            const failure = detectDeployFailure(collected.join('\n'))
            if (failure) {
              ok = false
              error = failure
            }
          }
          resolveBuild({
            ok,
            command,
            durationMs: Date.now() - started,
            error: error ?? (code !== 0 ? `进程退出码 ${code}` : undefined)
          })
        })
      })
  )
}

/** 在站点目录执行 npm 命令（安装依赖/插件等），日志实时回调。
 *  --yes 自动确认 npm 的交互提示（否则 piped stdin 下 npm 会永远等待导致转圈）；
 *  5 分钟看门狗超时强制终止进程树，避免队列卡死。 */
export function runNpm(siteDir: string, args: string[], onLog: (line: string) => void): Promise<boolean> {
  return enqueue(
    () =>
      new Promise<boolean>((resolveInstall) => {
        onLog(`$ npm ${args.join(' ')}`)
        const child = spawn('npm', args, {
          cwd: siteDir,
          shell: true,
          env: process.env
        })
        pipeLogs(child, onLog)
        const watchdog = setTimeout(
          () => {
            onLog('✗ npm 执行超时（5 分钟），已强制终止。请检查网络后重试。')
            try {
              if (child.pid) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { shell: true })
            } catch {
              child.kill()
            }
            resolveInstall(false)
          },
          5 * 60_000
        )
        child.on('error', (e) => {
          clearTimeout(watchdog)
          onLog(`npm 启动失败：${String(e)}。请确认本机已安装 Node.js/npm。`)
          resolveInstall(false)
        })
        child.on('exit', (code) => {
          clearTimeout(watchdog)
          resolveInstall(code === 0)
        })
      })
  )
}

/** 新建站点后安装全部依赖 */
export function runNpmInstall(siteDir: string, onLog: (line: string) => void): Promise<boolean> {
  return runNpm(siteDir, ['install', '--yes', '--no-fund', '--no-audit'], onLog)
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
