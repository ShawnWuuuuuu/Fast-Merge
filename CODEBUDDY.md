# CODEBUDDY.md This file provides guidance to CodeBuddy when working with code in this repository.

## 项目概述

Fast Merge 是一个 VS Code 扩展，用于管理 GitLab 合并请求。提供图形化界面简化代码合并流程，支持分支合并、Cherry Pick（多目标分支 + 多提交批量）、异步冲突检测、历史记录、一键打开/复制 MR 链接等功能。

## 开发命令

项目为双 `package.json` 结构：根目录（扩展层）与 `webview-ui/`（前端层）各自独立管理依赖。按 `CLAUDE.md` 约定使用 **yarn** 安装依赖。

### 安装依赖
```bash
# 根目录（扩展层）
yarn

# webview-ui 目录（前端层，需单独安装）
cd webview-ui && yarn
```

### 开发调试
```bash
# 1. 启动 webview 开发服务器（Vite，固定端口 25463，支持 HMR）
npm run dev:webview

# 2. 在 VS Code 中按 F5 启动扩展调试（Extension Development Host）
#    src/ 修改后需在宿主窗口重载（Ctrl+R / Cmd+R）；webview-ui/ 修改支持热重载
```

### 监听与构建
```bash
# 同时监听扩展打包（esbuild）与类型检查（tsc --noEmit）
npm run watch

# 完整构建（webview 构建 + tsc 类型检查 + esbuild 生产打包）
npm run package

# 仅构建 webview（产物输出到 webview-ui/build/）
npm run build:webview

# 打包为 .vsix（需先 npm i -g vsce）
vsce package
```

### 类型检查
根目录 `tsc --noEmit` 由 `package` 与 `watch` 脚本触发；`webview-ui` 使用 `tsc -b`（项目引用：`tsconfig.app.json` + `tsconfig.node.json`）。根 `tsconfig.json` 已 `exclude` 掉 `webview-ui`，两层类型检查互不干扰。

## 架构说明

### 双层架构

项目采用 **扩展层（Node.js）+ WebView 层（React + Vite）** 的双层架构，两层运行在不同环境，仅通过 `postMessage` 通信。

```
┌─────────────────────────────────────────────────────┐
│              VS Code Extension (Node.js)            │
│  extension.ts → MyProvider → GitLabService          │
│                            → ConfigManager          │
└────────────────────────┬────────────────────────────┘
                         │ postMessage (请求-响应)
                         ↓
┌─────────────────────────────────────────────────────┐
│              WebView UI (React + Vite + Antd)       │
│  App.tsx → pages/ → components/ → hooks/            │
└─────────────────────────────────────────────────────┘
```

### 扩展层 (`src/`)

- `extension.ts` — 扩展入口，注册 `WebviewViewProvider`（`fast-merge.SidebarProvider`），在活动栏注册侧边栏视图。
- `webview/MyProvider.ts` — **核心消息路由中心**。实现 `WebviewViewProvider`，监听 webview 发来的所有消息，按 `type` 分发到 `GitLabService` 或 `ConfigManager`，并把结果通过 `sendResponse` 回传。同时负责根据扩展模式（开发/生产）生成注入 webview 的 HTML。
- `api/gitlab-service.ts` — GitLab REST API 封装，处理项目、分支、提交查询，创建 MR / Cherry Pick MR，关闭 MR，异步冲突轮询等。
- `api/http-client.ts` — HTTP 客户端，统一处理 GitLab Private-Token 认证与请求。
- `utils/config-manager.ts` — 读写 `fast-merge-config.json`（位于 `context.globalStorageUri`），管理 GitLab 配置。
- `utils/des.ts` — DES 加密工具，用于加密存储 token。
- `utils/git-utils.ts` — 从本地工作区 Git 仓库提取 remote URL 等信息，用于自动识别当前项目。
- `shared/WebviewMessage.ts` — **所有跨层通信消息的类型定义**（请求与响应）。修改通信协议时必须同步更新此文件。
- `shared/gitlab-types.ts` — GitLab 相关领域模型类型（项目、分支、提交、MR、Cherry Pick 选项与结果等）。
- `shared/constant.ts` — 共享常量，目前定义开发服务器端口 `LOCAL_PORT = 25463`。

### WebView 层 (`webview-ui/src/`)

技术栈：React 18 + TypeScript + Vite + Ant Design 5 + Less。Vite 配置中 `@/*` 别名指向 `src/*`。

