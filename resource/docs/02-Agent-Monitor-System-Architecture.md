# Agent Monitor 系统架构设计文档

## 1. 文档信息

| 项目 | 内容 |
|---|---|
| 文档名称 | Agent Monitor 系统架构设计文档 |
| 文档版本 | V1.1 |
| 关联 PRD | Agent Monitor PRD V1.1 |
| 目标平台 | Windows 10/11、macOS 13+ |
| 桌面框架 | Electron |
| 构建工具 | electron-vite、electron-builder |
| 界面技术 | Vue 3、TypeScript、Less、CSS Variables |
| 核心运行时 | Electron Main Process、Node.js |
| 音频组件 | Web Audio API、HTMLAudioElement |
| IPC | localhost TCP + 随机 Token |
| 配置存储 | 本地 JSON |
| 支持 CLI | Claude Code、Codex CLI |

## 2. 架构目标

1. Claude Code 或 Codex CLI 的一轮 Agent 执行停止后，在 1 秒内开始播放提示音。
2. 使用两类 CLI 的官方生命周期 Hook，不解析终端文本、不轮询日志。
3. Hook 脚本失败不得影响 CLI 主流程。
4. Claude 和 Codex 配置相互独立。
5. 默认音频和自定义音频统一解析。
6. 桌面应用低资源后台运行，空闲 CPU 目标低于 1%，空闲私有内存目标不超过 300 MB。
7. Windows 与 macOS 共用绝大部分 TypeScript 和 Vue 代码。
8. Renderer 不直接访问 Node.js、文件系统或任意系统命令。
9. 配置、音频、IPC 异常均不得导致应用崩溃。
10. 预留免打扰、项目级规则、最近活动等扩展能力。

## 3. 事件语义

协议事件 `turnStopped` 表示：

> Claude Code 或 Codex CLI 的主 Agent 一轮执行已经停止或本轮响应已经结束，CLI 可能正在等待用户查看结果或继续操作。

该事件不代表用户的整体业务目标已经完成，也不代表 CLI 进程已经退出。

## 4. 总体架构

```text
Claude Code / Codex CLI
          │ 官方 Stop Hook / stdin JSON
          ▼
Agent Monitor Hook Script / Hook Runner
          │ localhost TCP / 单行 JSON / Token
          ▼
Electron Main Process
          ├── IPC Server
          ├── Event Processor
          ├── Audio Resolver
          ├── Audio Queue
          ├── Config Manager
          ├── Hook Manager
          ├── Tray Manager
          ├── Startup Manager
          └── Logging
                    │ 受限 Electron IPC
                    ▼
              Preload Bridge
                    │
                    ▼
          Vue Renderer / Audio Runtime
```

## 5. 进程与组件设计

### 5.1 Electron 主进程

主进程负责：

- 应用单实例。
- 系统托盘和窗口生命周期。
- 配置读取、校验、迁移和原子写入。
- localhost TCP 服务。
- Token、协议和字段校验。
- 事件过滤、去重和合并。
- 音频路径解析和播放队列。
- Claude Code、Codex CLI Hook 安装、检测和修复。
- 开机启动。
- 本地诊断日志。

主进程不负责：

- 启动、暂停或控制 Claude Code/Codex CLI。
- 判断整体业务目标是否完成。
- 读取代码或完整 transcript。
- 上传数据。

### 5.2 Hook 脚本与 Hook Runner

Claude Code 和 Codex CLI 的官方 Hook 配置调用 Agent Monitor 提供的脚本：

```text
agent-monitor-hook claude
agent-monitor-hook codex
```

开发阶段可直接运行 TypeScript 编译后的 Node.js 脚本。正式发布时打包为用户无需安装 Node.js 即可执行的 Hook Runner：

```text
Windows: agent-monitor-hook.exe
macOS: agent-monitor-hook
```

职责：

1. 校验来源参数。
2. 限量读取 stdin JSON。
3. 将 Claude/Codex Hook 数据转换为标准 `turnStopped` 事件。
4. 从固定位置读取 `runtime.json`。
5. 向 Electron 主进程的 localhost TCP 服务发送事件。
6. 快速退出。

