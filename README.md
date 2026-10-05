# HexoDeck

Hexo 博客图形化管理工具 —— 写作、预览、发布、配置全流程，不碰命令行。

[![Release](https://img.shields.io/github/v/release/wanwuzhishi/HexoDeck)](https://github.com/wanwuzhishi/HexoDeck/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

Electron + Vue 3 + Naive UI · 双主题（深空霓虹 / 冰白清新）· 内嵌 Hexo 引擎

## 功能

**写作**
- 文章 / 草稿的新建、编辑、删除（删除移入系统回收站）
- CodeMirror 6 编辑器：Markdown 语法高亮、双行工具栏（H1–H4 / 粗斜体 / 代码块 / 引用 / 三种列表 / 链接 / 图片 / 表格 / 清除格式 / 撤销重做）
- 图片粘贴、拖拽、选择器导入 → 自动保存到站点 `source/images/` 并插入链接
- 自动保存（延迟可在应用设置里调）、分栏实时预览（开关持久化）、Ctrl+F 内容搜索与替换
- 全文搜索（标题 / 标签 / 分类 / 正文，附摘录）、草稿一键转正式

**预览与发布**
- **本地预览独立成页**：整屏 iframe 呈现主题渲染后的真实博客页面（可含草稿），站点文件变更自动刷新，切换「包含草稿」自动重启预览生效
- 发布页专注构建部署：`generate` / `deploy` / `clean` 卡片式操作，顶部显示当前部署目标，实时运行日志（支持清空）
- **部署更可靠**：部署前自动执行一次 `generate`（避免推送旧产物）；从输出中识别 git 推送失败并明确报错，不再「假成功」；配置分支为空、仓库地址缺 `.git` 等会在部署前提示

**页面**
- 独立管理 `source/` 下的页面（如 `about/index.md`），支持子目录；文章目录自动排除
- 新建页面填标题、路径（如 `about`）与初始参数：路径即文件夹，自动创建 `<路径>/index.md`；标题与参数重合的部分自动去重（标题以表单为准，参数中的 date 沿用）
- 页面编辑器：分栏预览、自动保存、Ctrl+S、站点切换守卫；front-matter 以 **YAML 输入框**直接编辑（含标题/日期，实时语法校验），顶部只读展示当前标题、日期与路径

**站点配置**
- 基础配置表单（标题 / 作者 / 语言 / URL / 永久链接 / 分页等），首次保存自动备份 `_config.yml.hexodeck.bak`，注释与键顺序完整保留；**站点图标**可在此设置（也可在站点页点头像或拖拽图片）
- 部署配置表单化（Git 仓库 / 分支，含 main / master 快捷填入），缺 `hexo-deployer-git` 时一键安装；配置不完整会即时提示
- **高级模式**：应用内直接编辑配置文件原文（YAML 高亮 + 查找替换 + 保存前语法校验）；不自动定位文件——每个站点首次打开弹窗指定 `_config.yml` 路径（可一键采用默认位置），按站点记忆，之后不再询问，随时可点「自定义路径」重选
- 插件配置键搜索：查插件 → 点击直达配置键位置

**主题与插件**
- **从压缩包安装主题**：拖拽进窗口或浏览文件，支持 `.zip` / `.tar` / `.tar.gz` / `.tgz`，自动识别并规整主题目录
- 已装主题检测（`themes/` 目录 + npm 包）、一键切换（预览自动重启）
- 主题配置 YAML 编辑（保存前校验）；路径同样由用户指定——每个主题首次打开弹窗选择配置文件（覆盖文件或主题自带均可），按「站点 + 主题」记忆；内置 8 款热门主题市场一键安装
- 插件列表（带中文说明与配置键映射）、安装 / 卸载（npm 输出进运行日志）

**统计**
- 数据概览：文章 / 草稿 / 总字数 / 平均字数 / 标签 / 分类
- 写作活跃度：本周与本月新增、写作天数、最高产一天、首篇与最新日期
- 最近 12 个月发布趋势、标签与分类排行、年度产出
- 内容特征：最长 / 最短文章，未分类 / 无标签文章提示

**应用**
- 双主题：暗色（深空黑 + 霓虹青蓝 + 淡紫）/ 亮色（浅冰白 + 淡青蓝），玻璃拟态风格；支持**跟随系统**自动切换
- 自动更新：启动时及每 6 小时检查 GitHub Releases，自动下载新版本，重启后生效（可在设置中关闭）
- 可选关闭到系统托盘 + 单实例锁（重复启动唤回已开窗口）
- **自绘标题栏**：无边框窗口，标题栏与界面同为玻璃圆角卡片（左侧显示当前站点图标与名称，最大化时自动贴边），支持拖拽、双击最大化
- **自定义文集**：在侧栏添加自己的文章集——自定义名称（≤8 字）与图标，绑定站点根目录内的任意文件夹，即可像「文章」一样管理其中的 Markdown（列表 / 新建 / 编辑 / 删除，文章式编辑器 + 自定义参数）；侧栏可添加多个文集，移除入口不影响已写内容
- 多站点管理：**添加站点**选择已安装 Hexo 的博客文件夹；**切换站点**在弹出的已添加列表里点击站点卡片即切换（右栏站点卡片、站点页均可），支持移除
- **自定义站点图标**：站点页可设置 / 更换 / 恢复默认，也可直接把图片拖到头像上；图标写入站点 `source/favicon.*`，随站点走，Hexo 生成时网站也会用上
- 运行日志落地到 `%APPDATA%/hexodeck/hexodeck.log`，应用设置页一键打开
- 文章编辑器参数侧栏：分类 / 标签 + 自定义 front-matter 参数（英文键名 + 中文显示名，按站点绑定）；默认收起，顶部按钮随时展开

## 快速开始

### 使用打包版（推荐）

从 [Releases](https://github.com/wanwuzhishi/HexoDeck/releases) 下载：

- **安装版**：运行 `HexoDeck-Setup-x.y.z.exe`，按向导安装（可选安装目录），日常使用首选
- **绿色包**：解压 `HexoDeck-x.y.z-win.zip` 到任意目录（U 盘亦可），运行其中的 `HexoDeck.exe` 即可，零安装、秒启动

> 提示：绿色包请先解压再使用（不要在压缩包里直接双击运行）。解压后启动仅需不到 1 秒；每次启动都重新解压的「单文件便携版」体验很差，已不再提供。

首次启动后点击「添加站点」选择你的 Hexo 博客根目录（包含 `_config.yml` 的目录）即可；之后再添加其他站点，可在右栏站点卡片或站点页点「切换站点」在已添加的站点间切换。

> 无需在电脑上安装 Node.js —— 应用内嵌了 Hexo 引擎；站点目录里已有的 hexo 和插件会优先被使用。

### 从源码开发

```bash
npm install
npm run setup:embed   # 安装内嵌 Hexo 引擎（resources/embed）
npm run dev
```

### 打包

```bash
npm run build:unpack  # 生成 dist/win-unpacked 目录（快速验证）
npm run build:win     # 生成 NSIS 安装包 + 绿色包 zip
```

## 发布新版本（自动更新源）

应用内置 [electron-updater](https://www.electron.build/auto-update)，以 GitHub Releases 为更新源：已安装用户启动时及每 6 小时自动检查，发现新版本自动下载、重启生效（可在 设置 → 应用 中关闭自动检查）。

发版步骤：

1. 更新版本号：`npm version patch`（或 minor / major）
2. 打包：`npm run build:win`（`--publish never` 仅构建，不自动上传）
3. 在 GitHub 创建对应 tag（如 `v0.1.1`）的 Release，上传以下资产：

   | 资产 | 必需 | 用途 |
   |---|---|---|
   | `HexoDeck-Setup-X.Y.Z.exe` | ✅ | 安装包本体 |
   | `HexoDeck-Setup-X.Y.Z.exe.blockmap` | ✅ | 增量更新（只下载变化部分） |
   | `latest.yml` | ✅ | 更新检查入口（版本号与哈希清单） |
   | `HexoDeck-X.Y.Z-win.zip` | 可选 | 绿色包 |

4. 发布 Release 即完成，旧版本会自动发现更新

> 注意：`latest.yml`、安装包、blockmap 必须来自同一次构建（sha512 校验需匹配）。

## 目录结构

```
src/
├─ main/            主进程：服务层（站点/文章/构建/预览/配置/日志/托盘）
│  └─ services/     各 Service 不依赖 electron，可用 tsx 直接单测
├─ preload/         contextBridge 类型化 API
├─ renderer/        Vue 3 界面（三栏玻璃布局 + 双主题）
└─ shared/          主进程与渲染进程共享的 IPC 契约类型
resources/
├─ child/           hexo 子进程引导脚本（ELECTRON_RUN_AS_NODE）
└─ embed/           内嵌 Hexo 引擎（打包时解压出 asar）
scripts/
├─ smoke-services.ts  服务层验收脚本（npx tsx scripts/smoke-services.ts <站点目录>）
├─ make-icon.ps1      图标生成
└─ run.mjs            构建包装（Windows 下 TMP 重定向）
```

## 技术要点

- **Hexo 集成**：不在主进程内嵌 hexo 实例，而是 fork 子进程（Electron 的 Node 模式）承载 hexo；优先加载站点自带的 hexo 与插件（与用户原有环境一致），缺失时回退到应用内嵌引擎（用户无需装 Node）
- **配置写入**：`_config.yml` 采用行级替换编辑，注释、空行、键顺序原样保留；保存前 YAML 校验，首改自动备份
- **构建串行队列**：generate/deploy 与 npm 插件安装串行执行，避免 db.json 冲突；npm 命令带 `--yes` 与 5 分钟看门狗
- **自动更新**：electron-updater + GitHub Releases 全链路已接入（含 blockmap 增量更新，v0.1.1 起端到端验证）；`latest.yml`、安装包、blockmap 必须来自同一次构建

## 已知限制

- 当前主要面向 Windows（NSIS 安装包 / ZIP 绿色包）；macOS / Linux 目标可在 `electron-builder.yml` 中追加
- 插件安装/卸载依赖本机 Node.js / npm（新建站点与装插件时需要；日常写作、预览、生成不依赖）
- 界面语言暂为中文（i18n 已预留，欢迎贡献翻译）

## 开发计划

见 [PLAN.md](./PLAN.md)（M0–M4 已完成：脚手架、核心闭环、写作体验、配置/主题/插件管理、统计页、分发与打磨；后续方向：i18n、hexo 标签语法按钮、跨平台构建）。

## License

MIT
