# Agent Monitor

Agent Monitor 是一个 Windows/macOS 托盘应用。Claude Code 或 Codex CLI 的官方
`Stop` Hook 在一轮 Agent 执行停止后通知 Electron 主进程，应用据此播放本地提示音。

## 技术栈

- Electron 43
- electron-vite 5
- Vue 3 + TypeScript
- Less
- Web Audio API
- Vitest
- electron-builder

## 开发

```powershell
npm install
npm run dev
```

质量检查：

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

构建 Windows 安装包：

```powershell
npm run build:win
```

## 安全边界

- Renderer 禁用 Node.js，启用 `contextIsolation` 和 `sandbox`。
- Preload 仅暴露固定白名单 API。
- Windows Hook 使用本机命名管道，其他平台只连接 `127.0.0.1`；两者都使用当前进程随机 Token。
- 不记录或传输 Prompt、完整回复、transcript 和用户代码。
- Hook 失败时输出简短错误并快速退出，不会阻塞 Claude Code 或 Codex 的任务执行。
