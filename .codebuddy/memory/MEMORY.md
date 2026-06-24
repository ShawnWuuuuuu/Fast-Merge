# 项目长期记忆 (MEMORY.md)

## 项目概况
- Fast-Merge：VS Code 扩展，GitLab 合并请求管理工具。
- 双层架构：扩展层（`src/`，Node.js + esbuild → `dist/extension.js`，CJS）+ WebView 层（`webview-ui/`，React 18 + Vite + Antd 5 + Less）。
- 两层仅通过 `postMessage` 通信，消息协议（请求-响应）定义在 `src/shared/WebviewMessage.ts`。

## 关键约定
- 包管理器：使用 **yarn**（见 `CLAUDE.md`）。根目录 `package-lock.json` 为旧项目遗留过时文件，勿依赖。
- 开发端口固定 25463（`src/shared/constant.ts`），修改需同步 `vite.config.ts` 与 `MyProvider.ts` CSP。
- 根 `tsconfig.json` 已 exclude `webview-ui`，两层类型检查独立。

## 核心模块
- 扩展层消息路由中心：`src/webview/MyProvider.ts`
- GitLab API 封装：`src/api/gitlab-service.ts`
- 配置存储：`{globalStorageUri}/fast-merge-config.json`，token 用 DES 加密（`src/utils/des.ts`）
- 前端通信 hook：`webview-ui/src/hooks/useGitLabApi.ts`（维护 responses/loading Map，按 requestType 匹配）
- WebView API 单例封装：`webview-ui/src/utils/vscode.ts`

## 打包
- `npm run package` = `build:webview` + `tsc --noEmit` + `esbuild.js --production`
- esbuild 会把 `webview-ui/build` 复制到 `dist/web/webview-ui`
- 扩展入口：`./dist/extension.js`

## 文档
- `CLAUDE.md`：Claude Code 指南（开发命令 + 架构图）
- `CODEBUDDY.md`：2026-06-22 新建，CodeBuddy 指南，内容基于 CLAUDE.md 并补充源码分析
