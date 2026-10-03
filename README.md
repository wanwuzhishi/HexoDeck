# HexoDeck

Hexo 图形化管理工具（Electron + Vue 3），写作、预览、发布全流程。开发计划见 [PLAN.md](./PLAN.md)。

## 开发

```bash
npm install
npm run setup:embed   # 安装内嵌 Hexo 引擎（resources/embed）
npm run dev
```

## 打包

```bash
npm run build:unpack  # 生成 win-unpacked（冒烟验证）
npm run build:win     # 生成 NSIS 安装包
```
