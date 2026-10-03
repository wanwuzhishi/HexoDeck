// Windows 下 %TEMP% 可能被杀毒软件锁定，导致 esbuild 清理临时目录失败（Access is denied）。
// 该脚本把 TMP/TEMP/TMPDIR 重定向到项目内 .tmp 目录后再执行传入的命令。
import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

const tmp = resolve('.tmp')
try {
  rmSync(tmp, { recursive: true, force: true })
} catch {
  /* 上一次构建的临时目录可能仍被占用，忽略后复用 */
}
mkdirSync(tmp, { recursive: true })
process.env.TMP = tmp
process.env.TEMP = tmp
process.env.TMPDIR = tmp

const [, , cmd, ...args] = process.argv
if (!cmd) {
  console.error('用法: node scripts/run.mjs <command> [args...]')
  process.exit(1)
}
const result = spawnSync(cmd, args, { stdio: 'inherit', shell: true })
process.exit(result.status ?? 1)
