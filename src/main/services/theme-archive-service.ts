import { promises as fs } from 'fs'
import { existsSync } from 'fs'
import { basename, join, dirname } from 'path'
import * as tar from 'tar'

/** 主题压缩包支持的扩展名 */
const ARCHIVE_EXT = /\.(zip|tar|tar\.gz|tgz)$/i

export function isArchive(filePath: string): boolean {
  return ARCHIVE_EXT.test(filePath)
}

/** 从压缩包文件名推断主题目录名（去掉扩展名与常见前缀） */
function themeNameFromArchive(filePath: string): string {
  let name = basename(filePath).replace(ARCHIVE_EXT, '')
  name = name.replace(/^hexo-theme-/i, '').replace(/^theme-/i, '')
  return name.replace(/[\\/:*?"<>|\s]+/g, '-').trim() || 'imported-theme'
}

async function isThemeDir(dir: string): Promise<boolean> {
  const stat = await fs.stat(dir).catch(() => null)
  if (!stat?.isDirectory()) return false
  return existsSync(join(dir, '_config.yml')) || existsSync(join(dir, 'layout'))
}

/**
 * 在解压结果中定位真正的主题目录：
 * 压缩包常见结构为 `主题名/_config.yml` 或 `主题名/layout/`（多一层包裹），
 * 直接解压到 themes/ 会变成 themes/主题名/主题名，这里做规整。
 */
async function locateThemeRoot(extractDir: string): Promise<string> {
  if (await isThemeDir(extractDir)) return extractDir

  const entries = await fs.readdir(extractDir, { withFileTypes: true })
  const dirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith('__') && e.name !== '.git')
  const files = entries.filter((e) => e.isFile() && !e.name.startsWith('.'))

  // 单层包裹：只有一个目录且它看起来像主题
  if (dirs.length === 1 && files.length === 0) {
    const inner = join(extractDir, dirs[0].name)
    if (await isThemeDir(inner)) return inner
  }
  // 多层包裹：递归向下找第一个主题目录
  for (const d of dirs) {
    const found = await locateThemeRoot(join(extractDir, d.name))
    if (await isThemeDir(found)) return found
  }
  return extractDir
}

export interface InstallThemeResult {
  name: string
  path: string
}

/**
 * 从压缩包安装主题到站点 themes/ 目录。
 * 流程：解压到暂存目录 → 定位主题根 → 规整名称 → 移入 themes/ → 清理暂存。
 */
export async function installThemeFromArchive(
  siteDir: string,
  archivePath: string,
  onLog?: (line: string) => void
): Promise<InstallThemeResult> {
  const log = (m: string): void => onLog?.(m)

  const stat = await fs.stat(archivePath).catch(() => null)
  if (!stat?.isFile()) throw new Error(`压缩包不存在：${archivePath}`)
  if (!isArchive(archivePath)) throw new Error('仅支持 .zip / .tar / .tar.gz / .tgz 格式的主题压缩包')

  const staging = join(siteDir, '.hexodeck-theme-staging')
  await fs.rm(staging, { recursive: true, force: true })
  await fs.mkdir(staging, { recursive: true })
  log(`解压主题包：${basename(archivePath)}`)

  try {
    // tar 模块同时支持 zip 与 tar 系列；strip 为 0 以便随后定位真实主题根
    await tar.x({ file: archivePath, cwd: staging })

    const themeRoot = await locateThemeRoot(staging)
    if (!(await isThemeDir(themeRoot))) {
      throw new Error('压缩包中未找到主题结构（缺少 _config.yml 或 layout 目录）')
    }

    const name = themeNameFromArchive(archivePath)
    const themesDir = join(siteDir, 'themes')
    await fs.mkdir(themesDir, { recursive: true })
    const target = join(themesDir, name)
    if (existsSync(target)) {
      throw new Error(`目标目录已存在：themes/${name}。请先删除旧主题或重命名压缩包。`)
    }

    // rename 在同盘瞬时完成；跨盘（暂存与站点不同卷）回退为复制
    try {
      await fs.rename(themeRoot, target)
    } catch {
      await fs.cp(themeRoot, target, { recursive: true })
    }
    log(`✓ 主题已安装到 themes/${name}`)
    return { name, path: target }
  } finally {
    await fs.rm(staging, { recursive: true, force: true }).catch(() => undefined)
  }
}

/** 主题配置根目录（供调用方参考，保持与 site-config-service 一致） */
export function themeDirOf(siteDir: string, name: string): string {
  return join(dirname(join(siteDir, 'themes', name)), name)
}
