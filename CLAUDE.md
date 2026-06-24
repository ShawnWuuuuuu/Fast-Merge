# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Fast Merge 是一个 VS Code 扩展，用于管理 GitLab 合并请求。提供图形化界面简化代码合并流程，支持分支合并、Cherry Pick、冲突检测等功能。

## 开发命令

### 安装依赖
```bash
# 根目录
yarn

# webview-ui 目录
cd webview-ui && yarn
```

### 开发调试
```bash
# 启动 webview 开发服务器（端口 25463）
npm run dev:webview

# 然后按 F5 启动扩展调试
# src/ 目录下的修改需要重载页面（Windows: Ctrl+R, Mac: Cmd+R）
# webview-ui/ 目录下的修改支持热重载
```

### 构建打包
```bash
# 完整构建（包含 webview 和扩展）
npm run package

# 仅构建 webview
npm run build:webview

# 打包扩展为 .vsix 文件
# 需要先安装: npm i -g vsce
vsce package
```

### 监听模式
```bash
# 同时监听扩展和类型检查
npm run watch
```

## 架构说明

### 双层架构

项目采用 **扩展层 + WebView 层** 的双层架构：

```
┌─────────────────────────────────────────────────────┐
│              VS Code Extension (Node.js)            │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │ extension.ts│  │ MyProvider   │  │ GitLab     │ │
│  │ (入口)      │←→│ (消息路由)   │←→│ Service    │ │
│  └─────────────┘  └──────────────┘  └────────────┘ │
└────────────────────────┬────────────────────────────┘
                         │ postMessage
                         ↓
┌─────────────────────────────────────────────────────┐
│              WebView UI (React + Vite)              │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │ App.tsx     │  │ Components   │  │ Hooks      │ │
│  │ (路由)      │  │ (UI组件)     │  │ (状态管理) │ │
│  └─────────────┘  └──────────────┘  └────────────┘ │
└─────────────────────────────────────────────────────┘
```

### 核心模块职责

**扩展层 (`src/`)**
- `extension.ts` - 扩展入口，注册 WebviewViewProvider
- `webview/MyProvider.ts` - 核心：消息路由中心，处理所有 webview 通信
- `api/gitlab-service.ts` - GitLab API 封装，处理合并请求、分支、提交等操作
- `api/http-client.ts` - HTTP 客户端，处理认证和请求
- `utils/config-manager.ts` - 配置管理，读写 `fast-merge-config.json`
- `utils/git-utils.ts` - 本地 Git 仓库信息获取
- `shared/WebviewMessage.ts` - 消息类型定义，所有通信消息的类型声明

**WebView 层 (`webview-ui/src/`)**
- `App.tsx` - 根组件，根据配置状态显示配置页或主界面
- `pages/` - 页面组件：home（主页）、merge（合并）、history（历史记录）
- `components/` - 业务组件：GitLabConfig、BranchSelector、CommitSelector、MergeStatus
- `hooks/` - 自定义 hooks：useConfig、useGitLabApi
- `utils/vscode.ts` - VS Code API 封装，提供 postMessage 通信能力

### 消息通信机制

扩展层和 WebView 层通过 `postMessage` 进行异步通信，采用请求-响应模式：

```typescript
// WebView 发送请求
vscode.postMessage({ type: 'gitlab:getProjects', message: { search: 'keyword' } })

// 扩展层处理并响应
case 'gitlab:getProjects':
  const projects = await this.gitLabService.getProjects(...)
  this.sendResponse({ requestType: 'gitlab:getProjects', success: true, data: projects })
```

所有消息类型定义在 `src/shared/WebviewMessage.ts`，修改时需同步更新类型。

### 配置管理

配置存储在 VS Code 全局存储目录：
- 路径：`context.globalStorageUri/fsPath/fast-merge-config.json`
- 结构：`{ gitlab: { baseUrl, token, projectId, showHash } }`
- 加密：token 使用 DES 加密存储

### 开发环境 vs 生产环境

`MyProvider.ts` 根据扩展模式返回不同的 HTML：
- **开发模式**：加载 Vite 开发服务器（`localhost:25463`），支持 HMR
- **生产模式**：加载构建后的静态资源（`webview-ui/build/`）

## 关键实现细节

### 异步冲突检测

创建 MR 后启动异步轮询检查冲突状态（`startAsyncConflictCheck`），通过 `gitlab:conflictStatusUpdate` 消息通知前端更新 UI。

### Cherry Pick 批量操作

`createCherryPickMergeRequests` 支持对多个目标分支和提交创建批量 MR，每个 MR 独立处理并启动冲突检测。

### WebView API 单例

在 HTML 中通过覆盖 `acquireVsCodeApi` 函数确保全局只有一个 VS Code API 实例，避免重复调用导致的状态丢失。

## 端口配置

开发服务器固定端口：`LOCAL_PORT = 25463`（定义在 `src/shared/constant.ts`）

如需修改，需同步更新：
1. `src/shared/constant.ts`
2. `webview-ui/vite.config.ts`
3. `src/webview/MyProvider.ts` 中的 CSP 配置
