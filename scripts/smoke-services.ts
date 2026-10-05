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
import { clearSiteIcon, findSiteIcon, saveImage, saveSiteIcon } from '../src/main/services/asset-service'
import {
  createCollectionPost,
  deleteCollectionPost,
  listCollectionPosts,
  readCollectionPost,
  saveCollectionPost
} from '../src/main/services/collection-service'
import type { CollectionDef } from '../src/shared/ipc'
import {
  createPage,
  deletePage,
  listPages,
  readPage,
  savePage
} from '../src/main/services/page-service'
import {
  defaultThemeConfigPath,
  listPlugins,
  listThemes,
  readSiteConfig,
  readThemeConfig,
  saveBaseConfig,
  saveDeployConfig,
  saveThemeConfig,
  switchTheme,
  validateDeployConfig
} from '../src/main/services/site-config-service'
import {
  findFreePort,
  runHexoBuild,
  startHexoServer,
  detectDeployFailure,
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

  // 6.55 全文搜索（正文命中 + 摘录）：搜刚创建的草稿正文，不依赖真实站点文章内容
  const hits = await searchPosts(siteDir, 'Hello from HexoDeck')
  check(
    '全文搜索正文命中冒烟草稿',
    hits.some((h) => h.id === created.id && h.snippet?.includes('Hello')),
    `${hits.length} 个命中`
  )

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

  // 主题配置：路径由调用方显式给定（界面层由用户指定并记忆，不再自动定位）
  const themeCfgPath = defaultThemeConfigPath(tmpSite, 'butterfly')
  check('主题配置默认路径指向覆盖文件', themeCfgPath.includes('_config.butterfly.yml'), themeCfgPath)
  const tcfg = await readThemeConfig(themeCfgPath)
  check('主题覆盖配置创建', tcfg.created)
  await saveThemeConfig(themeCfgPath, 'theme_config:\n  index: 1\n')
  const tcfg2 = await readThemeConfig(themeCfgPath)
  check('主题配置保存回读', tcfg2.content.includes('index: 1'))
  check('保存后 created 归位为 false', !tcfg2.created)

  const pl = await listPlugins(tmpSite)
  check('插件识别', pl.some((p) => p.name === 'hexo-renderer-marked'))
  // 10. 自定义 front-matter 字段（文章参数侧栏）
  const cf = await createPost(tmpSite, 'post', '自定义字段测试')
  await savePost(tmpSite, cf.id, { extra: { permalink: 'my-link', cover: 'a.jpg', sticky: '10' } })
  const cfRead = await readPost(tmpSite, cf.id)
  check(
    '自定义字段写入并回读',
    cfRead.frontMatter.permalink === 'my-link' &&
      cfRead.frontMatter.cover === 'a.jpg' &&
      cfRead.frontMatter.sticky === '10',
    JSON.stringify(cfRead.frontMatter)
  )
  // 传 null 表示删除该键
  await savePost(tmpSite, cf.id, { extra: { permalink: null, cover: null, sticky: null } })
  const cfClean = await readPost(tmpSite, cf.id)
  check(
    '自定义字段可删除',
    !('permalink' in cfClean.frontMatter) && !('cover' in cfClean.frontMatter),
    JSON.stringify(cfClean.frontMatter)
  )
  // 内置字段不应被 extra 覆盖
  await savePost(tmpSite, cf.id, { extra: { title: 'HACKED', date: 'HACKED' } })
  const cfGuard = await readPost(tmpSite, cf.id)
  check('内置字段不被自定义参数覆盖', cfGuard.title === '自定义字段测试', cfGuard.title)

  // 开关式参数落为 YAML 布尔（模板里字符串 'false' 是真值，必须是布尔才正确）
  await savePost(tmpSite, cf.id, { extra: { comments: true, sticky: false } })
  const cfBool = await readPost(tmpSite, cf.id)
  check(
    '布尔参数写入为 YAML 布尔',
    cfBool.frontMatter.comments === true && cfBool.frontMatter.sticky === false,
    JSON.stringify(cfBool.frontMatter)
  )
  await deletePost(tmpSite, cf.id, async () => { throw new Error('no trash') })

  // 10.5 页面（source/ 下非文章目录的 markdown）
  const page = await createPage(tmpSite, {
    title: '关于',
    path: 'about/index',
    frontMatterYaml: 'layout: page\ncomments: false\n'
  })
  check('页面创建到子目录', page.id === 'about/index.md', page.id)
  const pageDetail = await readPage(tmpSite, 'about/index.md')
  check(
    '页面初始参数写入',
    pageDetail.frontMatter.layout === 'page' && pageDetail.frontMatter.comments === false,
    JSON.stringify(pageDetail.frontMatter)
  )
  check('页面内置 title 生效', pageDetail.title === '关于', pageDetail.title)

  // 新建页面逻辑：路径即文件夹，contact → source/contact/index.md
  const flat = await createPage(tmpSite, { title: '留言板', path: 'contact' })
  check('路径即文件夹（contact → contact/index.md）', flat.id === 'contact/index.md', flat.id)
  check(
    '同名文件夹内为 index.md',
    !!(await fs.stat(join(tmpSite, 'source', 'contact', 'index.md')).catch(() => null))
  )

  // 标题与参数重合：自动去重（表单标题优先，参数里的 date 沿用），不提示
  const dedup = await createPage(tmpSite, {
    title: '关于2',
    path: 'about2',
    frontMatterYaml: 'title: YAML标题\ndate: 2020-01-01\nlayout: page\n'
  })
  const dedupDetail = await readPage(tmpSite, dedup.id)
  check('标题与参数重合自动去重（表单优先）', dedupDetail.title === '关于2', dedupDetail.title)
  check(
    '参数中的 date 沿用（不被自动日期覆盖）',
    String(dedupDetail.frontMatter.date).includes('2020-01-01'),
    String(dedupDetail.frontMatter.date)
  )
  check('去重不影响其余参数', dedupDetail.frontMatter.layout === 'page')

  await savePage(tmpSite, page.id, {
    content: '# 关于本站\n\n这里是 HexoDeck 冒烟测试页面。',
    extra: { permalink: 'about-me', comments: null }
  })
  const pageAgain = await readPage(tmpSite, page.id)
  check('页面正文与参数保存', pageAgain.content.includes('关于本站'))
  check('页面参数新增并回读', pageAgain.frontMatter.permalink === 'about-me')
  check('页面参数传 null 可删除', !('comments' in pageAgain.frontMatter))

  const pageList = await listPages(tmpSite)
  check('页面列表含新建页面', pageList.some((p) => p.id === 'about/index.md'))
  check(
    '页面列表排除文章目录',
    !pageList.some((p) => p.id.startsWith('_posts/') || p.id.startsWith('_drafts/')),
    pageList.map((p) => p.id).join(', ')
  )

  // 路径穿越必须被拦住，否则能读写到站点之外
  check(
    '页面路径穿越被拒绝',
    await readPage(tmpSite, '../_config.yml').then(() => false).catch(() => true)
  )
  check(
    '非 md 页面被拒绝',
    await readPage(tmpSite, 'about/index.html').then(() => false).catch(() => true)
  )
  check(
    '重复页面被拒绝',
    await createPage(tmpSite, { title: '关于2', path: 'about/index' })
      .then(() => false)
      .catch(() => true)
  )
  // 新建时的 YAML 语法错误应直接报错，不落盘
  check(
    '页面参数 YAML 错误被拒绝',
    await createPage(tmpSite, { title: '坏页面', path: 'bad', frontMatterYaml: '{ 未闭合' })
      .then(() => false)
      .catch(() => true)
  )

  await deletePage(tmpSite, page.id, async () => { throw new Error('no trash') })
  check('页面删除后从列表消失', !(await listPages(tmpSite)).some((p) => p.id === page.id))

  // 10.6 站点图标（写入 source/，随站点走）
  const icoBase64 = Buffer.from('fake-ico-bytes').toString('base64')
  const iconPath = await saveSiteIcon(tmpSite, 'my-icon.ico', icoBase64)
  check('站点图标写入 source/favicon.ico', iconPath === join(tmpSite, 'source', 'favicon.ico'), iconPath)
  check('站点图标可被识别', findSiteIcon(tmpSite) === iconPath)
  const infoWithIcon = await openSite(tmpSite)
  check('站点信息带图标地址', !!infoWithIcon.iconUrl && !!infoWithIcon.iconPath)

  // 换格式时旧变体应被清理，避免同时存在多个 favicon
  await saveSiteIcon(tmpSite, 'logo.png', icoBase64)
  check('换格式后旧图标被清理', !(await fs.stat(iconPath).catch(() => null)))
  check('新图标已就位', findSiteIcon(tmpSite) === join(tmpSite, 'source', 'favicon.png'))

  await clearSiteIcon(tmpSite)
  check('图标可清除', findSiteIcon(tmpSite) === null)
  check('无图标时站点信息不含图标', !(await openSite(tmpSite)).iconUrl)

  check(
    '非图片格式图标被拒绝',
    await saveSiteIcon(tmpSite, 'evil.exe', icoBase64).then(() => false).catch(() => true)
  )

  await fs.rm(tmpParent, { recursive: true, force: true })

  // 10.65 自定义文集（站点根目录内的文章目录）
  const coll: CollectionDef = { id: 'coll-test', name: '学习笔记', icon: '📚', dir: 'source/notes' }
  const cp = await createCollectionPost(tmpSite, coll, '学习笔记一')
  check('文集文章创建于文集目录', cp.id === '学习笔记一.md', cp.id)
  check(
    '文集文件真实落盘',
    !!(await fs.stat(join(tmpSite, 'source', 'notes', '学习笔记一.md')).catch(() => null))
  )
  const cpr = await readCollectionPost(tmpSite, coll, cp.id)
  check('文集文章标题日期', cpr.title === '学习笔记一' && !!cpr.date)
  await saveCollectionPost(tmpSite, coll, cp.id, { content: '# 笔记正文', extra: { mood: '好' } })
  const cpr2 = await readCollectionPost(tmpSite, coll, cp.id)
  check('文集文章保存回读', cpr2.content.includes('笔记正文') && cpr2.frontMatter.mood === '好')
  await saveCollectionPost(tmpSite, coll, cp.id, { extra: { mood: null } })
  check(
    '文集参数可删除',
    !('mood' in (await readCollectionPost(tmpSite, coll, cp.id)).frontMatter)
  )
  const clist = await listCollectionPosts(tmpSite, coll)
  check('文集列表仅含本目录', clist.some((p) => p.id === cp.id) && !clist.some((p) => p.id.includes('about')))
  await deleteCollectionPost(tmpSite, coll, cp.id, async () => {
    throw new Error('no trash')
  })
  check('文集文章删除', !(await listCollectionPosts(tmpSite, coll)).some((p) => p.id === cp.id))

  // 越界防护：文集目录必须位于站点根目录内，文章路径不允许穿越
  const badColl: CollectionDef = { id: 'c-bad', name: '坏文集', icon: '📚', dir: '..' }
  check(
    '文集目录越界被拒绝',
    await listCollectionPosts(tmpSite, badColl).then(() => false).catch(() => true)
  )
  check(
    '文集文章路径穿越被拒绝',
    await readCollectionPost(tmpSite, coll, '../_config.yml').then(() => false).catch(() => true)
  )
  check(
    '文集非 md 文件被拒绝',
    await readCollectionPost(tmpSite, coll, 'a.txt').then(() => false).catch(() => true)
  )

  // 10.7 部署失败识别与配置预检
  // hexo 的 deployer 用 spawn(stdio:'inherit') 调 git，push 失败不改变退出码，
  // 若不识别输出就会误报「部署完成」（真实事故：branch 为空时推送失败但提示成功）
  check(
    '空 branch 的非法 push 被识别',
    !!detectDeployFailure(
      'fatal: The current branch master has no upstream branch\nTo push the current branch'
    )
  )
  check(
    '仓库不存在被识别',
    !!detectDeployFailure("remote: Repository not found.\nfatal: repository 'https://x/y' not found")
  )
  check('认证失败被识别', !!detectDeployFailure('fatal: Authentication failed for https://x/y'))
  check('推送被拒绝被识别', !!detectDeployFailure('error: failed to push some refs to https://x/y'))
  check('插件缺失被识别', !!detectDeployFailure('ERROR Deployer not found: git'))
  check('正常输出不误报失败', !detectDeployFailure('INFO  Deploy done: git\nINFO  Files loaded'))

  const deployCfgSite = await createSite('deploy-check', tmpParent)
  // 空 branch：必须拦下并给出可操作提示
  await saveDeployConfig(deployCfgSite, {
    type: 'git',
    repo: 'https://github.com/u/u.github.io.git',
    branch: ''
  })
  const emptyBranchIssue = await validateDeployConfig(deployCfgSite)
  check('部署预检拦截空 branch', !!emptyBranchIssue && /branch/.test(emptyBranchIssue), emptyBranchIssue)

  // 地址缺 .git 后缀：给出建议
  await saveDeployConfig(deployCfgSite, {
    type: 'git',
    repo: 'https://github.com/u/u.github.io',
    branch: 'main'
  })
  const noSuffixIssue = await validateDeployConfig(deployCfgSite)
  check('部署预检提示补 .git 后缀', !!noSuffixIssue && /\.git/.test(noSuffixIssue), noSuffixIssue)

  // GitHub Pages 主仓库名形如 <user>.github.io，含点号，不能被误判
  await saveDeployConfig(deployCfgSite, {
    type: 'git',
    repo: 'https://github.com/u/u.github.io.git',
    branch: 'main'
  })
  check('含点的 <user>.github.io 仓库名不误报', (await validateDeployConfig(deployCfgSite)) === undefined)

  // 配置完整时不应报问题
  await saveDeployConfig(deployCfgSite, {
    type: 'git',
    repo: 'https://github.com/u/u.github.io.git',
    branch: 'main'
  })
  check('部署配置完整时预检通过', (await validateDeployConfig(deployCfgSite)) === undefined)

  // 未配置部署方式
  await saveDeployConfig(deployCfgSite, { type: '', repo: '', branch: '' })
  check('未配置部署方式被预检拦截', !!(await validateDeployConfig(deployCfgSite)))
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
