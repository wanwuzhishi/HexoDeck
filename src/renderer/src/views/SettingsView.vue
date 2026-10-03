<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import {
  NButton,
  NForm,
  NFormItem,
  NIcon,
  NInput,
  NInputNumber,
  NPopconfirm,
  NProgress,
  NRadioButton,
  NRadioGroup,
  NSelect,
  NSpace,
  NSwitch,
  NTabPane,
  NTabs,
  NTag
} from 'naive-ui'
import { SearchOutline } from '@vicons/ionicons5'
import { useRoute } from 'vue-router'
import { useSiteStore } from '../stores/site'
import { useWorkspaceStore } from '../stores/workspace'
import { useUiStore } from '../stores/ui'
import { message } from '../composables/message'
import CodeEditor from '../components/CodeEditor.vue'
import type { AppInfo, PluginInfo, ThemeConfigFile, ThemeInfo } from '@shared/ipc'

const site = useSiteStore()
const ws = useWorkspaceStore()
const ui = useUiStore()

const activeTab = ref('base')
/** 允许通过路由 query 指定初始标签（如 /settings?tab=theme），供侧栏快捷入口直达 */
const route = useRoute()
const VALID_TABS = ['base', 'deploy', 'theme', 'plugin', 'advanced', 'app'] as const
function tabFromQuery(): string | null {
  const t = String(route.query.tab ?? '')
  return (VALID_TABS as readonly string[]).includes(t) ? t : null
}
activeTab.value = tabFromQuery() ?? 'base'
// 已在设置页时再次点击快捷入口（仅 query 变化）也要切换标签
watch(
  () => route.query.tab,
  () => {
    const t = tabFromQuery()
    if (t) activeTab.value = t
  }
)
const loading = ref(false)

// ---------- 基础配置（reactive：模板中无需判空） ----------
const base = reactive({
  title: '',
  subtitle: '',
  description: '',
  author: '',
  language: '',
  timezone: '',
  url: '',
  root: '/',
  permalink: '',
  perPage: 10 as number | null,
  postAssetFolder: false
})
const savingBase = ref(false)

// ---------- 部署配置 ----------
const deploy = reactive({ type: '', repo: '', branch: '' })
const savingDeploy = ref(false)
const plugins = ref<PluginInfo[]>([])
const installingDeployer = ref('')

const hasGitDeployer = computed(() => plugins.value.some((p) => p.name === 'hexo-deployer-git'))
const showDeployerWarning = computed(() => deploy.type === 'git' && !hasGitDeployer.value)

const deployTypeOptions = [
  { label: 'Git（GitHub Pages / Coding 等）', value: 'git' },
  { label: '不部署（仅本地）', value: '' }
]

// ---------- 主题 ----------
const themes = ref<ThemeInfo[]>([])
const switchingTheme = ref('')
const themeFile = ref<ThemeConfigFile | null>(null)
const themeContent = ref('')
const savingTheme = ref(false)
const installingTheme = ref('')

// ---------- 高级（_config.yml 原文直编） ----------
const rawFile = ref<{ path: string; content: string } | null>(null)
const rawContent = ref('')
const savingRaw = ref(false)
const rawLoaded = ref(false)
const rawEditorRef = ref<InstanceType<typeof CodeEditor> | null>(null)
const keySearch = ref('')

/** 插件配置键搜索：按包名 / 配置键 / 说明过滤 */
const filteredPlugins = computed(() => {
  const kw = keySearch.value.trim().toLowerCase()
  if (!kw) return plugins.value
  return plugins.value.filter(
    (p) =>
      p.name.toLowerCase().includes(kw) ||
      (p.configKey ?? '').toLowerCase().includes(kw) ||
      p.description.toLowerCase().includes(kw)
  )
})

const MARKET = [
  { name: 'Butterfly', pkg: 'hexo-theme-butterfly', desc: '最流行的中文博客主题，功能丰富、文档完善' },
  { name: 'NexT', pkg: 'hexo-theme-next', desc: '经典老牌主题，稳定可靠' },
  { name: 'Fluid', pkg: 'hexo-theme-fluid', desc: '简约大气，Material 风格' },
  { name: 'Shoka', pkg: 'hexo-theme-shoka', desc: '二次元风格，动效丰富' },
  { name: 'Stellar', pkg: 'hexo-theme-stellar', desc: '面向知识型博客，组件化设计' },
  { name: '安知鱼', pkg: 'hexo-theme-anzhiyu', desc: 'Butterfly 衍生，现代化美化' },
  { name: 'Keep', pkg: 'hexo-theme-keep', desc: '极简写作主题' },
  { name: 'Volantis', pkg: 'hexo-theme-volantis', desc: '社区型主题，模块化布局' }
]

