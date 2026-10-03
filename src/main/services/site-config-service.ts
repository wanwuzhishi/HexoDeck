import { promises as fs } from 'fs'
import { existsSync } from 'fs'
import { join } from 'path'
import { load as loadYaml } from 'js-yaml'
import type { DeployConfig, PluginInfo, SiteConfigForm, ThemeConfigFile, ThemeInfo } from '@shared/ipc'

const CONFIG_FILE = '_config.yml'
const BACKUP_SUFFIX = '.hexodeck.bak'

function configPath(siteDir: string): string {
  return join(siteDir, CONFIG_FILE)
}

async function readText(siteDir: string): Promise<string> {
  return fs.readFile(configPath(siteDir), 'utf8')
}

/**
 * 读取并按行拆分配置，同时记录原始行尾风格。
 * 必须剥离行尾 \r：Windows 上的 _config.yml 多为 CRLF，
 * 若不剥离，`^key:` 这类以 $ 结尾的正则会因残留 \r 匹配失败，
 * 导致已有键被误判为不存在而追加重复键（YAML duplicated mapping key）。
 */
async function readLines(siteDir: string): Promise<{ lines: string[]; eol: string }> {
  const text = await readText(siteDir)
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.split(/\r?\n/)
  dedupeTopLevelKeys(lines)
  return { lines, eol }
}

/** 按原行尾风格写回 */
async function writeLines(siteDir: string, lines: string[], eol: string): Promise<void> {
  await fs.writeFile(configPath(siteDir), lines.join(eol), 'utf8')
}

/**
 * 保存前修复顶层重复键：保留每个键的首次出现，删除后续重复项及其紧邻的
 * 「# added by HexoDeck」标记（历史版本曾因 CRLF 未剥离而误追加重复键）。
 * 只处理列 0 的键，不影响嵌套结构。
 */
function dedupeTopLevelKeys(lines: string[]): void {
  const seen = new Set<string>()
  for (let i = 0; i < lines.length; i++) {
    const m = /^([A-Za-z_][\w-]*):/.exec(lines[i])
    if (!m) continue
    const key = m[1]
    if (!seen.has(key)) {
      seen.add(key)
      continue
    }
    // 删除该重复行；若上一行是 HexoDeck 追加标记则一并删除
    lines.splice(i, 1)
    if (lines[i - 1] === '# added by HexoDeck') lines.splice(i - 1, 1)
    i--
  }
}

/** 首次修改前备份原始 _config.yml（仅备份一次，保留用户可手动回退的副本） */
async function backupOnce(siteDir: string): Promise<void> {
  const bak = configPath(siteDir) + BACKUP_SUFFIX
  if (!existsSync(bak)) {
    await fs.copyFile(configPath(siteDir), bak)
  }
}

/** 标量值的 YAML 安全序列化：常规字符直接输出，特殊字符加双引号 */
function scalar(v: string | number | boolean): string {
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (v === '') return "''"
  if (/^[\w./:@^~+%=-]+$/.test(v)) return v
  return JSON.stringify(v)
}

/** 行级替换顶层标量键（只匹配列 0 的键，不碰嵌套缩进行，注释与顺序全保留）；键不存在时追加到文件尾 */
function setScalarLine(lines: string[], key: string, value: string): void {
  const re = new RegExp(`^(${key}:)(\\s+.*)?$`)
  const entry = `${key}: ${value}`
  const idx = lines.findIndex((l) => re.test(l))
  if (idx >= 0) {
    lines[idx] = entry
    // 清理历史遗留的重复键（曾因 CRLF 未剥离而被误追加，会导致 YAML duplicated mapping key）
    for (let i = lines.length - 1; i > idx; i--) {
      if (re.test(lines[i])) lines.splice(i, 1)
    }
  } else {
    // 去掉文件尾空行后追加，避免连续空行
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop()
    lines.push('', `# added by HexoDeck`, entry)
  }
}

function removeLine(lines: string[], key: string): void {
  const idx = lines.findIndex((l) => new RegExp(`^${key}:(\\s.*)?$`).test(l))
  if (idx >= 0) lines.splice(idx, 1)
}

