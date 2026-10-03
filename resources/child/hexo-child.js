/**
 * HexoDeck 子进程引导脚本：以 ELECTRON_RUN_AS_NODE 模式运行，承载 hexo 实例。
 * 用法: node hexo-child.js <siteDir> <mode> <port> <drafts>
 *   mode: server | generate | clean | deploy
 *   drafts: '1' 时服务端渲染草稿
 * 优先加载站点自带的 hexo（保证与用户环境一致），否则回退到应用内嵌引擎。
 */
const path = require('path')

const siteDir = process.argv[2]
const mode = process.argv[3] || 'generate'
const port = parseInt(process.argv[4], 10) || 4000
const drafts = process.argv[5] === '1'

const embedHexo = path.join(__dirname, '..', 'embed', 'node_modules', 'hexo')

let Hexo
try {
  Hexo = require(path.join(siteDir, 'node_modules', 'hexo'))
} catch {
  Hexo = require(embedHexo)
}

const options = { silent: false }
if (drafts) options.draft = true
const hexo = new Hexo(siteDir, options)

function send(msg) {
  if (process.send) process.send(msg)
}

async function main() {
  await hexo.init()

  if (mode === 'server') {
    const server = await hexo.call('server', { port, ip: '127.0.0.1' })
    send({ type: 'ready', port })
    process.on('message', async (m) => {
      if (m !== 'stop') return
      try {
        hexo.unwatch()
      } catch {}
      try {
        if (server) server.close()
      } catch {}
      try {
        await hexo.exit()
      } catch {}
      setTimeout(() => process.exit(0), 300)
    })
  } else {
    await hexo.call(mode, {})
    send({ type: 'done' })
    try {
      await hexo.exit()
    } catch {}
    process.exit(0)
  }
}

main().catch((e) => {
  send({ type: 'error', message: String((e && e.stack) || e) })
  process.exit(1)
})
