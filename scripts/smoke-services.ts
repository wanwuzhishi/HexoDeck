/**
 * M1 服务层验收脚本（不启动 Electron 界面，直接调用主进程服务）
 * 对指定 Hexo 站点执行：读取 → 建草稿 → 保存 → 校验 → 删除 → 生成 → 预览 → 停止
 * 用法: npx tsx scripts/smoke-services.ts <siteDir>
 */
import { promises as fs } from 'fs'
import { join, resolve } from 'path'
import { createSite, openSite } from '../src/main/services/site-service'
import {
  createPost,
  deletePost,
  listPosts,
  readPost,
  savePost,
  searchPosts
} from '../src/main/services/post-service'
import { saveImage } from '../src/main/services/asset-service'
import {
  listPlugins,
  listThemes,
  readSiteConfig,
  readThemeConfig,
  saveBaseConfig,
  saveDeployConfig,
  saveThemeConfig,
  switchTheme
} from '../src/main/services/site-config-service'
import {
  findFreePort,
  runHexoBuild,
  startHexoServer,
  type ChildBase
} from '../src/main/services/hexo-process-service'

const siteDir = process.argv[2]
if (!siteDir) {
  console.error('用法: npx tsx scripts/smoke-services.ts <Hexo 站点目录>')
  process.exit(1)
}
const childBase: ChildBase = { childScript: resolve('resources/child/hexo-child.js') }

let failed = 0
function check(name: string, cond: boolean, extra = ''): void {
  console.log(`${cond ? '✓' : '✗ FAIL'} ${name}${extra ? ` —— ${extra}` : ''}`)
  if (!cond) failed++
}

