/**
 * 主题压缩包安装的边界测试（临时站点 + 构造的压缩包，不触碰真实站点）
 * 用法: npx tsx scripts/smoke-theme-archive.ts
 */
import { promises as fs } from 'fs'
import { join, resolve } from 'path'
import * as tar from 'tar'
import { createSite } from '../src/main/services/site-service'
import { installThemeFromArchive, isArchive } from '../src/main/services/theme-archive-service'

let failed = 0
function check(name: string, cond: boolean, extra = ''): void {
  console.log(`${cond ? '✓' : '✗ FAIL'} ${name}${extra ? ` —— ${extra}` : ''}`)
  if (!cond) failed++
}

/** 构造一个主题源码目录 */
async function makeThemeSource(root: string, themeName: string, wrap: boolean): Promise<string> {
  const base = wrap ? join(root, themeName) : root
  await fs.mkdir(join(base, 'layout'), { recursive: true })
  await fs.writeFile(join(base, '_config.yml'), `# ${themeName}\nmenu:\n  home: /\n`, 'utf8')
  await fs.writeFile(join(base, 'layout', 'index.ejs'), '<html></html>', 'utf8')
  return base
}

async function tgzDir(parentOfTheme: string, themeName: string, outFile: string): Promise<void> {
  await tar.c({ gzip: true, file: outFile, cwd: parentOfTheme }, [themeName])
}

/** 用 PowerShell 的 Compress-Archive 生成真正的 zip（tar 无法产出 zip） */
async function realZip(sourceDir: string, outFile: string): Promise<void> {
  const { execFile } = await import('child_process')
  const { promisify } = await import('util')
  const run = promisify(execFile)
  await run('powershell', [
    '-NoProfile',
    '-Command',
    `Compress-Archive -Path '${join(sourceDir, '*')}' -DestinationPath '${outFile}' -Force`
  ])
}

async function main(): Promise<void> {
  const work = resolve('.tmp/theme-archive-test')
  await fs.rm(work, { recursive: true, force: true })
  const site = await createSite('theme-test', work)
  const packs = join(work, 'packs')
  await fs.mkdir(packs, { recursive: true })

  // 1. 格式判定
  check('识别 .zip', isArchive('a.zip') && isArchive('A.ZIP'))
  check('识别 tar 系列', isArchive('a.tar') && isArchive('a.tar.gz') && isArchive('a.tgz'))
  check('拒绝非压缩包', !isArchive('a.rar') && !isArchive('theme'))

  // 2. 四种格式逐一安装（zip 用真实 zip，其余用 tar 系列）
  //    真实事故：tar 模块不认 zip（TAR_BAD_ARCHIVE），必须分流解析
  const formats: Array<{ ext: string; name: string; make: (src: string, out: string) => Promise<void> }> = [
    { ext: '.zip', name: 'via-zip', make: realZip },
    { ext: '.tar', name: 'via-tar', make: (s, o) => tar.c({ gzip: false, file: o, cwd: s }, ['.']) },
    { ext: '.tar.gz', name: 'via-targz', make: (s, o) => tar.c({ gzip: true, file: o, cwd: s }, ['.']) },
    { ext: '.tgz', name: 'via-tgz', make: (s, o) => tar.c({ gzip: true, file: o, cwd: s }, ['.']) }
  ]

  for (const f of formats) {
    const src = join(work, `src-${f.name}`)
    await makeThemeSource(src, 'ignored', false)
    const pack = join(packs, `hexo-theme-${f.name}${f.ext}`)
    await f.make(src, pack)
    try {
      const r = await installThemeFromArchive(site, pack)
      check(
        `${f.ext} 格式安装成功`,
        r.name === f.name &&
          (await fs.stat(join(site, 'themes', f.name, '_config.yml')).then(() => true).catch(() => false))
      )
    } catch (e) {
      check(`${f.ext} 格式安装成功`, false, (e as Error).message.slice(0, 50))
    }
  }

  // 3. 单层包裹（压缩包内是 主题名/主题名）
  const src2 = join(work, 'src2')
  await makeThemeSource(src2, 'wrapcase', true)
  const tgz2 = join(packs, 'my-custom-theme.tgz')
  await tgzDir(src2, 'wrapcase', tgz2)
  const r2 = await installThemeFromArchive(site, tgz2)
  check('单层包裹自动规整', r2.name === 'my-custom-theme', `安装为 ${r2.name}`)
  check(
    '规整后目录无重复嵌套',
    (await fs.stat(join(site, 'themes', 'my-custom-theme', '_config.yml')).catch(() => null)) !== null
  )

  // 4. 重复安装同名主题应被拒绝且不破坏已有主题
  let dupErr = ''
  try {
    await installThemeFromArchive(site, join(packs, 'hexo-theme-via-zip.zip'))
  } catch (e) {
    dupErr = (e as Error).message
  }
  check('重复安装被拒绝并给出提示', dupErr.includes('已存在'), dupErr.slice(0, 40))

  // 5. 非主题压缩包应被拒绝
  const junk = join(work, 'junk')
  await fs.mkdir(junk, { recursive: true })
  await fs.writeFile(join(junk, 'readme.txt'), 'no theme here', 'utf8')
  const zip3 = join(packs, 'not-a-theme.zip')
  await realZip(junk, zip3)
  let junkErr = ''
  try {
    await installThemeFromArchive(site, zip3)
  } catch (e) {
    junkErr = (e as Error).message
  }
  check('非主题压缩包被拒绝', junkErr.includes('未找到主题结构'), junkErr.slice(0, 40))

  // 6. 暂存目录已清理
  check(
    '暂存目录已清理',
    !(await fs.stat(join(site, '.hexodeck-theme-staging')).catch(() => null))
  )

  await fs.rm(work, { recursive: true, force: true })
  console.log(failed === 0 ? '\n全部通过 ✅' : `\n${failed} 项失败 ❌`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('测试异常:', e)
  process.exit(1)
})