Hook 脚本不播放音频、不显示 UI、不修改 CLI 配置、不访问业务网络、不保存原始输入。桌面应用未运行或 IPC 失败时正常退出，不影响原 CLI。

### 5.3 Preload Bridge

Preload 使用 `contextBridge` 暴露最小、类型化 API：

```text
window.agentMonitor.getConfig()
window.agentMonitor.updateMonitor()
window.agentMonitor.updateAudioMode()
window.agentMonitor.updateVolume()
window.agentMonitor.importAudio()
window.agentMonitor.previewAudio()
window.agentMonitor.getHookStatus()
window.agentMonitor.repairHook()
window.agentMonitor.setAutostart()
window.agentMonitor.onRuntimeStateChanged()
window.agentMonitor.onAudioCommand()
```

禁止向 Renderer 暴露 `ipcRenderer`、`fs`、`child_process`、`shell` 或任意 Channel 调用能力。

### 5.4 Vue Renderer

主要页面组件：

```text
App
├── HomeView
│   ├── RuntimeStatusCard
│   ├── LastStoppedEventCard
│   ├── DefaultAudioCard
│   └── RecentActivityCard
└── SettingsView
    ├── ReminderSettingsCard
    ├── ClaudeMonitorCard
    ├── CodexMonitorCard
    ├── GeneralSettingsCard
    └── AboutCard
```

Renderer 同时承载音频运行时。窗口关闭到托盘时仅隐藏，不销毁；开机静默启动时创建但不显示窗口，因此 Web Audio 仍可接收主进程发来的播放命令。

页面组件使用 Vue 单文件组件自主实现，不引入 Element Plus、Ant Design Vue、Tailwind CSS 等第三方 UI 或原子化样式框架。样式使用 Less 管理，设计 Token 统一定义品牌色、状态色、文字色、背景、边框、间距、圆角、阴影和动效；运行期需要变化的样式值使用 CSS Variables。

建议样式目录：

```text
src/renderer/src/styles/
├── tokens.less
├── themes.less
├── mixins.less
├── animations.less
├── reset.less
└── global.less
```

职责：

- `tokens.less`：颜色、字体、间距、圆角、阴影和层级。
- `themes.less`：主题级变量映射。
- `mixins.less`：卡片、按钮、输入框和玻璃质感等复用样式。
- `animations.less`：页面进入、状态切换和控件反馈动画。
- `reset.less`：浏览器默认样式重置。
- `global.less`：应用级布局和通用辅助类。

## 6. 建议目录结构

```text
AgentMonitorElectron/
├── src/
│   ├── main/
│   │   ├── index.ts
│   │   ├── app-state.ts
│   │   ├── config/
│   │   ├── ipc/
│   │   ├── events/
│   │   ├── audio/
│   │   ├── hooks/
│   │   ├── tray/
│   │   ├── startup/
│   │   └── logging/
│   ├── preload/
│   │   ├── index.ts
│   │   └── api.ts
│   ├── renderer/
│   │   ├── index.html
│   │   └── src/
│   │       ├── components/
│   │       ├── views/
│   │       └── styles/
│   └── hook/
│       ├── index.ts
│       ├── adapters/
│       └── tcp-client.ts
├── resources/
│   ├── audio/
│   ├── icons/
│   └── hook/
├── tests/
├── electron.vite.config.ts
├── electron-builder.yml
├── package.json
└── .github/workflows/
```

## 7. 应用状态模型

```ts
interface AppState {
  config: AppConfig
  runtime: IpcRuntime | null
  hookStatus: {
    claude: HookStatus
    codex: HookStatus
  }
  globalPaused: boolean
  recentEvents: StoppedEventSummary[]
}
```

主进程持有权威状态。Renderer 只读取状态快照或发起受限更新请求。

## 8. 配置模型

```ts
interface AppConfig {
  version: number
  defaultAudio: {
    source: 'builtin' | 'imported'
    path: string
    volume: number
  }
  monitors: {
    claude: CliMonitorConfig
    codex: CliMonitorConfig
  }
  globalPaused: boolean
  autoStart: boolean
  closeToTray: boolean
}

interface CliMonitorConfig {
  enabled: boolean
  audioMode: 'default' | 'custom'
  customAudioPath: string | null
}
```