async function main(): Promise<void> {
  // 1. 打开站点
  const info = await openSite(siteDir)
  check('打开站点', true, `${info.name}｜${info.postCount} 篇文章｜${info.draftCount} 篇草稿`)

  // 2. 文章列表
  const posts = await listPosts(siteDir)
  check('文章列表非空', posts.length > 0, `共 ${posts.length} 篇，最新：${posts[0]?.title}`)

  // 3. 创建草稿
  const title = `HexoDeck冒烟测试-${Date.now()}`
  const created = await createPost(siteDir, 'draft', title)
  check('创建草稿', created.kind === 'draft', created.id)

  // 4. 保存内容与标签
  await savePost(siteDir, created.id, {
    content: '## 冒烟测试\n\nHello from HexoDeck!',
    tags: ['hexodeck-test']
  })
  const saved = await readPost(siteDir, created.id)
  check('保存后正文正确', saved.content.includes('Hello from HexoDeck!'))
  check('保存后标签正确', saved.tags.includes('hexodeck-test'))
  const rawOnDisk = await fs.readFile(join(siteDir, 'source', '_drafts', `${created.id.split('/')[1]}`), 'utf8')
  check('磁盘文件 front-matter 完整', rawOnDisk.includes('title:') && rawOnDisk.includes('hexodeck-test'))

  // 5. 列表可见
  const list2 = await listPosts(siteDir)
  check('列表包含新草稿', list2.some((p) => p.id === created.id))

  // 6. 删除草稿（测试回退路径：无回收站时直接删除）
  await deletePost(siteDir, created.id, async () => {
    throw new Error('测试环境无回收站')
  })
  const list3 = await listPosts(siteDir)
  check('删除后列表不含草稿', !list3.some((p) => p.id === created.id))

  // 6.5 图片保存（1x1 透明 PNG），校验后清理
  const png1x1 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  const imgUrl = await saveImage(siteDir, '冒烟 测试.png', png1x1)
  check('图片保存返回站点路径', /^\/images\/.+\.png$/.test(imgUrl), imgUrl)
  const imgPath = join(siteDir, 'source', imgUrl)
  const imgStat = await fs.stat(imgPath).catch(() => null)
  check('图片已写入 source/images', !!imgStat && imgStat.size > 0)
  if (imgStat) await fs.rm(imgPath)

  // 6.6 全文搜索（正文命中 + 摘录）
  const hits = await searchPosts(siteDir, 'Welcome to')
  check(
    '全文搜索正文命中 Hello World',
    hits.some((h) => h.id.includes('hello-world') && h.snippet?.includes('Welcome')),
    `${hits.length} 个命中`
  )

  // 9. 站点配置 / 主题 / 插件服务（在临时站点验证，不触碰真实站点配置）
  const tmpParent = resolve('.tmp/smoke-sites')
  const tmpSite = await createSite('config-test', tmpParent)
  const cfg1 = await readSiteConfig(tmpSite)
  check('读取配置 title', cfg1.title === 'config-test', cfg1.title)
  const cfgPath = join(tmpSite, '_config.yml')
  const beforeText = await fs.readFile(cfgPath, 'utf8')
  const commentsBefore = beforeText.split('\n').filter((l) => l.trim().startsWith('#')).length
  await saveBaseConfig(tmpSite, { subtitle: '副标题"测试"', perPage: 15, postAssetFolder: true })
  const cfg2 = await readSiteConfig(tmpSite)
  check(
    '基础配置写入回读',
    cfg2.subtitle === '副标题"测试"' && cfg2.perPage === 15 && cfg2.postAssetFolder === true
  )
  const afterText = await fs.readFile(cfgPath, 'utf8')
  const commentsAfter = afterText.split('\n').filter((l) => l.trim().startsWith('#')).length
  check('配置注释与结构保留', commentsAfter >= commentsBefore, `${commentsBefore} → ${commentsAfter} 行注释`)

  await saveDeployConfig(tmpSite, {
    type: 'git',
    repo: 'https://github.com/t/t.git',
    branch: 'main'
  })
  const cfg3 = await readSiteConfig(tmpSite)
  check(
    '部署配置写入',
    cfg3.deploy.type === 'git' && cfg3.deploy.repo === 'https://github.com/t/t.git' && cfg3.deploy.branch === 'main'
  )
  await saveDeployConfig(tmpSite, { type: 'git', repo: 'https://github.com/t/t2.git', branch: 'main' })
  const afterDeploy = await fs.readFile(cfgPath, 'utf8')
  check('部署块重复保存不重复追加', (afterDeploy.match(/repo:/g) ?? []).length === 1)
  const cfg4 = await readSiteConfig(tmpSite)
  check('部署块替换值', cfg4.deploy.repo === 'https://github.com/t/t2.git')

  const th = await listThemes(tmpSite)
  check('主题检测（npm 来源）', th.some((t) => t.name === 'landscape' && t.source === 'npm'))

  // CRLF 回归测试：Windows 上 _config.yml 多为 CRLF，若读取时未剥离 \r，
  // 已有键会被误判为不存在而追加重复键（真实事故：YAML duplicated mapping key）
  const crlfPath = join(tmpSite, '_config.yml')
  const crlfText = (await fs.readFile(crlfPath, 'utf8')).replace(/\r?\n/g, '\r\n')
  await fs.writeFile(crlfPath, crlfText, 'utf8')
  await switchTheme(tmpSite, 'crlf-test-theme')
  const crlfAfter = await fs.readFile(crlfPath, 'utf8')
  const themeKeyCount = (crlfAfter.match(/^theme:/gm) ?? []).length
  check('CRLF 文件不产生重复键', themeKeyCount === 1, `theme 键出现 ${themeKeyCount} 次`)
  check('CRLF 文件主题正确写入', (await readSiteConfig(tmpSite)).theme === 'crlf-test-theme')
  check('CRLF 行尾风格保留', crlfAfter.includes('\r\n'))

  // 历史坏文件自愈：手工注入重复键后保存应被清理
  const dupText = crlfAfter.replace(/\r\n/g, '\r\n') + 'theme: stray-duplicate\r\n'
  await fs.writeFile(crlfPath, dupText, 'utf8')
  await saveBaseConfig(tmpSite, { subtitle: '去重复键测试' })
  const healed = await fs.readFile(crlfPath, 'utf8')
  check('已有重复键被自动清理', (healed.match(/^theme:/gm) ?? []).length === 1)
  check('清理后 YAML 可正常解析', await readSiteConfig(tmpSite).then(() => true).catch(() => false))

  await switchTheme(tmpSite, 'butterfly')
  const cfg5 = await readSiteConfig(tmpSite)
  check('主题切换写入', cfg5.theme === 'butterfly')

  const tcfg = await readThemeConfig(tmpSite)
  check('主题覆盖配置创建', tcfg.created && tcfg.path.includes('_config.butterfly.yml'))
  await saveThemeConfig(tmpSite, 'theme_config:\n  index: 1\n')
  const tcfg2 = await readThemeConfig(tmpSite)
  check('主题配置保存回读', tcfg2.content.includes('index: 1'))

  const pl = await listPlugins(tmpSite)
  check('插件识别', pl.some((p) => p.name === 'hexo-renderer-marked'))
  await fs.rm(tmpParent, { recursive: true, force: true })

  // 7. 生成静态页面（增量构建：无变更时输出 0 个文件，属正常）
  const publicIndex = join(siteDir, 'public', 'index.html')
  const gen = await runHexoBuild(childBase, siteDir, 'generate', (l) => process.stdout.write(`  │ ${l}\n`))
  check('hexo generate 成功', gen.ok, `${(gen.durationMs / 1000).toFixed(1)}s`)
  check('public/index.html 存在', !!(await fs.stat(publicIndex).catch(() => null)))

  // 8. 预览服务
  const port = await findFreePort(4300)
  const lines: string[] = []
  const session = await startHexoServer(
    childBase,
    siteDir,
    port,
    true,
    (l) => lines.push(l),
    () => undefined
  )
  const resp = await fetch(`http://127.0.0.1:${session.port}/`)
  const html = await resp.text()
  check('预览 HTTP 200', resp.status === 200, `port ${session.port}`)
  check('预览输出包含站点标题', html.includes(info.title))
  await session.stop()
  await new Promise((r) => setTimeout(r, 500))
  let stopped = true
  try {
    await fetch(`http://127.0.0.1:${session.port}/`, { signal: AbortSignal.timeout(1500) })
    stopped = false
  } catch {
    stopped = true
  }
  check('预览服务已停止', stopped)

  console.log(failed === 0 ? '\n全部通过 ✅' : `\n${failed} 项失败 ❌`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('验收脚本异常:', e)
  process.exit(1)
})
