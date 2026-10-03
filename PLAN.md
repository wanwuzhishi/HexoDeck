# HexoDeck 开发计划

> Hexo 图形化管理工具 · Electron 桌面应用 · 2026-10-03 制定

## 1. 项目定位

**一句话**：一款现代化的 Hexo 博客桌面管理工具，让博主不碰命令行就能完成「写作 → 预览 → 发布」全流程。

- **形态**：Electron 桌面应用（Windows 优先，预留 macOS/Linux）
- **阶段策略**：先自用——以 `F:\hexo` 作为第一个接入站点打磨；成熟后开源发布
- **v1.0 范围**：全功能一步到位（文章写作 + 实时预览 + 主题/配置/插件管理 + 一键部署）

## 2. 现有方案与差异化

| 现有方案 | 形态 | 不足 |
|---|---|---|
| hexo-admin | Hexo 插件（浏览器） | 界面老旧，需手动启动 hexo server |
| hexo-client | Electron 桌面 | 功能基础、UI 陈旧、更新缓慢 |
| HexoEditor | Electron 编辑器 | 只解决写作，不管站点与发布 |
| Qexo | 云端在线管理 | 部署繁琐，本地写作体验弱 |

**HexoDeck 的差异化**：
1. 内嵌 Hexo 引擎——用户电脑无需安装 Node 也能用
2. 真实主题实时预览——直接渲染 hexo server 输出，所见即所得
3. 全流程覆盖——写作、主题、配置、插件、部署在一个应用内闭环
4. 现代化 UI 与透明日志——每一步操作可观察、可回溯

## 3. 技术选型

| 层次 | 选型 | 理由 |
|---|---|---|
| 应用壳 | Electron + electron-vite + TypeScript | 与 Hexo 同属 Node 生态，可内嵌为库调用 |
| 前端框架 | Vue 3 + Pinia | 已定；配合 Naive UI 组件库（TS 友好、暗色主题完善） |
| 编辑器 | CodeMirror 6 | 轻量、Markdown 支持好，比 Monaco 更适合写作场景 |
| Markdown 渲染 | markdown-it（配置对齐 hexo-renderer-marked） | 分栏预览用；真实预览走 hexo server |
| Front-matter 解析 | gray-matter | 读写文章元数据，尽量保持原文件格式 |
| Hexo 集成 | 内嵌 `hexo` npm 包（Programmatic API） | 核心决策，见 §6.1 |
| 文件监听 | chokidar | 文章增删改 → 界面与预览自动刷新 |
| 打包分发 | electron-builder | Windows NSIS 安装包 + 便携版 |
| 测试 | Vitest（单元）+ Playwright（E2E） | 后期引入，M1 起写关键路径单测 |

## 4. 总体架构

```
┌──────────────────────────────────────────────────┐
│  Renderer（Vue 3 + Naive UI）                     │
│  站点首页 / 文章列表 / 编辑器 / 主题 / 配置 / 设置    │
└───────────────────┬──────────────────────────────┘
                    │  IPC（contextBridge，类型化契约，白名单）
┌───────────────────┴──────────────────────────────┐
│  Main（Node 主进程）                               │
│  ├─ HexoService    站点加载、hexo 实例生命周期       │
│  ├─ PostService    文章/草稿/页面 CRUD、front-matter│
│  ├─ PreviewService hexo server 启停、端口管理       │
│  ├─ BuildService   generate / clean / deploy + 日志流│
│  ├─ ThemeService   主题检测、切换、下载              │
│  ├─ ConfigService  _config.yml 读取、表单化、校验    │
│  ├─ PluginService  依赖识别、安装/卸载               │
│  ├─ AssetService   图片保存、粘贴/拖拽导入           │
│  └─ WatchService   站点文件监听 → 推送变更           │
└──────────────────────────────────────────────────┘
```

安全基线：`contextIsolation` 开启、`nodeIntegration` 关闭、IPC 通道白名单、文件操作仅限用户选择的站点目录。

## 5. 里程碑规划（v1.0 全功能，预计 6–8 周）

### M0 · 项目脚手架（约 1 天）
- electron-vite + Vue 3 + TS + Naive UI 初始化，ESLint/Prettier，Git 仓库
- **尽早跑通 electron-builder 打包冒烟测试**（验证 hexo 可被打进安装包）

### M1 · 站点管理与核心闭环（约 1.5–2 周）
- 打开已有站点（校验 `_config.yml` 与 `package.json`）、新建站点（内置官方脚手架模板）
- 文章列表：标题/日期/分类/标签/草稿标记、搜索、排序
- 文章与草稿的新建、编辑、删除；front-matter 表单（title/date/tags/categories 等）+ 源码模式
- 内嵌 Hexo：加载站点 → generate → 启动本地预览
- **验收**：用 `F:\hexo` 完成「新建文章 → 编辑 → 预览 → 生成」全流程