约束：

- `volume` 范围为 `0..1`。
- 自定义音频无效时回退默认音频。
- 默认音频无效时回退内置音频。
- 使用 JSON Schema 或 Zod 做运行时校验。
- 忽略未知字段，并通过 `version` 执行迁移。

## 9. 配置存储

```text
Windows:
%APPDATA%\AgentMonitor\

macOS:
~/Library/Application Support/AgentMonitor/
```

```text
AgentMonitor/
├── config.json
├── runtime.json
├── audio/
├── backups/
└── logs/
```

原子写入流程：

```text
写入 config.json.tmp
→ fsync
→ 原子替换 config.json
```

配置损坏时备份原文件、加载默认配置并向 Renderer 返回结构化警告。

## 10. 标准事件

```ts
interface TurnStoppedEvent {
  version: 1
  source: 'claude' | 'codex'
  eventType: 'turnStopped'
  sessionId: string | null
  turnId: string | null
  cwd: string | null
  timestamp: number
}
```

IPC 不传输 Prompt、完整回复、transcript、代码、工具参数或 Git 信息。

## 11. 事件处理流水线

```text
TCP 接收
→ 请求大小限制
→ JSON 和协议版本校验
→ Token 校验
→ 事件字段校验
→ 过期事件过滤
→ 全局暂停判断
→ CLI 独立开关判断
→ 去重
→ 1 秒合并窗口
→ 音频解析
→ 有界播放队列
→ Renderer 播放
```

去重优先键：

```text
source + sessionId + turnId + eventType
```

无可靠 `turnId` 时使用：

```text
source + sessionId + eventType + 3秒时间桶
```

缓存每 60 秒清理一次，最长保留 5 分钟，最多 1000 条。

## 12. 音频设计

### 12.1 音频解析

```ts
interface ResolvedAudio {
  path: string
  volume: number
  fallbackUsed: boolean
}
```

解析顺序：

1. 对应 CLI 监控关闭时忽略。
2. 默认模式使用全局默认音频。
3. 自定义模式且文件有效时使用自定义音频。
4. 自定义音频无效时回退全局默认音频。
5. 默认音频无效时回退安装包内置音频。

### 12.2 导入规则

1. 使用 Electron `dialog.showOpenDialog` 选择文件。
2. 校验扩展名、大小和可读性。
3. 复制到应用数据目录。
4. Renderer 试听并确认可以解码。
5. 原子更新配置。
6. 清理被替换的旧内部文件。

### 12.3 播放队列

主进程维护有界队列，同一时间只派发一个播放命令。Renderer 使用 Web Audio API 或 HTMLAudioElement 播放，并向主进程回传 `started`、`ended` 或 `failed`。

音频设备变化、格式解码失败和 Renderer 重载均不得导致主进程退出。

## 13. localhost IPC

Electron 主进程动态绑定 `127.0.0.1`，并写入：

```json
{
  "version": 1,
  "host": "127.0.0.1",
  "port": 43821,
  "token": "随机令牌",
  "pid": 12345,
  "startedAt": 1785220000000
}
```

要求：

- 仅绑定 `127.0.0.1`。
- 动态端口。
- 单连接单事件。
- 单请求最大 64 KB。
- 读写短超时。
- 使用定长比较或安全比较验证 Token。
- 应用退出时删除 `runtime.json`。
- Hook Runner 不接受外部指定 host、port 或音频路径。

## 14. Hook 管理

### 14.1 Claude Code

- 定位 Claude Code 官方配置目录。
- 检测官方 `Stop` Hook 配置。
- 保留用户已有 Hook。
- 写入前备份。
- 合并 Agent Monitor Hook。
- 识别重复配置。
- 原子写回。

### 14.2 Codex CLI

- 定位 Codex CLI 官方配置目录。
- 检测官方 `Stop` Hook 配置及信任状态。
- 保留用户已有 Hook。
- 写入前备份。
- 合并并验证 Agent Monitor Hook。

Hook 始终保留。应用中的 Claude/Codex 监控开关只决定是否提醒，避免反复修改 CLI 配置。

## 15. Electron IPC API

Renderer 仅允许调用固定 API：