- `App.tsx` — 根组件，根据配置状态在「配置页」与「主界面」间切换。
- `pages/` — 页面：`home.tsx`（主页）、`merge/`（合并请求）、`history/`（历史记录）、`devops/`。
- `components/` — 业务组件：`GitLabConfig`、`ProjectSelector`、`BranchSelector`、`CommitSelector`、`MergeStatus`。
- `hooks/useGitLabApi.ts` — **前端通信核心**。封装所有对扩展层的请求，内部维护 `responses` / `loading` 两个 Map，按 `requestType` 作为 key 匹配响应；同时监听 `gitlab:conflictStatusUpdate` 推送消息并就地更新对应 MR 状态。对外暴露 `projectsState`、`branchesState`、`commitsState`、`mergeRequestState`、`cherryPickState` 等便捷状态获取器。
- `hooks/useConfig.ts` — 配置状态管理。
- `utils/vscode.ts` — `VSCodeAPIWrapper` 单例，封装 `acquireVsCodeApi()` 的 `postMessage` / `getState` / `setState`，在非 webview 环境（如浏览器开发）降级到 `console` / `localStorage`。

### 消息通信机制（关键）

两层通过 `postMessage` 异步通信，采用 **请求-响应** 模式：

1. WebView 调用 `useGitLabApi` 暴露的方法（如 `getProjects()`），内部 `sendRequest(type, message)` 通过 `vscode.postMessage` 发出请求，并把对应 `type` 的 loading 置 true、清空旧响应。
2. 扩展层 `MyProvider` 收到消息，按 `type` 路由到 service，处理完成后调用 `sendResponse({ requestType, success, data, error, options })`。
3. WebView 的 `useGitLabApi` 监听 `message` 事件，当 `type === 'response'` 时按 `requestType` 写回 `responses` Map，组件通过 `getApiState<T>(requestType)` 读取结果。

除请求-响应外，扩展层会主动推送 `gitlab:conflictStatusUpdate` 消息（见下），`useGitLabApi` 会单独处理这类推送并就地更新已有 MR 状态。

所有消息 `type` 字段是协议契约，定义在 `src/shared/WebviewMessage.ts`。新增/修改消息类型时，需同步：`WebviewMessage.ts` 类型 → `MyProvider.ts` 路由 case → `useGitLabApi.ts` 方法与状态获取器。

### 关键实现细节

**异步冲突检测**：创建 MR 后，`GitLabService` 启动异步轮询（`startAsyncConflictCheck`），定时查询 MR 的 `has_conflicts` 状态，完成后通过 `gitlab:conflictStatusUpdate` 消息主动推送给前端，前端在 `useGitLabApi` 中按 `mergeRequestIid` 匹配并更新对应 MR 的 `conflictCheckStatus`。

**Cherry Pick 批量操作**：`createCherryPickMergeRequests` 支持对「多个目标分支 × 多个提交」创建批量 MR，每个 MR 独立处理并各自启动冲突检测，结果以数组形式返回。

**WebView API 单例**：在 `MyProvider` 注入的 HTML 中覆盖 `acquireVsCodeApi`，确保全局只有一个 VS Code API 实例，避免重复调用导致状态丢失。

### 配置存储

- 路径：`{context.globalStorageUri.fsPath}/fast-merge-config.json`
- 结构：`{ gitlab: { baseUrl, token, projectId, showHash } }`
- `token` 使用 DES 加密存储（`utils/des.ts`）
- `showHash` 控制提交列表是否显示 commit hash

### 开发模式 vs 生产模式

`MyProvider.ts` 根据扩展运行模式返回不同的 HTML：
- **开发模式**：加载 Vite 开发服务器 `http://localhost:25463`，支持 HMR，CSP 需放行该来源。
- **生产模式**：加载 `webview-ui/build/` 下的静态资源；`esbuild.js` 会在打包扩展时把 `webview-ui/build` 复制到 `dist/web/webview-ui`。

### 端口配置

开发服务器固定端口 `LOCAL_PORT = 25463`（定义于 `src/shared/constant.ts`）。修改端口需同步：
1. `src/shared/constant.ts`
2. `webview-ui/vite.config.ts`
3. `src/webview/MyProvider.ts` 中的 CSP 配置

## 打包流程

`npm run package` 执行顺序（见根 `package.json` 的 `scripts.package`）：
1. `build:webview` — `cd webview-ui && npm run build`（先 `tsc -b` 再 `vite build`，产物在 `webview-ui/build/`）
2. `tsc --noEmit` — 根目录扩展层类型检查
3. `node esbuild.js --production` — 把 `src/extension.ts` 打包为 `dist/extension.js`（CJS，`vscode` 作为 external），并把 `webview-ui/build` 复制到 `dist/web/webview-ui`

扩展入口：`./dist/extension.js`（见 `package.json` 的 `main` 字段）。