// ---------- 插件 ----------
const newPlugin = ref('')
const operatingPlugin = ref('')
const installingNew = ref(false)

async function installNew(): Promise<void> {
  const name = newPlugin.value.trim()
  if (!name) return
  installingNew.value = true
  try {
    await installPlugin(name)
    newPlugin.value = ''
  } finally {
    installingNew.value = false
  }
}

// ---------- 应用设置 ----------
const appInfo = ref<AppInfo | null>(null)
const closeToTray = ref(false)
const autoCheckUpdate = ref(true)

const autoSaveSeconds = computed({
  get: () => ui.autoSaveDelay / 1000,
  set: (v: number | null) => ui.setAutoSaveDelay((v ?? 1.5) * 1000)
})

async function onCloseToTrayChange(v: boolean): Promise<void> {
  const r = await window.api.saveAppSettings({ closeToTray: v })
  if (r.ok) {
    closeToTray.value = r.data?.closeToTray ?? v
    message.success(v ? '关闭窗口时将最小化到系统托盘' : '关闭窗口时将直接退出应用')
  } else {
    closeToTray.value = !v
    message.error(r.error ?? '保存失败')
  }
}

async function onAutoCheckChange(v: boolean): Promise<void> {
  const r = await window.api.saveAppSettings({ autoCheckUpdate: v })
  if (r.ok) {
    autoCheckUpdate.value = r.data?.autoCheckUpdate ?? v
    message.success(v ? '已开启自动检查更新' : '已关闭自动检查更新')
  } else {
    autoCheckUpdate.value = !v
    message.error(r.error ?? '保存失败')
  }
}

function checkUpdate(): void {
  void window.api.checkForUpdate()
}

function installUpdate(): void {
  void window.api.installUpdate()
}

/** 更新状态文案与样式 */
const updateStateText = computed(() => {
  const s = ws.updateStatus
  switch (s.state) {
    case 'idle':
      return '尚未检查'
    case 'checking':
      return '正在检查…'
    case 'not-available':
      return `已是最新版本（v${s.version ?? appInfo.value?.version ?? ''}）`
    case 'available':
      return `发现新版本 v${s.version}，开始下载…`
    case 'downloading':
      return `下载中 ${Math.round(s.percent ?? 0)}%`
    case 'downloaded':
      return `新版本 v${s.version} 已就绪，重启后生效`
    case 'error':
      return `检查失败：${s.message ?? '未知错误'}`
    case 'unsupported':
      return s.message ?? '当前环境不支持自动更新'
    default:
      return ''
  }
})

const updateStateOk = computed(
  () => ws.updateStatus.state === 'not-available' || ws.updateStatus.state === 'downloaded'
)

/** 打开日志文件夹 */
function openLogs(): void {
  void window.api.openLogFolder()
}

/** 配置变更后重启预览使新配置生效 */
async function restartPreviewIfRunning(): Promise<void> {
  if (!ws.previewUrl) return
  await ws.stopPreview()
  const r = await ws.startPreview()
  if (r.ok) message.success('预览已用新配置重启')
  else message.warning('配置已保存，但预览重启失败，可在发布页手动启动')
}

async function loadAll(): Promise<void> {
  loading.value = true
  try {
    const [cfg, th, pl, info] = await Promise.all([
      window.api.readSiteConfig(),
      window.api.listThemes(),
      window.api.listPlugins(),
      window.api.getAppInfo()
    ])
    if (cfg.ok && cfg.data) {
      Object.assign(base, cfg.data)
      Object.assign(deploy, cfg.data.deploy)
    }
    if (th.ok && th.data) themes.value = th.data
    if (pl.ok && pl.data) plugins.value = pl.data
    appInfo.value = info
    closeToTray.value = info.closeToTray
    autoCheckUpdate.value = info.autoCheckUpdate
  } finally {
    loading.value = false
  }
}