/** 替换 deploy 块内的 type/repo/branch，保留块内其他键与注释 */
function setDeployBlock(lines: string[], d: DeployConfig): void {
  const idx = lines.findIndex((l) => /^deploy:\s*\S/.test(l) || /^deploy:\s*$/.test(l))
  if (idx === -1) {
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop()
    lines.push('', 'deploy:', `  type: ${scalar(d.type)}`, `  repo: ${scalar(d.repo)}`, `  branch: ${scalar(d.branch)}`)
    return
  }
  // 行内写法 deploy: {type: git} → 展开为块
  if (/^deploy:\s*\S/.test(lines[idx])) lines[idx] = 'deploy:'

  let end = idx + 1
  while (end < lines.length && (lines[end].trim() === '' || /^[ \t]/.test(lines[end]))) end++
  const block = lines.slice(idx + 1, end)
  const want: Array<[string, string]> = [
    ['type', d.type],
    ['repo', d.repo],
    ['branch', d.branch]
  ]
  for (const [k, v] of want) {
    const i = block.findIndex((l) => new RegExp(`^[ \\t]*${k}:`).test(l))
    if (i >= 0) block[i] = block[i].replace(new RegExp(`^([ \\t]*${k}:)\\s*.*$`), `$1 ${scalar(v)}`)
    else block.unshift(`  ${k}: ${scalar(v)}`)
  }
  lines.splice(idx + 1, end - (idx + 1), ...block)
}

function toForm(data: Record<string, unknown>): SiteConfigForm {
  const deployRaw = Array.isArray(data.deploy) ? data.deploy[0] : data.deploy
  const deploy = (deployRaw ?? {}) as Record<string, unknown>
  const perPage = data.per_page
  return {
    title: String(data.title ?? ''),
    subtitle: String(data.subtitle ?? ''),
    description: String(data.description ?? ''),
    author: String(data.author ?? ''),
    language: String(data.language ?? ''),
    timezone: String(data.timezone ?? ''),
    url: String(data.url ?? ''),
    root: String(data.root ?? '/'),
    permalink: String(data.permalink ?? ''),
    perPage: typeof perPage === 'number' ? perPage : null,
    postAssetFolder: data.post_asset_folder === true,
    theme: String(data.theme ?? ''),
    deploy: {
      type: String(deploy.type ?? ''),
      repo: String(deploy.repo ?? ''),
      branch: String(deploy.branch ?? '')
    }
  }
}

export async function readSiteConfig(siteDir: string): Promise<SiteConfigForm> {
  const data = (loadYaml(await readText(siteDir), { json: true }) ?? {}) as Record<string, unknown>
  return toForm(data)
}

/** 高级：读取 _config.yml 原文 */
export async function readRawConfig(siteDir: string): Promise<{ path: string; content: string }> {
  return { path: configPath(siteDir), content: await readText(siteDir) }
}

/** 高级：保存 _config.yml 原文（YAML 校验 + 备份） */
export async function saveRawConfig(siteDir: string, content: string): Promise<void> {
  try {
    loadYaml(content, { json: true })
  } catch (e) {
    throw new Error(`YAML 语法错误：${(e as Error).message.split('\n')[0]}`)
  }
  await backupOnce(siteDir)
  await fs.writeFile(configPath(siteDir), content, 'utf8')
}

export interface BasePatch {
  title?: string
  subtitle?: string
  description?: string
  author?: string
  language?: string
  timezone?: string
  url?: string
  root?: string
  permalink?: string
  perPage?: number | null
  postAssetFolder?: boolean
}

export async function saveBaseConfig(siteDir: string, patch: BasePatch): Promise<void> {
  await backupOnce(siteDir)
  const { lines, eol } = await readLines(siteDir)
  const strKeys = ['title', 'subtitle', 'description', 'author', 'language', 'timezone', 'url', 'root', 'permalink'] as const
  for (const k of strKeys) {
    const v = patch[k]
    if (v !== undefined) setScalarLine(lines, k, scalar(v))
  }
  if (patch.perPage !== undefined) {
    if (patch.perPage === null) removeLine(lines, 'per_page')
    else setScalarLine(lines, 'per_page', String(patch.perPage))
  }
  if (patch.postAssetFolder !== undefined) {
    setScalarLine(lines, 'post_asset_folder', String(patch.postAssetFolder))
  }
  await writeLines(siteDir, lines, eol)
}

export async function saveDeployConfig(siteDir: string, deploy: DeployConfig): Promise<void> {
  await backupOnce(siteDir)
  const { lines, eol } = await readLines(siteDir)
  setDeployBlock(lines, deploy)
  await writeLines(siteDir, lines, eol)
}

export async function switchTheme(siteDir: string, name: string): Promise<void> {
  await backupOnce(siteDir)
  const { lines, eol } = await readLines(siteDir)
  setScalarLine(lines, 'theme', scalar(name))
  await writeLines(siteDir, lines, eol)
}

