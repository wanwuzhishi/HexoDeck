/**
 * 统计服务计算正确性测试（临时站点 + 构造文章，验证各项指标）
 * 用法: npx tsx scripts/smoke-stats.ts
 */
import { promises as fs } from 'fs'
import { join, resolve } from 'path'
import { collectStats } from '../src/main/services/stats-service'

let failed = 0
function check(name: string, cond: boolean, extra = ''): void {
  console.log(`${cond ? '✓' : '✗ FAIL'} ${name}${extra ? ` —— ${extra}` : ''}`)
  if (!cond) failed++
}

async function writePost(dir: string, file: string, fm: string, body: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(join(dir, file), `---\n${fm}\n---\n${body}\n`, 'utf8')
}

async function main(): Promise<void> {
  const site = resolve('.tmp/stats-test-site')
  await fs.rm(site, { recursive: true, force: true })
  const posts = join(site, 'source', '_posts')
  const drafts = join(site, 'source', '_drafts')
  await fs.writeFile(join(site, '_config.yml'), 'title: stats-test\n', 'utf8').catch(async () => {
    await fs.mkdir(site, { recursive: true })
    await fs.writeFile(join(site, '_config.yml'), 'title: stats-test\n', 'utf8')
  })

  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')

  // 三篇正式文章（含中英文混合、标签、分类、跨年份）
  await writePost(
    posts,
    'a.md',
    `title: 中文文章一\ndate: ${y}-${m}-05 10:00:00\ntags: [hexo, 教程]\ncategories: [技术]`,
    '你好世界 hello world' // 中文 4 + latin 2 = 6
  )
  await writePost(
    posts,
    'b.md',
    `title: 中文文章二\ndate: ${y}-${m}-05 11:00:00\ntags: [hexo]\ncategories: [技术, 生活]`,
    '第二篇文章 test content here' // 中文 5 + latin 3 = 8
  )
  await writePost(
    posts,
    'c.md',
    `title: 去年文章\ndate: ${y - 1}-01-15 09:00:00\ntags: [随笔]`,
    '去年写的一篇' // 中文 6
  )
  // 一篇草稿（不应计入正式统计）
  await writePost(drafts, 'd.md', `title: 草稿一篇\ndate: ${y}-${m}-06 10:00:00`, '草稿内容')

  const s = await collectStats(site)

  check('文章数正确', s.postCount === 3, `实际 ${s.postCount}`)
  check('草稿数正确', s.draftCount === 1, `实际 ${s.draftCount}`)
  check('总字数正确（中英混合）', s.totalWords === 20, `实际 ${s.totalWords}（6+8+6）`)
  check('平均字数正确', s.avgWords === 7, `实际 ${s.avgWords}`)
  check('最长文章识别', s.longest?.title === '中文文章二' && s.longest.words === 8)
  // 文章一与去年文章同为 6 字，降序排序下末位取到哪篇都算正确，只校验字数
  check('最短文章识别', s.shortest?.words === 6, `实际 ${s.shortest?.title} ${s.shortest?.words} 字`)

  check('标签数正确', s.tagCount === 3, `hexo/教程/随笔 实际 ${s.tagCount}`)
  check('分类数正确', s.categoryCount === 2, `技术/生活 实际 ${s.categoryCount}`)
  check('标签排行首位是 hexo', s.topTags[0]?.name === 'hexo' && s.topTags[0]?.count === 2)
  check('无标签文章计数', s.untagged === 0, `实际 ${s.untagged}`)
  check('无分类文章计数', s.uncategorized === 1, `去年文章无分类，实际 ${s.uncategorized}`)

  check('起始日期为去年', s.firstPostDate === `${y - 1}-01-15`, `实际 ${s.firstPostDate}`)
  check('活跃天数（同一天两篇算 1 天 + 去年 1 天）', s.activeDays === 2, `实际 ${s.activeDays}`)
  check('最忙一天为今天月份的 5 号（两篇）', s.busiestDay?.count === 2, JSON.stringify(s.busiestDay))
  check('年度分组含两年', s.byYear.length === 2, JSON.stringify(s.byYear.map((v) => v.year)))
  check('最近 12 个月趋势为 12 个点', s.byMonth.length === 12)
  check('本月新增计数', s.thisMonth === 2, `实际 ${s.thisMonth}`)
  check('本周新增（5 号可能不在本周）', s.thisWeek >= 0 && s.thisWeek <= 2, `实际 ${s.thisWeek}`)

  await fs.rm(site, { recursive: true, force: true })
  console.log(failed === 0 ? '\n全部通过 ✅' : `\n${failed} 项失败 ❌`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('测试异常:', e)
  process.exit(1)
})
