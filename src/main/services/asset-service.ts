import { promises as fs } from 'fs'
import { existsSync } from 'fs'
import { join } from 'path'

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg|bmp|ico)$/i
/** 站点图标支持的扩展名（favicon 常见格式） */
const ICON_EXT = /\.(ico|png|jpe?g|svg|webp|gif|bmp)$/i

/** 保存图片到站点 source/images，返回可直接用于 Markdown 的站点绝对路径 */
export async function saveImage(siteDir: string, fileName: string, base64: string): Promise<string> {
  const ext = IMAGE_EXT.test(fileName) ? (fileName.match(IMAGE_EXT) as RegExpMatchArray)[1].toLowerCase() : 'png'
  const base = fileName.replace(IMAGE_EXT, '').replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 40) || 'img'
  const name = `${base}-${Date.now()}.${ext === 'jpeg' ? 'jpg' : ext}`

  const dir = join(siteDir, 'source', 'images')
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(join(dir, name), Buffer.from(base64, 'base64'))
  return `/images/${name}`
}

/** 站点图标可能的存放位置（Hexo 约定：source 根目录下与主题同名的 favicon） */
const ICON_CANDIDATES = ['favicon.ico', 'favicon.png', 'favicon.svg', 'favicon.jpg', 'favicon.webp']

/** 查找站点已有图标，返回绝对路径（找不到返回 null） */
export function findSiteIcon(siteDir: string): string | null {
  for (const name of ICON_CANDIDATES) {
    const p = join(siteDir, 'source', name)
    if (existsSync(p)) return p
  }
  return null
}

/**
 * 写入站点图标：统一命名为 favicon.<ext> 放到 source/ 根目录，
 * 这样 Hexo 生成时网站真正会用上，图标随站点走。
 * 写入前清掉其他 favicon 变体，避免同时存在多个导致行为不确定。
 */
export async function saveSiteIcon(siteDir: string, fileName: string, base64: string): Promise<string> {
  if (!ICON_EXT.test(fileName)) {
    throw new Error('图标仅支持 .ico / .png / .jpg / .svg / .webp / .gif / .bmp 格式')
  }
  const rawExt = (fileName.match(ICON_EXT) as RegExpMatchArray)[1].toLowerCase()
  const ext = rawExt === 'jpeg' ? 'jpg' : rawExt

  const dir = join(siteDir, 'source')
  await fs.mkdir(dir, { recursive: true })
  await clearSiteIcon(siteDir)

  const target = join(dir, `favicon.${ext}`)
  await fs.writeFile(target, Buffer.from(base64, 'base64'))
  return target
}

/** 删除站点内的 favicon 文件（存在才删） */
export async function clearSiteIcon(siteDir: string): Promise<void> {
  for (const name of ICON_CANDIDATES) {
    await fs.rm(join(siteDir, 'source', name), { force: true })
  }
}