async function saveBase(): Promise<void> {
  savingBase.value = true
  try {
    const r = await window.api.saveBaseConfig({
      title: base.title,
      subtitle: base.subtitle,
      description: base.description,
      author: base.author,
      language: base.language,
      timezone: base.timezone,
      url: base.url,
      root: base.root,
      permalink: base.permalink,
      perPage: base.perPage,
      postAssetFolder: base.postAssetFolder
    })
    if (r.ok) {
      message.success('基础配置已保存（首次修改已自动备份原文件）')
      await restartPreviewIfRunning()
    } else {
      message.error(r.error ?? '保存失败')
    }
  } finally {
    savingBase.value = false
  }
}

async function quickGenerate(): Promise<void> {
  const r = await ws.runBuild('generate')
  if (r.ok) message.success('生成完成')
  else message.error(r.error ?? '生成失败')
}

async function saveDeploy(): Promise<void> {
  savingDeploy.value = true
  try {
    const r = await window.api.saveDeployConfig({
      type: deploy.type.trim(),
      repo: deploy.repo.trim(),
      branch: deploy.branch.trim()
    })
    if (r.ok) {
      message.success('部署配置已保存')
    } else {
      message.error(r.error ?? '保存失败')
    }
  } finally {
    savingDeploy.value = false
  }
}

async function switchTheme(name: string): Promise<void> {
  switchingTheme.value = name
  try {
    const r = await window.api.switchTheme(name)
    if (r.ok) {
      message.success(`主题已切换为 ${name}`)
      await loadAll()
      await restartPreviewIfRunning()
    } else {
      message.error(r.error ?? '切换失败')
    }
  } finally {
    switchingTheme.value = ''
  }
}

// ---------- 从压缩包安装主题 ----------
const dragActive = ref(false)
const installingArchive = ref(false)

/** 拖拽离开时只有真正离开容器才取消高亮（子元素会反复触发 dragleave） */
function onDragLeave(e: DragEvent): void {
  const zone = e.currentTarget as HTMLElement
  if (!zone.contains(e.relatedTarget as Node)) dragActive.value = false
}

async function installFromArchive(archivePath: string): Promise<void> {
  installingArchive.value = true
  try {
    const r = await window.api.installThemeFromArchive(archivePath)
    if (r.ok) {
      message.success(`主题 ${r.data?.name} 安装成功，可在下方列表中切换使用`)
      await loadAll()
    } else {
      message.error(r.error ?? '安装失败')
    }
  } finally {
    installingArchive.value = false
  }
}

async function onDropTheme(e: DragEvent): Promise<void> {
  dragActive.value = false
  const files = Array.from(e.dataTransfer?.files ?? [])
  if (!files.length) return
  if (files.length > 1) {
    message.warning('一次只能安装一个主题压缩包，已使用第一个文件')
  }
  const file = files[0]
  const path = window.api.pathForFile(file)
  if (!path) {
    message.error('无法获取文件路径，请改用「浏览文件」按钮选择')
    return
  }
  if (!/\.(zip|tar|tar\.gz|tgz)$/i.test(path)) {
    message.error('仅支持 .zip / .tar / .tar.gz / .tgz 格式的主题压缩包')
    return
  }
  await installFromArchive(path)
}

async function pickThemeArchive(): Promise<void> {
  const r = await window.api.installThemeFromDialog()
  if (r.ok) {
    message.success(`主题 ${r.data?.name} 安装成功，可在下方列表中切换使用`)
    await loadAll()
  } else if (r.error && r.error !== 'canceled') {
    message.error(r.error)
  }
}

async function loadThemeConfig(): Promise<void> {
  const r = await window.api.readThemeConfig()
  if (r.ok && r.data) {
    themeFile.value = r.data
    themeContent.value = r.data.created ? '# 主题配置覆盖文件（YAML）\n# 此处配置会与主题默认配置合并\n' : r.data.content
  } else {
    message.error(r.error ?? '读取主题配置失败')
  }
}

async function saveTheme(): Promise<void> {
  savingTheme.value = true
  try {
    const r = await window.api.saveThemeConfig(themeContent.value)
    if (r.ok) {
      message.success('主题配置已保存')
      themeFile.value = r.data ?? themeFile.value
    } else {
      message.error(r.error ?? '保存失败（请检查 YAML 语法）')
    }
  } finally {
    savingTheme.value = false
  }
}

async function loadRawConfig(): Promise<void> {
  const r = await window.api.readRawConfig()
  if (r.ok && r.data) {
    rawFile.value = r.data
    rawContent.value = r.data.content
    rawLoaded.value = true
  } else {
    message.error(r.error ?? '读取配置文件失败')
  }
}