/** 已安装主题：themes/ 目录 + node_modules 中的 hexo-theme-* */
export async function listThemes(siteDir: string): Promise<ThemeInfo[]> {
  const active = (await readSiteConfig(siteDir)).theme
  const found = new Map<string, ThemeInfo>()

  const themesDir = join(siteDir, 'themes')
  try {
    for (const name of await fs.readdir(themesDir)) {
      const dir = join(themesDir, name)
      const stat = await fs.stat(dir).catch(() => null)
      if (!stat?.isDirectory() || name.startsWith('.')) continue
      if (existsSync(join(dir, '_config.yml')) || existsSync(join(dir, 'layout'))) {
        found.set(name, { name, active: name === active, source: 'themes-dir' })
      }
    }
  } catch {
    // themes 目录不存在则忽略
  }

  try {
    const pkg = JSON.parse(await fs.readFile(join(siteDir, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    for (const name of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
      if (/^hexo-theme-/.test(name)) {
        const short = name.replace(/^hexo-theme-/, '')
        if (!found.has(short)) found.set(short, { name: short, active: short === active, source: 'npm' })
      }
    }
  } catch {
    // 无 package.json 则忽略
  }

  if (active && !found.has(active)) {
    found.set(active, { name: active, active: true, source: 'themes-dir' })
  }
  return [...found.values()].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name))
}

/** 主题配置文件：优先站点根的 _config.<theme>.yml 覆盖文件，其次主题自带 _config.yml */
function themeConfigPath(siteDir: string, theme: string): string {
  const alt = join(siteDir, `_config.${theme}.yml`)
  if (existsSync(alt)) return alt
  const inTheme = join(siteDir, 'themes', theme, '_config.yml')
  if (existsSync(inTheme)) return inTheme
  return alt // 不存在时约定新建覆盖文件
}

export async function readThemeConfig(siteDir: string): Promise<ThemeConfigFile> {
  const theme = (await readSiteConfig(siteDir)).theme
  if (!theme) throw new Error('未设置主题')
  const path = themeConfigPath(siteDir, theme)
  if (existsSync(path)) {
    return { path, content: await fs.readFile(path, 'utf8'), created: false }
  }
  return { path, content: '', created: true }
}

export async function saveThemeConfig(siteDir: string, content: string): Promise<ThemeConfigFile> {
  const theme = (await readSiteConfig(siteDir)).theme
  if (!theme) throw new Error('未设置主题')
  // 保存前校验 YAML 合法性，避免写坏主题配置
  try {
    loadYaml(content, { json: true })
  } catch (e) {
    throw new Error(`YAML 语法错误：${(e as Error).message.split('\n')[0]}`)
  }
  const path = themeConfigPath(siteDir, theme)
  await fs.writeFile(path, content, 'utf8')
  return { path, content, created: !existsSync(path) }
}

const KNOWN_PLUGINS: Record<string, { desc: string; key?: string }> = {
  'hexo-renderer-marked': { desc: 'Markdown 渲染器（默认）' },
  'hexo-renderer-ejs': { desc: 'EJS 模板渲染' },
  'hexo-renderer-stylus': { desc: 'Stylus 样式渲染' },
  'hexo-renderer-sass': { desc: 'Sass 样式渲染' },
  'hexo-renderer-kramed': { desc: 'Markdown 渲染器（kramed）' },
  'hexo-renderer-pandoc': { desc: 'Markdown 渲染器（pandoc）' },
  'hexo-server': { desc: '本地预览服务器' },
  'hexo-deployer-git': { desc: 'Git 一键部署', key: 'deploy' },
  'hexo-generator-index': { desc: '首页文章列表', key: 'index' },
  'hexo-generator-archive': { desc: '归档页', key: 'archive' },
  'hexo-generator-category': { desc: '分类页', key: 'category' },
  'hexo-generator-tag': { desc: '标签页', key: 'tag' },
  'hexo-generator-feed': { desc: 'RSS 订阅', key: 'feed' },
  'hexo-generator-sitemap': { desc: '站点地图', key: 'sitemap' },
  'hexo-generator-search': { desc: '本地搜索', key: 'search' },
  'hexo-generator-json-content': { desc: 'JSON 内容索引', key: 'jsonContent' },
  'hexo-abbrlink': { desc: '短永久链接', key: 'abbrlink' },
  'hexo-blog-encrypt': { desc: '文章加密', key: 'encrypt' },
  'hexo-wordcount': { desc: '字数统计（模板辅助，无配置键）' },
  'hexo-permalink-pinyin': { desc: '拼音永久链接', key: 'permalink_pinyin' },
  'hexo-related-popular-posts': { desc: '相关文章推荐', key: 'related_posts' },
  'hexo-filter-github-emojis': { desc: 'GitHub 表情', key: 'githubEmojis' }
}

export async function listPlugins(siteDir: string): Promise<PluginInfo[]> {
  const pkgPath = join(siteDir, 'package.json')
  const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8')) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  const merged = { ...pkg.dependencies, ...pkg.devDependencies }
  return Object.entries(merged)
    .filter(([name]) => name.startsWith('hexo-') && name !== 'hexo' && name !== 'hexo-cli')
    .map(([name, version]) => ({
      name,
      version: version.replace(/^[\^~]/, ''),
      description: KNOWN_PLUGINS[name]?.desc ?? 'Hexo 插件',
      configKey: KNOWN_PLUGINS[name]?.key ?? null
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
