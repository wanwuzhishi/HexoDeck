import { promises as fs } from 'fs'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { load as loadYaml } from 'js-yaml'
import type { SiteInfo } from '@shared/ipc'
import { listPosts } from './post-service'
import { findSiteIcon } from './asset-service'
import { SCAFFOLD_BARE, SCAFFOLD_WITH_TAGS, formatDate } from './content'

export { formatDate } from './content'

/** 站点图标信息：绝对路径 + 供 <img> 使用的 file:// 地址（带 mtime 破缓存） */
async function readIcon(siteDir: string): Promise<{ iconPath?: string; iconUrl?: string }> {
  const iconPath = findSiteIcon(siteDir)
  if (!iconPath) return {}
  try {
    const stat = await fs.stat(iconPath)
    return { iconPath, iconUrl: `${pathToFileURL(iconPath).href}?v=${Math.floor(stat.mtimeMs)}` }
  } catch {
    return { iconPath }
  }
}

/** 校验并读取站点信息；不合法时抛错 */
export async function openSite(sitePath: string): Promise<SiteInfo> {
  const dir = sitePath.trim()
  const configPath = join(dir, '_config.yml')
  let stat
  try {
    stat = await fs.stat(configPath)
  } catch {
    throw new Error(`所选目录不是 Hexo 站点：未找到 _config.yml（${dir}）`)
  }
  if (!stat.isFile()) throw new Error('_config.yml 不是文件')

  let config: Record<string, unknown>
  try {
    config = loadYaml(await fs.readFile(configPath, 'utf8'), { json: true }) as Record<
      string,
      unknown
    >
  } catch (e) {
    throw new Error(`_config.yml 解析失败：${(e as Error).message}`)
  }

  const posts = await listPosts(dir)
  const title = String(config.title ?? '')
  return {
    path: dir,
    name: title || dir.split(/[\\/]/).filter(Boolean).pop() || dir,
    title,
    subtitle: String(config.subtitle ?? ''),
    postCount: posts.filter((p) => p.kind === 'post').length,
    draftCount: posts.filter((p) => p.kind === 'draft').length,
    ...(await readIcon(dir))
  }
}

const HELLO_WORLD = `---
title: Hello World
date: {{ date }}
tags:
---

欢迎使用 **HexoDeck**！这是你的第一篇文章。现在可以在编辑器中修改它，或新建自己的文章。
`

function configYaml(title: string): string {
  return `# Hexo Configuration
title: ${title}
subtitle: ''
description: ''
keywords:
author: HexoDeck
language: zh-CN
timezone: ''

# URL
url: http://example.com
permalink: :year/:month/:day/:title/
permalink_defaults:
pretty_urls:
  trailing_index: true
  trailing_html: true

# Directory
source_dir: source
public_dir: public
tag_dir: tags
archive_dir: archives
category_dir: categories
code_dir: downloads/code
i18n_dir: :lang
skip_render:

# Writing
new_post_name: :title.md
default_layout: post
titlecase: false
external_link:
  enable: true
  field: site
  exclude: ''
filename_case: 0
render_drafts: false
post_asset_folder: false
relative_link: false
future: true
syntax_highlighter: highlight.js
highlight:
  line_number: true
  auto_detect: false
  tab_replace: ''
  wrap: true
  hljs: false
prismjs:
  preprocess: true
  line_number: true
  tab_replace: ''

# Home page setting
index_generator:
  path: ''
  per_page: 10
  order_by: -date

# Category & Tag
default_category: uncategorized
category_map:
tag_map:

# Metadata elements
meta_generator: true

# Date / Time format
date_format: YYYY-MM-DD
time_format: HH:mm:ss
updated_option: 'mtime'

# Pagination
per_page: 10
pagination_dir: page

# Include / Exclude file(s)
include:
exclude:
ignore:

# Extensions
theme: landscape

# Deployment
deploy:
  type: ''
`
}

function sitePackageJson(name: string): string {
  return `${JSON.stringify(
    {
      name,
      version: '1.0.0',
      private: true,
      scripts: {
        build: 'hexo generate',
        clean: 'hexo clean',
        deploy: 'hexo deploy',
        server: 'hexo server'
      },
      hexo: { version: '8.1.2' },
      dependencies: {
        hexo: '^8.0.0',
        'hexo-renderer-ejs': '^2.0.0',
        'hexo-renderer-marked': '^6.0.0',
        'hexo-renderer-stylus': '^3.0.0',
        'hexo-server': '^3.0.0',
        'hexo-theme-landscape': '^1.0.0'
      }
    },
    null,
    2
  )}\n`
}

export async function createSite(name: string, parentDir: string): Promise<string> {
  const dir = join(parentDir, name)
  try {
    await fs.access(dir)
    throw new Error(`目录已存在：${dir}`)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
  }

  const now = formatDate(new Date())
  await fs.mkdir(join(dir, 'source', '_posts'), { recursive: true })
  await fs.mkdir(join(dir, 'scaffolds'), { recursive: true })
  await fs.mkdir(join(dir, 'themes'), { recursive: true })
  await fs.writeFile(join(dir, '_config.yml'), configYaml(name), 'utf8')
  await fs.writeFile(join(dir, 'package.json'), sitePackageJson(name), 'utf8')
  await fs.writeFile(join(dir, 'scaffolds', 'post.md'), SCAFFOLD_WITH_TAGS, 'utf8')
  await fs.writeFile(join(dir, 'scaffolds', 'draft.md'), SCAFFOLD_WITH_TAGS, 'utf8')
  await fs.writeFile(join(dir, 'scaffolds', 'page.md'), SCAFFOLD_BARE, 'utf8')
  await fs.writeFile(
    join(dir, 'source', '_posts', 'hello-world.md'),
    HELLO_WORLD.replace('{{ date }}', now),
    'utf8'
  )
  return dir
}
