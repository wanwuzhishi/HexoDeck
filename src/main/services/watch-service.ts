import { join } from 'path'
import { watch } from 'chokidar'

export interface SourceWatch {
  close: () => Promise<void>
}

/** 监听站点 source/_posts 与 _drafts 的增删改，去抖后通知渲染进程刷新列表 */
export function watchSource(siteDir: string, onChange: () => void): SourceWatch {
  let timer: NodeJS.Timeout | null = null
  const schedule = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(onChange, 300)
  }
  // chokidar 在 Windows 上需要正斜杠形式的路径
  const targets = [join(siteDir, 'source', '_posts'), join(siteDir, 'source', '_drafts')].map((p) =>
    p.replaceAll('\\', '/')
  )
  const watcher = watch(targets, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 }
  })
  watcher.on('add', schedule)
  watcher.on('change', schedule)
  watcher.on('unlink', schedule)
  return {
    close: () => watcher.close()
  }
}