```text
config:get
config:update-monitor
config:update-audio-mode
config:update-volume
audio:import
audio:preview
audio:restore-builtin
hooks:get-status
hooks:install
hooks:repair
autostart:get
autostart:set
logs:open-directory
logs:clear
app:get-runtime-state
```

每个 Channel 必须校验来源窗口和参数，不接受任意文件路径、任意 Channel 或任意系统命令。

## 16. 窗口、托盘与单实例

- 使用 `app.requestSingleInstanceLock()` 保证单实例。
- 第二次启动时激活已有设置窗口。
- 用户关闭窗口时默认隐藏到托盘。
- 只有托盘“退出”才设置退出标记、关闭 IPC、删除 runtime 文件并结束进程。
- 托盘菜单包含监控状态、测试提示音、打开设置、暂停全部监控和退出。
- `app.setLoginItemSettings()` 管理 Windows/macOS 登录启动。
- 开机启动参数包含 `--hidden`，启动后不显示设置窗口。

## 17. Electron 安全基线

```ts
webPreferences: {
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true,
  preload: preloadPath
}
```

同时要求：

- 使用严格 CSP。
- 禁止导航到外部页面。
- 禁止新建任意窗口。
- 禁止 Renderer 直接访问 Node.js。
- Preload 只暴露白名单 API。
- 不使用 `remote`。
- 不记录 Token、Prompt、回复、代码和完整 Hook 输入。
- 不在 IPC 中接收任意命令、任意音频路径或任意配置对象。

## 18. 启动与退出流程

启动：

```text
单实例检查
→ 初始化日志
→ 加载/恢复配置
→ 创建隐藏窗口和 Preload Bridge
→ 初始化托盘
→ 启动 localhost TCP
→ 写 runtime.json
→ 检测 Hook
→ 根据 --hidden 决定是否显示窗口
```

退出：

```text
停止接收 Hook 事件
→ 清空播放队列
→ 关闭 TCP 服务
→ 删除 runtime.json
→ 刷新日志
→ 销毁托盘和窗口
→ 退出
```

## 19. 日志与错误模型

日志级别：

- ERROR：当前操作失败。
- WARN：发生回退或配置异常。
- INFO：启动、Hook 状态、事件处理结果和播放结果。
- DEBUG：仅开发版启用。

主进程向 Renderer 返回稳定错误码，不返回堆栈、Token、内部绝对路径或敏感内容。

## 20. 可测试性

单元测试：

- 配置校验和迁移。
- 音频解析。
- 监控过滤。
- 去重和合并。
- Hook 配置合并。
- Claude/Codex Hook 输入适配。
- Token 和协议校验。

集成测试：

- Hook Runner → TCP → Event Processor → Audio Queue。
- 配置保存和重启恢复。
- 音频导入与回退。
- 多 CLI 并发事件。
- 窗口隐藏后继续播放。
- Electron 未运行时 Hook Runner 快速退出。

## 21. 架构决策记录

- **ADR-001**：桌面框架改为 Electron，降低本机开发环境门槛并统一使用 TypeScript。
- **ADR-002**：使用 electron-vite 管理 Main、Preload、Renderer 构建。
- **ADR-003**：使用 Claude Code/Codex CLI 官方 Hook 获取一轮执行停止事件，不监控终端文本。
- **ADR-004**：Hook 适配逻辑使用 TypeScript/JavaScript，正式发布时打包为独立 Hook Runner。
- **ADR-005**：MVP 使用 localhost TCP + 随机 Token，保持 Hook 与主进程低耦合。
- **ADR-006**：使用 Renderer 的 Web Audio 能力播放音频，避免原生 Node 音频模块。
- **ADR-007**：配置使用 JSON，无需数据库。
- **ADR-008**：空闲私有内存目标调整为不超过 300 MB，以发布包稳定空闲状态实测为准；统计 Electron 主进程及其子进程的 Private Memory 总和，避免 Working Set 对共享页的重复计数。

## 22. 后续扩展

- 项目级规则。
- 工作目录音频映射。
- 免打扰。
- 最短任务时长。
- 最近单轮停止记录。
- Named Pipe/Unix Domain Socket。
- 自动更新。