async function saveRaw(): Promise<void> {
  savingRaw.value = true
  try {
    const r = await window.api.saveRawConfig(rawContent.value)
    if (r.ok) {
      message.success('_config.yml 已保存（修改前已自动备份）')
      if (rawFile.value) rawFile.value = { ...rawFile.value, content: rawContent.value }
      await restartPreviewIfRunning()
    } else {
      message.error(r.error ?? '保存失败（请检查 YAML 语法）')
    }
  } finally {
    savingRaw.value = false
  }
}

/** 标题栏「查找」按钮：打开编辑器的搜索面板 */
function openRawSearch(): void {
  rawEditorRef.value?.openSearch()
}

/** 插件设置：点击插件名，在配置文件尾部插入该插件的配置键模板 */
function insertPluginKey(key: string): void {
  if (new RegExp(`^${key}:`, 'm').test(rawContent.value)) {
    message.info(`${key} 的配置键已存在，已在编辑器中为你定位`)
    revealKey(key)
    return
  }
  rawContent.value = rawContent.value.replace(/\n*$/, '\n') + `${key}:\n  # 在此填写 ${key} 的配置\n`
  message.success(`已插入 ${key} 配置键模板，填写后记得保存`)
  revealKey(key)
}

/** 滚动并选中编辑器中的配置键所在行 */
function revealKey(key: string): void {
  void nextTick(() => {
    const lines = rawContent.value.split('\n')
    const idx = lines.findIndex((l) => new RegExp(`^${key}:`).test(l))
    if (idx >= 0) rawEditorRef.value?.revealLine(idx)
  })
}

/** 插件页「设置」按钮：跳到高级页并定位/插入该插件的配置键 */
async function openPluginSettings(p: PluginInfo): Promise<void> {
  activeTab.value = 'advanced'
  if (p.name.startsWith('hexo-theme-')) {
    message.info('主题类插件的设置在「主题」标签页编辑')
    return
  }
  await loadRawConfig()
  if (!p.configKey) {
    message.info(`${p.name} 没有独立配置键，可在编辑器中直接修改相关配置`)
    return
  }
  insertPluginKey(p.configKey)
}

async function installThemePkg(pkg: string): Promise<void> {
  installingTheme.value = pkg
  try {
    const r = await window.api.installPlugin(pkg)
    if (r.ok) {
      message.success(`${pkg} 安装成功，可在上方主题列表中切换（日志见发布页）`)
      await loadAll()
    } else {
      message.error(r.error ?? '安装失败')
    }
  } finally {
    installingTheme.value = ''
  }
}

async function installPlugin(name: string): Promise<void> {
  operatingPlugin.value = name
  try {
    const r = await window.api.installPlugin(name)
    if (r.ok) {
      message.success(`${name} 安装成功`)
      await loadAll()
    } else {
      message.error(r.error ?? '安装失败')
    }
  } finally {
    operatingPlugin.value = ''
  }
}

async function installGitDeployer(): Promise<void> {
  installingDeployer.value = 'hexo-deployer-git'
  try {
    await installPlugin('hexo-deployer-git')
  } finally {
    installingDeployer.value = ''
  }
}

async function uninstallPlugin(name: string): Promise<void> {
  operatingPlugin.value = name
  try {
    const r = await window.api.uninstallPlugin(name)
    if (r.ok) {
      message.success(`${name} 已卸载`)
      await loadAll()
    } else {
      message.error(r.error ?? '卸载失败')
    }
  } finally {
    operatingPlugin.value = ''
  }
}

const languageOptions = [
  { label: 'zh-CN（简体中文）', value: 'zh-CN' },
  { label: 'zh-TW（繁体中文）', value: 'zh-TW' },
  { label: 'en（English）', value: 'en' },
  { label: '默认（default）', value: 'default' }
]

// 首次进入加载；站点切换后重载
onMounted(loadAll)
watch(
  () => site.site?.path,
  () => {
    if (site.site) loadAll()
  }
)
watch(activeTab, (tab) => {
  if (tab === 'theme' && !themeFile.value) loadThemeConfig()
  if (tab === 'advanced' && !rawLoaded.value) loadRawConfig()
})
</script>

