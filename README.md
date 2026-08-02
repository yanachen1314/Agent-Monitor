<div align="center" style="display: flex; flex-direction: column; align-items: center;">
  <img src="./AgentMonitorElectron/resources/icon.png" width="96" alt="Agent Monitor 图标">

# Agent Monitor

面向 Claude Code 与 Codex CLI 的本地单轮停止声音提醒工具。

[![Agent Monitor](https://img.shields.io/badge/yanachen1314-575757?logo=data:image/jpeg;base64,%2F9j%2F4AAQSkZJRgABAQEAYABgAAD%2F2wBDAAYEBQUFBAYFBQUHBgYHCQ8KCQgICRMNDgsPFhMXFxYTFRUYGyMeGBohGhUVHikfISQlJygnGB0rLismLiMmJyb%2F2wBDAQYHBwkICRIKChImGRUZJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJib%2FwAARCAAgACADASIAAhEBAxEB%2F8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL%2F8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4%2BTl5ufo6erx8vP09fb3%2BPn6%2F8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL%2F8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3%2BPn6%2F9oADAMBAAIRAxEAPwDltV164niSIEERqB90ZPFYdpFJe3q713S9Ys4ADds54NdM%2BgzbtyoRwOPwqNtEuVGdh46HFfZ1aMpxcT5nDV6dGcZb2ONlhKXCkoN77lLerDnp9CfyqMxusivjofSt2%2Fs5E1awtXh2O90gAVwxZWDA%2FKORyO9Ja29x9ru7eYpceXMwV4lOwpnj5uhPriuSKjz%2BzTOufM4e1e2n9fceyTazoh1RNOSe3Nw0QlMeTkJwCelQ32oWMaqIvs5ct0MmDivA9eurt9WGoxxukaW20SZ29Dk%2FhWHql%2FqB1DT76EsfKJ8p5VxlgOR71dTFKk9rnBTy5Tt7x3GveK7RvHdzHLHKk0M8cMQjClSAVzyfUHbn06VPpupy6RFcWUjRm28x2jjhHmeUT%2FDu6%2FSvOJdee6umnmzDMx3dmBOMcDHoBUUl7N5hdLhgZDyF4zXjxnyVvaxff8T6GaU8L9XktrWfysf%2F2Q%3D%3D&logoColor=white)](https://github.com/yanachen1314)
[![GitHub](https://img.shields.io/badge/GitHub-Agent--Monitor-181717?logo=github&logoColor=white)](https://github.com/yanachen1314/Agent-Monitor)
[![Gitee](https://img.shields.io/badge/Gitee-Agent--Monitor-C71D23?logo=gitee&logoColor=white)](https://gitee.com/yanachen1314/agent-monitor)
[![License: MIT](https://img.shields.io/badge/License-MIT-2ea44f.svg)](./LICENSE)
[![Electron 43](https://img.shields.io/badge/Electron-43-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Vue 3](https://img.shields.io/badge/Vue-3-42B883?logo=vuedotjs&logoColor=white)](https://vuejs.org/)

</div>

## 项目简介

Agent Monitor 是一个运行于 Windows 和 macOS 的 Electron 托盘应用。它通过 Claude Code
与 Codex CLI 的官方 `Stop` Hook 感知一轮 Agent 执行停止，并及时播放本地提示音，让你在
处理其他工作时不必反复查看终端。

提醒仅表示当前一轮 Agent 执行已经停止，不代表整个任务或目标已经完成。

## 功能特性

- 同时监控 Claude Code 与 Codex CLI。
- 支持默认提示音和独立的自定义提示音。
- 支持音量调整、提示音试听和恢复默认音频。
- 支持启用、检测、预览及修复 Stop Hook。
- 支持全局暂停提醒，不影响 Stop 事件接收。
- 支持开机自动启动和关闭窗口后驻留系统托盘。
- 展示最近一次提醒与近期活动。
- 所有监听、状态处理和音频播放均在本地完成。

## 技术栈

- Electron 43
- Vue 3
- TypeScript
- electron-vite
- Less
- Vitest
- electron-builder

## 快速开始

请先安装 Node.js 和 npm，然后执行：

```powershell
git clone https://github.com/yanachen1314/Agent-Monitor.git
Set-Location Agent-Monitor\AgentMonitorElectron
npm install
npm run dev
```

也可以从 Gitee 克隆：

```powershell
git clone https://gitee.com/yanachen1314/agent-monitor.git
Set-Location agent-monitor\AgentMonitorElectron
npm install
npm run dev
```

## 使用说明

1. 启动 Agent Monitor 并进入“设置”页面。
2. 为 Claude Code 或 Codex CLI 配置 Stop Hook。
3. 启用需要监控的 CLI，并选择默认或自定义提示音。
4. 保持应用运行或最小化至系统托盘。
5. Agent 单轮停止后，应用会播放提示音并更新最近活动。

首次配置或 Hook 命令发生变化后，Codex 会要求重新审查并信任新的 Hook 定义。请在
Codex Desktop 的 Hook 设置中确认，或在 Codex CLI 中使用 `/hooks` 完成审查。

## 版本记录

各版本的更新说明见 [CHANGELOG.md](CHANGELOG.md)。

## Hook 工作原理与平台差异

Agent Monitor 只监听官方 `Stop` 生命周期事件。Hook 从标准输入读取事件，向本机运行的
Agent Monitor 投递一个最小化的 `turnStopped` 消息，然后向 CLI 返回成功结果。通知失败不会
阻塞或改变 Agent 的正常回复。

常用配置文件位置：

| 客户端      | 配置文件                                                          |
| ----------- | ----------------------------------------------------------------- |
| Claude Code | `%USERPROFILE%\.claude\settings.json`                             |
| Codex       | `%CODEX_HOME%\hooks.json`；默认 `%USERPROFILE%\.codex\hooks.json` |

Windows 下由应用自动生成的命令示例：

```text
Claude: "C:/Users/<用户名>/.codex/agent-monitor/AgentMonitorHook.exe" claude
Codex:  C:\Users\<用户名>\.codex\agent-monitor\AgentMonitorHook.exe codex
```

不要手动将 Claude 命令改回反斜杠路径。Claude Code 在 Windows 上通过 Bash 执行 Hook，未正确
处理的反斜杠会被当作转义字符，产生类似 `C:Users...: command not found` 的错误。

Windows 的本地事件链路如下：

1. Agent Monitor 启动后，在 `%TEMP%\agent-monitor-ipc\runtime.json` 写入进程信息、事件目录和
   每次启动随机生成的 Token，并持续更新文件时间作为心跳。
2. Hook Runner 验证运行时文件和心跳，将带 Token 的事件原子写入
   `%TEMP%\agent-monitor-ipc\inbox\`。
3. Agent Monitor 轮询并校验事件，消费后立即删除事件文件，再根据启用、暂停和音频设置决定
   是否播放提示音。

macOS 等非 Windows 平台仍通过随机端口连接本机 `127.0.0.1`，并使用相同的随机 Token 校验。

## 常见问题

### 点击“配置 Hook”提示 `HOOK_CONFIG_INVALID`

- 请先升级到 `0.2.0` 或更高版本；该版本已支持空白和 0 字节 `hooks.json`。
- 如果文件包含内容，则代表 JSON 确实无法解析。请检查尾随逗号、缺失括号或手工编辑造成的
  格式问题。Agent Monitor 不会自动覆盖真正损坏的配置。
- Hook 每次安装或修复前都会在应用数据目录的备份文件夹中保存原配置。

### Codex 显示 `Stop hook (failed)` 或没有执行 Hook

- 确认 Hook 指向 `%USERPROFILE%\.codex\agent-monitor\AgentMonitorHook.exe`，而不是安装目录下的
  `Program Files\AgentMonitor\...`。Codex Windows 沙箱可能无法启动后者。
- Hook 定义更新后，需要在 Codex Desktop 设置或 CLI `/hooks` 中重新信任。
- 确认 Agent Monitor 正在运行；任务栏窗口关闭后，应用通常仍驻留在系统托盘。

### Claude Code 显示 `/usr/bin/bash ... command not found`

- 确认 Claude Hook 使用带引号的正斜杠路径，例如
  `"C:/Users/<用户名>/.codex/agent-monitor/AgentMonitorHook.exe" claude`。
- 在 Agent Monitor 中点击“修复 Hook”，或重启 `0.2.0` 及以上版本让应用自动迁移旧命令。
- 修改配置后请新建或重启 Claude Code 会话，使其重新加载 Hook。

### Hook 成功但没有声音

- 检查对应的 Claude/Codex 任务监控开关、全局暂停开关和音量。
- 使用“试听”确认当前音频文件可以播放；自定义音频失效时可切回默认音频。
- 打开日志目录，确认是否出现 `收到 codex 单轮停止事件：ACCEPTED` 或
  `收到 claude 单轮停止事件：ACCEPTED`。

## 开发与检查

所有开发命令均在 `AgentMonitorElectron` 目录执行：

```powershell
npm run dev
npm run typecheck
npm run lint
npm test
npm run format:check
npm run build
```

## 构建安装包

Windows NSIS 安装包：

```powershell
$env:AGENT_MONITOR_GCC = 'C:\path\to\mingw64\bin\gcc.exe'
npm run build:win
```

Windows 构建需要可用的 64 位 MinGW GCC，用于编译无 CLR 依赖的 Hook Runner。可通过
`AGENT_MONITOR_GCC` 指定 `gcc.exe` 的绝对路径。

macOS DMG 安装包：

```bash
npm run build:mac
```

在 Mac 上构建或发布前，请阅读
[macOS 构建、测试与运行指南](./macos-guide)。该文档包含 Apple Silicon/Intel
架构、签名与公证、Hook/IPC 验证、登录启动以及当前已知的 macOS 风险清单。

构建产物默认输出到 `AgentMonitorElectron/release/`。

## 项目结构

```text
Agent-Monitor/
├── AgentMonitorElectron/
│   ├── resources/        # 应用图标、内置音频和原生 Hook Runner
│   ├── scripts/          # Hook Runner 与安装包构建脚本
│   ├── src/
│   │   ├── hook/         # Stop Hook 客户端
│   │   ├── main/         # Electron 主进程
│   │   ├── preload/      # 安全的渲染进程桥接
│   │   ├── renderer/     # Vue 用户界面
│   │   └── shared/       # 共享类型与 IPC 通道
│   └── tests/            # 自动化测试
├── LICENSE
└── README.md
```

## 安全与隐私

- Renderer 禁用 Node.js，并启用 `contextIsolation` 和沙箱。
- Preload 仅向界面暴露固定白名单 API。
- Windows Hook 通过 `%TEMP%` 下的本机文件队列通信，其他平台仅连接 `127.0.0.1`；两者都使用
  当前进程随机生成的 Token，并校验运行时心跳。
- Windows 事件文件采用临时文件写入后原子重命名的方式发布，消费完成后立即删除。
- 不记录或传输 Prompt、完整回复、Transcript 或用户代码。
- Hook Runner 只转发 Stop 事件；监控链路异常时仍向 Claude Code 或 Codex 返回成功，避免提醒工具
  干扰用户任务。
- GitHub 与 Gitee 入口只能打开应用内预设的固定仓库地址。

## 开源协议

本项目基于 [MIT License](./LICENSE) 开源。
