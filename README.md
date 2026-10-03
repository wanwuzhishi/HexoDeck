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
- 自动保存（延迟可在应用设置里调）、分栏实时预览、Ctrl+F 内容搜索与替换
- 全文搜索（标题 / 标签 / 分类 / 正文，附摘录）、草稿一键转正式

**预览与发布**
- 一键启动本地预览，内嵌 iframe 呈现主题渲染后的真实博客页面（可含草稿）
- 站点文件变更自动刷新列表与预览
- `generate` / `clean` / `deploy` 一键执行，实时运行日志（同时落地到日志文件）

**站点配置**
- 基础配置表单（标题 / 作者 / 语言 / URL / 永久链接 / 分页等），首次保存自动备份 `_config.yml.hexodeck.bak`，注释与键顺序完整保留
- 部署配置表单化（Git 仓库 / 分支），缺 `hexo-deployer-git` 时一键安装
- **高级模式**：在应用内直接编辑 `_config.yml` 原文（YAML 高亮 + 查找替换 + 保存前语法校验）
- 插件配置键搜索：查插件 → 点击直达配置键位置

**主题与插件**
- 已装主题检测（`themes/` 目录 + npm 包）、一键切换（预览自动重启）
- 主题配置 YAML 编辑（保存前校验）；内置 8 款热门主题市场一键安装
- 插件列表（带中文说明）、安装 / 卸载（npm 输出进运行日志）

**应用**
- 双主题：暗色（深空黑 + 霓虹青蓝 + 淡紫）/ 亮色（浅冰白 + 淡青蓝），玻璃拟态风格
- 可选关闭到系统托盘 + 单实例锁（重复启动唤回已开窗口）
- 多站点管理：最近站点快速切换、移除
- 运行日志落地到 `%APPDATA%/hexodeck/hexodeck.log`，应用设置页一键打开

## 快速开始

### 使用打包版（推荐）

从 [Releases](https://github.com/wanwuzhishi/HexoDeck/releases) 下载：

- **安装版**：运行 `HexoDeck-Setup-x.y.z.exe`，按向导安装（可选安装目录），日常使用首选
- **绿色包**：解压 `HexoDeck-x.y.z-win.zip` 到任意目录（U 盘亦可），运行其中的 `HexoDeck.exe` 即可，零安装、秒启动

> 提示：绿色包请先解压再使用（不要在压缩包里直接双击运行）。解压后启动仅需不到 1 秒；每次启动都重新解压的「单文件便携版」体验很差，已不再提供。

首次启动后点击「打开站点目录」选择你的 Hexo 博客根目录（包含 `_config.yml` 的目录）即可。

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
- **自动更新预留**：electron-builder 已生成 blockmap，发布到 GitHub Releases 时在 `electron-builder.yml` 取消 publish 配置注释并接入 electron-updater 即可

## 已知限制

- 当前主要面向 Windows（NSIS / 便携版）；macOS / Linux 目标可在 `electron-builder.yml` 中追加
- 插件安装/卸载依赖本机 Node.js / npm（新建站点与装插件时需要；日常写作、预览、生成不依赖）
- 界面语言暂为中文（i18n 已预留，欢迎贡献翻译）

## 开发计划

见 [PLAN.md](./PLAN.md)（M0–M4 已完成：脚手架、核心闭环、写作体验、配置/主题/插件管理、分发与打磨）。

## License

MIT