<template>
  <div class="page">
    <n-tabs v-model:value="activeTab" type="line" animated>
      <n-tab-pane name="base" tab="基础配置">
        <section class="glass panel">
          <div class="form-narrow">
            <n-form label-placement="left" :label-width="110">
              <n-form-item label="站点标题"><n-input v-model:value="base.title" /></n-form-item>
              <n-form-item label="副标题"><n-input v-model:value="base.subtitle" /></n-form-item>
              <n-form-item label="站点描述"><n-input v-model:value="base.description" type="textarea" :rows="2" /></n-form-item>
              <n-form-item label="作者"><n-input v-model:value="base.author" /></n-form-item>
              <n-form-item label="语言"><n-select v-model:value="base.language" :options="languageOptions" clearable /></n-form-item>
              <n-form-item label="时区"><n-input v-model:value="base.timezone" placeholder="例如 Asia/Shanghai" /></n-form-item>
              <n-form-item label="网站 URL"><n-input v-model:value="base.url" placeholder="https://example.com" /></n-form-item>
              <n-form-item label="根路径"><n-input v-model:value="base.root" placeholder="/" /></n-form-item>
              <n-form-item label="永久链接"><n-input v-model:value="base.permalink" placeholder=":year/:month/:day/:title/" /></n-form-item>
              <n-form-item label="每页文章数"><n-input-number v-model:value="base.perPage" :min="1" :max="100" clearable style="width: 160px" /></n-form-item>
              <n-form-item label="文章资产文件夹">
                <n-space align="center">
                  <n-switch v-model:value="base.postAssetFolder" />
                  <span class="muted small">开启后每篇文章有独立资源目录（图片随文章存放）</span>
                </n-space>
              </n-form-item>
            </n-form>
            <n-space>
              <n-button type="primary" :loading="savingBase" @click="saveBase">保存基础配置</n-button>
              <span class="muted small">首次保存会自动备份原文件为 _config.yml.hexodeck.bak，注释与顺序完整保留</span>
            </n-space>
          </div>
        </section>
      </n-tab-pane>

      <n-tab-pane name="deploy" tab="部署">
        <section class="glass panel">
          <div class="form-narrow">
            <n-form label-placement="left" :label-width="110">
              <n-form-item label="部署方式"><n-select v-model:value="deploy.type" :options="deployTypeOptions" /></n-form-item>
              <template v-if="deploy.type === 'git'">
                <n-form-item label="仓库地址">
                  <n-input v-model:value="deploy.repo" placeholder="https://github.com/用户名/仓库.git 或 git@…" />
                </n-form-item>
                <n-form-item label="分支"><n-input v-model:value="deploy.branch" placeholder="main" /></n-form-item>
              </template>
            </n-form>

            <div v-if="showDeployerWarning" class="warn-box">
              <span>使用 Git 部署需要 hexo-deployer-git 插件，当前站点未安装。</span>
              <n-button size="tiny" type="primary" :loading="installingDeployer === 'hexo-deployer-git'" @click="installGitDeployer">
                一键安装
              </n-button>
            </div>

            <n-space>
              <n-button type="primary" :loading="savingDeploy" @click="saveDeploy">保存部署配置</n-button>
              <n-button @click="quickGenerate">生成静态页面</n-button>
              <span class="muted small">保存后到「发布」页执行部署上线</span>
            </n-space>
          </div>
        </section>
      </n-tab-pane>

      <n-tab-pane name="theme" tab="主题">
        <section class="glass panel">
          <div class="panel-title">从压缩包安装主题</div>
          <div
            class="drop-zone"
            :class="{ dragging: dragActive, busy: installingArchive }"
            @dragenter.prevent="dragActive = true"
            @dragover.prevent="dragActive = true"
            @dragleave.prevent="onDragLeave"
            @drop.prevent="onDropTheme"
          >
            <div class="drop-icon">📦</div>
            <div class="drop-text">
              <template v-if="installingArchive">正在解压安装，请稍候…</template>
              <template v-else-if="dragActive">松开鼠标即可安装主题</template>
              <template v-else>
                把主题压缩包拖到这里，或
                <n-button size="tiny" type="primary" :disabled="installingArchive" @click="pickThemeArchive">
                  浏览文件
                </n-button>
              </template>
            </div>
            <div class="muted small">
              支持 .zip / .tar / .tar.gz / .tgz；解压后自动识别主题目录并放入站点的 themes/ 目录
            </div>
          </div>
        </section>

        <section class="glass panel">
          <div class="panel-title">已安装主题</div>
          <div class="theme-grid">
            <div v-for="t in themes" :key="t.name" class="theme-card" :class="{ active: t.active }">
              <div class="theme-head">
                <span class="theme-name">{{ t.name }}</span>
                <n-tag v-if="t.active" type="success" size="small" round :bordered="false">使用中</n-tag>
                <n-tag v-else size="small" round :bordered="false">{{ t.source === 'npm' ? 'npm' : 'themes/' }}</n-tag>
              </div>
              <n-button
                size="tiny"
                type="primary"
                :disabled="t.active"
                :loading="switchingTheme === t.name"
                @click="switchTheme(t.name)"
              >
                {{ t.active ? '当前主题' : '一键切换' }}
              </n-button>
            </div>
            <div v-if="!themes.length" class="muted small">未检测到已安装主题</div>
          </div>
        </section>

        <section class="glass panel">
          <div class="panel-head-row">
            <div class="panel-title">当前主题配置（YAML）</div>
            <span v-if="themeFile" class="muted small path">{{ themeFile.path }}{{ themeFile.created ? '（新建的覆盖文件）' : '' }}</span>
          </div>
          <div class="code-editor-wrap theme-editor">
            <CodeEditor ref="themeEditorRef" v-model="themeContent" :dark="ui.isDark" />
          </div>
          <n-space style="margin-top: 10px">
            <n-button type="primary" :loading="savingTheme" @click="saveTheme">保存主题配置</n-button>
            <n-button quaternary @click="loadThemeConfig">放弃修改</n-button>
            <span class="muted small">保存前会做 YAML 语法校验</span>
          </n-space>
        </section>

        <section class="glass panel">
          <div class="panel-title">主题市场</div>
          <div class="market-grid">
            <div v-for="m in MARKET" :key="m.pkg" class="market-card">
              <div class="theme-head">
                <span class="theme-name">{{ m.name }}</span>
                <n-button
                  size="tiny"
                  :loading="installingTheme === m.pkg"
                  :disabled="!!installingTheme"
                  @click="installThemePkg(m.pkg)"
                >
                  安装
                </n-button>
              </div>
              <div class="muted small">{{ m.desc }}</div>
              <div class="muted small mono">{{ m.pkg }}</div>
            </div>
          </div>
          <div class="muted small" style="margin-top: 10px">
            安装通过站点目录下的 npm 执行（需要本机 Node.js），安装日志见「发布」页。
          </div>
        </section>
      </n-tab-pane>

      <n-tab-pane name="plugin" tab="插件">
        <section class="glass panel">
          <div class="panel-head-row">
            <div class="panel-title">已安装插件（{{ plugins.length }}）</div>
            <n-space>
              <n-input
                v-model:value="newPlugin"
                placeholder="包名，如 hexo-generator-feed"
                style="width: 260px"
                @keyup.enter="installNew"
              />
              <n-button type="primary" :loading="installingNew" :disabled="installingNew || !newPlugin.trim()" @click="installNew">
                安装
              </n-button>
            </n-space>
          </div>
          <div class="plugin-list">
            <div v-for="p in plugins" :key="p.name" class="plugin-row">
              <div class="plugin-info">
                <span class="plugin-name">{{ p.name }}</span>
                <span class="muted small">{{ p.description }}</span>
              </div>
              <n-space align="center">
                <n-tag size="small" round :bordered="false">{{ p.version }}</n-tag>
                <n-button size="tiny" quaternary @click="openPluginSettings(p)">设置</n-button>
                <n-popconfirm @positive-click="uninstallPlugin(p.name)">
                  <template #trigger>
                    <n-button size="tiny" quaternary type="error" :loading="operatingPlugin === p.name">卸载</n-button>
                  </template>
                  卸载 {{ p.name }}？渲染器类插件卸载后站点可能无法生成，确定吗？
                </n-popconfirm>
              </n-space>
            </div>
            <div v-if="!plugins.length" class="muted small">站点 package.json 中没有 hexo-* 依赖</div>
          </div>
        </section>
      </n-tab-pane>
      <n-tab-pane name="advanced" tab="高级">
        <section class="glass panel">
          <div class="panel-head-row">
            <div class="panel-title">Hexo 配置文件（_config.yml）</div>
            <n-space align="center" :size="10">
              <span v-if="rawFile" class="muted small path">{{ rawFile.path }}</span>
              <n-button size="tiny" secondary title="搜索配置文件内容（Ctrl+F）" @click="openRawSearch">
                <template #icon>
                  <n-icon :component="SearchOutline" />
                </template>
                查找
              </n-button>
            </n-space>
          </div>
          <div class="muted small" style="margin-bottom: 10px">
            直接编辑配置文件原文，适合配置表单未覆盖的字段和各插件的个性化配置。保存前自动校验
            YAML 并备份原文件为 _config.yml.hexodeck.bak；保存后预览会自动重启。
          </div>
          <div class="code-editor-wrap raw-editor">
            <CodeEditor ref="rawEditorRef" v-model="rawContent" :dark="ui.isDark" />
          </div>
          <n-space style="margin-top: 10px">
            <n-button type="primary" :loading="savingRaw" @click="saveRaw">保存配置文件</n-button>
            <n-button quaternary @click="loadRawConfig">放弃修改</n-button>
            <span class="muted small">插件设置：在「插件」页点「设置」可直达对应配置键，也可点击下方插件键插入</span>
          </n-space>
        </section>

        <section class="glass panel">
          <div class="panel-head-row">
            <div class="panel-title">插件配置键（点击打开或插入）</div>
            <n-space align="center">
              <span v-if="keySearch.trim()" class="muted small">匹配 {{ filteredPlugins.length }} / {{ plugins.length }}</span>
              <n-input
                v-model:value="keySearch"
                placeholder="搜索插件名 / 配置键 / 说明"
                clearable
                size="small"
                style="width: 240px"
              />
            </n-space>
          </div>
          <div class="plugin-key-list">
            <button
              v-for="p in filteredPlugins"
              :key="p.name"
              class="plugin-key"
              :title="p.configKey ? `打开 ${p.configKey}: 配置键` : `${p.name} 无独立配置键`"
              @click="openPluginSettings(p)"
            >
              <span class="mono">{{ p.configKey ? `${p.configKey}:` : p.name }}</span>
              <span class="muted small">{{ p.description }}</span>
            </button>
            <div v-if="!filteredPlugins.length" class="muted small">
              {{ keySearch.trim() ? '没有匹配的插件，换个关键词试试' : '暂无已安装插件' }}
            </div>
          </div>
        </section>
      </n-tab-pane>

      <n-tab-pane name="app" tab="应用">
        <section class="glass panel">
          <div class="panel-title">外观与编辑</div>
          <div class="form-narrow">
            <n-form label-placement="left" :label-width="110">
              <n-form-item label="界面主题">
                <n-space align="center">
                  <n-radio-group :value="ui.themeMode" size="small" @update:value="ui.setThemeMode">
                    <n-radio-button value="light">亮色</n-radio-button>
                    <n-radio-button value="dark">暗色</n-radio-button>
                    <n-radio-button value="system">跟随系统</n-radio-button>
                  </n-radio-group>
                  <span class="muted small">
                    {{ ui.themeMode === 'system' ? '随系统亮暗自动切换（也可点左下角 ◐/☀/☾ 循环切换）' : '固定主题，不随系统变化' }}
                  </span>
                </n-space>
              </n-form-item>
              <n-form-item label="自动保存延迟">
                <n-space align="center">
                  <n-input-number
                    v-model:value="autoSaveSeconds"
                    :min="0.5"
                    :max="10"
                    :step="0.5"
                    style="width: 150px"
                  />
                  <span class="muted small">编辑器停止输入后多久自动保存（秒）</span>
                </n-space>
              </n-form-item>
            </n-form>
          </div>
        </section>

        <section class="glass panel">
          <div class="panel-title">更新</div>
          <div class="form-narrow">
            <n-form label-placement="left" :label-width="110">
              <n-form-item label="当前版本">
                <span class="muted">HexoDeck v{{ appInfo?.version ?? '—' }}</span>
              </n-form-item>
              <n-form-item label="自动检查">
                <n-space align="center">
                  <n-switch :value="autoCheckUpdate" @update:value="onAutoCheckChange" />
                  <span class="muted small">启动时及每 6 小时检查一次 GitHub Releases</span>
                </n-space>
              </n-form-item>
              <n-form-item label="更新状态">
                <n-space align="center" :size="10">
                  <span :class="['update-state', updateStateOk ? 'ok' : '', ws.updateStatus.state === 'error' ? 'err' : '']">
                    {{ updateStateText }}
                  </span>
                  <n-progress
                    v-if="ws.updateStatus.state === 'downloading'"
                    type="line"
                    :percentage="Math.round(ws.updateStatus.percent ?? 0)"
                    :show-indicator="false"
                    :height="6"
                    style="width: 180px"
                  />
                </n-space>
              </n-form-item>
            </n-form>
            <n-space>
              <n-button size="small" :loading="ws.updateStatus.state === 'checking'" @click="checkUpdate">
                立即检查更新
              </n-button>
              <n-button
                v-if="ws.updateStatus.state === 'downloaded'"
                size="small"
                type="primary"
                @click="installUpdate"
              >
                重启并安装 v{{ ws.updateStatus.version }}
              </n-button>
            </n-space>
          </div>
        </section>

        <section class="glass panel">
          <div class="panel-title">窗口与日志</div>
          <div class="form-narrow">
            <n-form label-placement="left" :label-width="110">
              <n-form-item label="关闭到托盘">
                <n-space align="center">
                  <n-switch :value="closeToTray" @update:value="onCloseToTrayChange" />
                  <span class="muted small">开启后点关闭按钮最小化到系统托盘，双击托盘图标恢复窗口</span>
                </n-space>
              </n-form-item>
              <n-form-item label="运行日志">
                <n-space align="center" :size="10">
                  <n-button size="small" @click="openLogs">打开日志文件夹</n-button>
                  <span class="muted small path">{{ appInfo?.logFile || '（启动后生成）' }}</span>
                </n-space>
              </n-form-item>
            </n-form>
          </div>
        </section>
      </n-tab-pane>
    </n-tabs>
  </div>