### M2 · 写作与预览体验（约 1.5–2 周）
- CodeMirror 6 编辑器：高亮、行号、字数统计、自动保存
- 分栏实时预览（markdown-it）+ **真实主题预览**（iframe 加载 hexo server，边写边看真实效果）
- 图片：粘贴/拖拽自动保存到 `source/images` 并插入相对链接
- Markdown 工具栏；标签/分类选择器（读取已有数据，支持新建）
- 全局搜索（标题 + 正文）

### M3 · 站点配置、主题与插件管理（约 1.5–2 周）
- `_config.yml` 可视化编辑：常用字段表单化（站点名、语言、url、分页…）+ 带校验的原始 YAML 模式
- 主题管理：已装主题检测、一键切换、主题配置表单（`_config.<theme>.yml`）
- 主题获取：内置常见主题列表（GitHub/npm 拉取），离线时给手动安装指引
- 部署配置表单化（`deploy: type/repo/branch`），检测并提示安装 hexo-deployer-git
- 插件管理：识别 `package.json` 中 hexo-* 依赖，支持安装/卸载
- 命令面板：generate / clean / deploy / server 一键执行 + 实时日志终端；部署失败给中文排查提示
- **验收**：不打开命令行，完成「换主题 → 改配置 → 发布上线」全流程

### M4 · 打磨与分发准备（约 1–2 周）
- 多站点管理与切换（站点配置持久化到 userData）
- 应用设置：亮/暗主题、语言（中文优先，预留 i18n）、编辑器行为
- 托盘与关闭最小化；崩溃与运行日志落地（本地 log 文件）
- NSIS 安装包 + 便携版；预留 electron-updater 自动更新
- 自用速查文档 + 开源 README 骨架

## 6. 关键技术方案与风险

### 6.1 内嵌 Hexo（核心决策）
主进程直接 `require('hexo')`，以编程 API 驱动：

```ts
const hexo = new Hexo(siteDir, { silent: false });
await hexo.init();
await hexo.call('generate', {});        // 也可 'server' / 'deploy' / 'clean'
const posts = hexo.model('Post');       // 直接读文章/标签/分类数据模型
```

- Hexo 构造时传入站点目录，会**自动加载该站点 `node_modules` 里的 hexo-* 插件**（含渲染器），因此 HexoDeck 只需内置 hexo 核心，站点插件保持由站点目录提供，兼容用户已有环境
- 风险：hexo 编程 API 官方文档少 → 封装 `HexoService` 适配层、锁定 hexo 7.x、以源码为准做集成测试
- 打包：hexo 及依赖纳入 asar（必要时 `asarUnpack`），M0 就验证

### 6.2 真实主题预览
- 主进程以随机端口启动 `hexo call server`，Renderer 用 iframe/BrowserView 加载
- chokidar 监听文件变更 → 触发重载 → 预览自动更新；server 启动失败时回退到 markdown-it 分栏预览
- 端口冲突自动换端口并在界面提示

### 6.3 文章读写一致性
- 读：Hexo 数据模型（快、含分类标签关联）；写：统一走 PostService（gray-matter 解析 → 修改 → 写回），尽量保留原字段顺序
- 写入后通知 hexo 重载，保证模型、文件、预览三方一致

### 6.4 Windows 与中文环境
- 路径全部 `path` API 处理；读写强制 UTF-8；提供 CRLF/LF 选项
- 中文路径、中文标题（`permalink` 转义）在 M1 用 `F:\hexo` 实测

### 6.5 插件安装对 Node 的依赖
- 自用阶段：本机已装 Node，插件安装/卸载直接调用站点目录下的 npm 即可
- 开源阶段：检测用户机器无 Node 时，给出一键下载便携 Node 或降级为手动指引

### 6.6 性能与体积
- 安装包预计 90–120MB（Electron 基线），可接受
- 大站点：文章列表虚拟滚动、按需读取正文，避免全量扫盘

## 7. 目录结构（预定）

```
HexoDeck/
├─ src/
│  ├─ main/            # 主进程
│  │  ├─ services/     # §4 所列各 Service
│  │  ├─ ipc/          # IPC handler 注册
│  │  └─ index.ts
│  ├─ preload/         # contextBridge 暴露类型化 API
│  ├─ renderer/        # Vue 3
│  │  ├─ views/        # Site / Posts / Editor / Theme / Config / Settings
│  │  ├─ components/
│  │  ├─ stores/       # Pinia
│  │  └─ shared/       # 与 main 共享的 IPC 契约类型
├─ resources/          # 图标、hexo 新站点脚手架模板
├─ electron-builder.yml
└─ package.json
```

## 8. 下一步

1. 执行 **M0**：初始化脚手架 + 打包冒烟测试
2. 执行 **M1**：以 `F:\hexo` 为测试站点实现核心闭环
3. 每个里程碑结束做一次可运行验收，再进入下一个
