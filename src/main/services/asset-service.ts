import { promises as fs } from 'fs'
import { join } from 'path'

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg|bmp|ico)$/i

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