</template>

<style scoped>
/* 卡片间纵向间距：卡片实际父级是 n-tab-pane 的内容容器，需穿透 */
.page :deep(.n-tabs .n-tab-pane) {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-narrow {
  max-width: 640px;
}

.warn-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 12px;
  padding: 10px 14px;
  border-radius: var(--radius);
  border: 1px solid var(--warn);
  background: color-mix(in srgb, var(--warn) 10%, transparent);
  color: var(--text-1);
  font-size: 13px;
}

.update-state {
  font-size: 13px;
  color: var(--text-2);
}

.update-state.ok {
  color: var(--ok);
}

.update-state.err {
  color: var(--danger);
}

.panel-head-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.path {
  word-break: break-all;
}

.theme-grid,
.market-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 10px;
}

/* 主题压缩包拖拽安装区 */
.drop-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 26px 16px;
  text-align: center;
  border: 1px dashed var(--glass-border);
  border-radius: var(--radius);
  background: var(--accent-soft);
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}

.drop-zone.dragging {
  border-color: var(--accent);
  border-style: solid;
  box-shadow: var(--accent-glow);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}

.drop-zone.busy {
  opacity: 0.75;
}

.drop-icon {
  font-size: 26px;
  line-height: 1;
}

.drop-text {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: var(--text-1);
}

