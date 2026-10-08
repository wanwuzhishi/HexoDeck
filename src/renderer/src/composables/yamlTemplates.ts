import { ref } from 'vue'
import { dumpYaml } from './yamlFormat'

/** 结构化参数的模板：一键填入骨架，改值即可 */
export interface YamlTemplate {
  id: string
  name: string
  /** 说明用途，帮助选择 */
  desc: string
  /** YAML 文本（结构化参数的编辑内容） */
  yaml: string
  /** 内置模板不可删除 */
  builtin: boolean
}

const STORAGE_KEY = 'hexodeck-yaml-templates'

/**
 * 内置模板：面向「游戏资源 / 网盘分享」类博客的高频结构。
 * 用实际对象经 dumpYaml 生成，保证缩进与数组格式一定正确。
 */
function buildBuiltins(): YamlTemplate[] {
  const resourceCard = {
    enable: true,
    type: 'mod',
    version: 'v1.0.0',
    platform: 'Windows',
    size: '1.0 GB',
    language: '简体中文',
    updated: '2026-01-01',
    links: [
      {
        name: '蓝奏云',
        url: 'https://example.com/file',
        password: 'abcd',
        size: '1.0 GB',
        note: '不限速'
      },
      {
        name: '百度网盘',
        url: 'https://pan.baidu.com/s/example',
        password: '1234',
        size: '1.0 GB'
      }
    ]
  }

  const linksOnly = {
    links: [
      { name: '蓝奏云', url: 'https://example.com/file', password: 'abcd', note: '不限速' },
      { name: '百度网盘', url: 'https://pan.baidu.com/s/example', password: '1234' },
      { name: '夸克网盘', url: 'https://pan.quark.cn/s/example', password: '' }
    ]
  }

  const changelog = {
    version: 'v1.1.0',
    updated: '2026-01-01',
    changes: [
      { version: 'v1.1.0', date: '2026-01-01', items: ['新增示例功能', '修复已知问题'] },
      { version: 'v1.0.0', date: '2025-12-01', items: ['首个版本'] }
    ]
  }

  const video = {
    enable: true,
    url: 'https://www.bilibili.com/video/BV1xx411c7mD',
    title: '演示视频',
    cover: '/images/covers/video.webp',
    author: '作者名'
  }

  const gallery = {
    enable: true,
    images: [
      { src: '/images/gallery/01.webp', caption: '截图一' },
      { src: '/images/gallery/02.webp', caption: '截图二' }
    ]
  }

  return [
    {
      id: 'builtin-resource-card',
      name: '游戏资源卡',
      desc: '资源信息 + 多网盘链接（含版本、平台、大小等）',
      yaml: dumpYaml(resourceCard),
      builtin: true
    },
    {
      id: 'builtin-links',
      name: '多网盘链接',
      desc: '只有下载链接列表，挂在已有参数下',
      yaml: dumpYaml(linksOnly),
      builtin: true
    },
    {
      id: 'builtin-changelog',
      name: '更新日志',
      desc: '多版本更新记录（版本号 / 日期 / 变更项）',
      yaml: dumpYaml(changelog),
      builtin: true
    },
    {
      id: 'builtin-video',
      name: '视频嵌入',
      desc: '视频地址 / 封面 / 作者',
      yaml: dumpYaml(video),
      builtin: true
    },
    {
      id: 'builtin-gallery',
      name: '图片画廊',
      desc: '多张图 + 说明文字',
      yaml: dumpYaml(gallery),
      builtin: true
    }
  ]
}

/** 兼容旧数据并过滤非法项 */
function loadCustom(): YamlTemplate[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item) => {
        const o = item as Partial<YamlTemplate>
        const name = typeof o.name === 'string' ? o.name.trim() : ''
        const yaml = typeof o.yaml === 'string' ? o.yaml : ''
        if (!name || !yaml.trim()) return null
        const id = typeof o.id === 'string' && o.id ? o.id : `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
        return {
          id,
          name: name.slice(0, 12),
          desc: typeof o.desc === 'string' ? o.desc.slice(0, 40) : '我的模板',
          yaml,
          builtin: false
        }
      })
      .filter((t): t is YamlTemplate => t !== null)
  } catch {
    return []
  }
}

/** 结构化参数的模板库：内置模板 + 用户自存模板（全局共用，不区分站点） */
export function useYamlTemplates() {
  const builtin = buildBuiltins()
  const custom = ref<YamlTemplate[]>(loadCustom())

  function persist(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(custom.value))
  }

  /** 把当前编辑内容存为模板 */
  function addFromYaml(name: string, yaml: string): YamlTemplate {
    const item: YamlTemplate = {
      id: `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim().slice(0, 12) || '未命名模板',
      desc: '我的模板',
      yaml,
      builtin: false
    }
    custom.value.push(item)
    persist()
    return item
  }

  function remove(id: string): void {
    custom.value = custom.value.filter((t) => t.id !== id)
    persist()
  }

  function all(): YamlTemplate[] {
    return [...builtin, ...custom.value]
  }

  return { all, addFromYaml, remove }
}