.theme-card,
.market-card {
  border: 1px solid var(--glass-border);
  border-radius: var(--radius);
  padding: 12px 14px;
  background: var(--accent-soft);
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: box-shadow 0.15s ease, border-color 0.15s ease;
}

.theme-card:hover,
.market-card:hover {
  box-shadow: var(--accent-glow);
}

.theme-card.active {
  border-color: var(--accent);
  box-shadow: var(--accent-glow);
}

.theme-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.theme-name {
  font-weight: 700;
  color: var(--text-1);
}

.mono {
  font-family: var(--mono);
  font-size: 11px;
}

.code-editor-wrap {
  border: 1px solid var(--glass-border);
  border-radius: var(--radius);
  background: var(--glass-strong);
  box-shadow: var(--glass-glow);
  overflow: hidden;
}

.raw-editor {
  height: 440px;
}

.theme-editor {
  height: 300px;
}

.plugin-key-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.plugin-key {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  border: 1px solid var(--glass-border);
  border-radius: 10px;
  background: var(--accent-soft);
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  color: var(--text-1);
  transition: box-shadow 0.15s ease, border-color 0.15s ease;
}

.plugin-key:hover {
  border-color: var(--accent);
  box-shadow: var(--accent-glow);
}

.plugin-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.plugin-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 12px;
  border-radius: 10px;
  border: 1px solid var(--glass-border);
}

.plugin-row:hover {
  background: var(--accent-soft);
}

.plugin-info {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
  flex-wrap: wrap;
}

.plugin-name {
  font-family: var(--mono);
  font-size: 13px;
  color: var(--text-1);
}
</style>
