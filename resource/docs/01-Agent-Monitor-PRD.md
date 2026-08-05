# Agent Monitor 桌面应用产品需求文档（PRD）

## 1. 文档信息

| 项目 | 内容 |
|---|---|
| 产品暂定名称 | Agent Monitor |
| 文档版本 | V1.1 |
| 文档日期 | 2026年7月30日 |
| 产品类型 | Windows/macOS 桌面常驻应用 |
| 产品阶段 | MVP 需求确认 |
| 核心技术 | Electron、electron-vite、Vue 3、TypeScript、Less、Web Audio API、Node.js |
| 支持对象 | Claude Code CLI、Codex CLI |

## 2. 产品概述

Agent Monitor 是一款运行于 Windows 和 macOS 的轻量桌面常驻应用。

应用通过 Claude Code 和 Codex CLI 的生命周期 Hook 接收任务轮次结束事件，并在事件触发后自动播放一段简短提示音，使用户无需持续观察终端窗口，也能及时获知 AI 编程任务已经执行结束。

产品不接管 Claude Code 或 Codex CLI 的执行过程，不要求用户从 Agent Monitor 内启动 CLI，也不读取或上传用户的代码、对话及项目文件。

### 2.1 核心价值

用户在运行较长时间的 Claude Code 或 Codex 任务后，可以切换到浏览器、IDE 或其他工作中。当任务执行结束时，Agent Monitor 通过声音提醒用户返回查看结果。

### 2.2 一句话描述

> 当 Claude Code 或 Codex CLI 的一次 Agent 任务轮次结束时，自动播放提示音。

## 3. 项目背景

Claude Code 和 Codex CLI 经常被用于代码生成、重构、测试、问题分析及其他耗时任务。

在任务执行期间，用户通常会切换到其他窗口继续工作。由于终端本身不一定能提供统一、明显且可配置的声音提醒，用户需要频繁返回终端确认本轮执行是否已经停止并等待继续操作，造成注意力中断和等待成本。

本产品通过 CLI 官方生命周期 Hook 获取结束事件，而不是通过解析终端文本、轮询日志或监控窗口状态来推断任务是否结束。

Claude Code 的 `Stop` Hook 会在主 Agent 一轮执行停止时触发；事件还可以提供会话 ID、最终回复、后台任务等信息。

Codex 的 `Stop` Hook 会提供当前 `turn_id`、`stop_hook_active` 和最终助手消息等字段，适合作为一次 Agent 轮次结束的事件来源。

## 4. 产品目标

### 4.1 核心目标

1. 支持 Windows 和 macOS。
2. 支持 Claude Code CLI Agent 单轮结束提醒。
3. 支持 Codex CLI Agent 单轮结束提醒。
4. Claude Code 和 Codex CLI 可分别开启或关闭监控。
5. 两类 CLI 默认使用同一套全局默认音频配置。
6. Claude Code 和 Codex CLI 可分别选择是否使用自定义音频。
7. Agent 单轮结束后仅播放音频，不显示系统通知。
8. 应用能够常驻系统托盘，并支持开机启动。
9. 应用完全在本地运行，不依赖服务器。
10. Hook 执行失败不得影响 Claude Code 或 Codex CLI 的正常运行。

### 4.2 成功标准

- 用户能够随时在设置页面完成 Claude Code、Codex CLI Hook 配置。
- 开启监控的 CLI 结束一次 Agent 任务轮次后，应用能够可靠播放音频。
- 关闭监控的 CLI 不播放音频。
- 默认音频、自定义音频和音量设置在应用重启后仍然有效。
- 重复 Hook 事件不会造成提示音连续重复播放。
- 应用退出、音频文件丢失或音频设备异常时，不影响原 CLI 的任务执行。

## 5. 非目标范围

1. TTS 文字转语音。
2. 系统通知中心消息。
3. Windows Toast Notification。
4. macOS Notification Center 通知。
5. 邮件、短信、微信、Telegram、Slack 等远程通知。
6. 云端账号和跨设备同步。
7. 用户代码或 CLI 对话内容分析。
8. Claude Code 或 Codex CLI 的任务管理。
9. 在应用内启动、暂停或终止 CLI 任务。
10. 移动端应用。
11. Linux 桌面支持。
12. 多设备远程提醒。
13. 任务耗时统计和复杂数据报表。
14. 在线音频市场或语音商店。
15. 自动判断业务目标是否真正完成。

## 6. 用户定义

### 6.1 目标用户

- 使用 Claude Code CLI 的开发人员。
- 使用 Codex CLI 的开发人员。
- 同时使用 Claude Code 和 Codex CLI 的开发人员。
- 经常运行长时间代码生成、重构或测试任务的用户。
- 同时打开多个终端窗口执行 Agent 任务的用户。

### 6.2 用户特征

- 熟悉终端和命令行工具。
- 使用 Windows 或 macOS 进行开发。
- 可能同时运行多个项目或多个 Agent 会话。
- 希望减少频繁检查终端的行为。
- 重视本地隐私和低资源占用。

## 7. 核心概念定义

### 7.1 Agent 单轮结束

MVP 中的提醒触发语义定义为：

> Claude Code 或 Codex CLI 触发一次主 Agent `Stop` 生命周期事件，表示一次 Agent 任务轮次已经停止。

该事件仅表示一次 Agent 轮次停止或本轮响应结束，不代表用户提出的整个业务目标已经完成。产品界面和提示文案不得将该事件描述为整体业务目标完成。

### 7.2 默认音频

默认音频是 Claude Code 和 Codex CLI 共用的全局音频配置，包括音频来源、音频文件和播放音量。

### 7.3 自定义音频

用户可以为 Claude Code 或 Codex CLI 单独配置音频。使用自定义音频后，对应 CLI 的单轮结束事件不再使用全局默认音频。

### 7.4 任务监控开关

Claude Code 和 Codex CLI 分别拥有独立的监控开关。关闭后 Hook 可以继续保留，应用仍可接收事件，但不播放音频，原音频配置继续保存。

## 8. 用户故事

- **US-01**：Claude 结束一次 Agent 任务轮次后播放默认提示音。
- **US-02**：Codex 结束一次 Agent 任务轮次后播放默认提示音。
- **US-03**：可独立关闭 Claude 监控。
- **US-04**：可独立关闭 Codex 监控。
- **US-05**：可设置 Claude 和 Codex 共用的全局默认音频。
- **US-06**：可为 Claude 配置专属音频。
- **US-07**：可为 Codex 配置专属音频。
- **US-08**：可试听音频和音量。
- **US-09**：关闭设置窗口后应用继续后台常驻。
- **US-10**：系统启动后应用可自动运行。

## 9. 功能优先级

| 优先级 | 含义 |
|---|---|
| P0 | MVP 必须实现 |
| P1 | 建议首个正式版本实现 |
| P2 | 后续增强功能 |

## 10. 功能需求

### 10.1 环境检测与 Hook 配置

应用不提供首次启动引导。用户可随时从设置页面查看检测结果、配置或修复 Hook，并测试提示音。

#### FR-001 CLI 状态检测（P0）

状态包括：

- 已检测并已配置。
- 已检测但未配置。
- 未检测。
- Hook 配置异常。
- Hook 脚本不存在或不可执行。
- 配置文件无法读取。
- 配置文件无法写入。

#### FR-002 Hook 自动安装（P0）

- 不覆盖用户已有配置。
- 不删除用户已有 Hook。
- 不重复添加相同 Hook。
- 写入前创建备份。
- 配置写入失败时保留原文件。
- 只修改 Agent Monitor 自己负责的配置节点。
- 正确处理空格、特殊字符和跨平台路径。

#### FR-003 Hook 检测与修复（P1）

支持重新检测、修复单个 Hook、重新安装全部 Hook，并展示简化错误原因。

### 10.2 Claude Code 监控

#### FR-101 Claude 监控开关（P0）

默认开启。关闭后不播放 Claude 单轮停止提示音，不影响 Codex，不删除 Hook，不丢失原音频设置。

#### FR-102 Claude 单轮结束事件（P0）

通过 Claude Code 官方 `Stop` Hook 接收事件。Hook 脚本由 Claude Code 在一轮执行停止后调用，读取 stdin JSON、提取必要字段、通过 localhost IPC 通知 Electron 主进程并快速退出。

#### FR-103 Claude 后台任务处理（P1）

MVP 收到主 Agent Stop 即视为可提醒事件，不读取完整 transcript，不基于回复文本判断业务目标是否真正完成。后续可增加“仅在没有后台任务时提醒”。

### 10.3 Codex 监控

#### FR-201 Codex 监控开关（P0）

默认开启。关闭后不播放 Codex 单轮停止提示音，不影响 Claude，不删除 Hook，不丢失原音频设置。

#### FR-202 Codex 单轮结束事件（P0）

通过 Codex CLI 官方 `Stop` Hook 接收事件。Hook 脚本由 Codex CLI 在一轮执行停止后调用，提取 `turn_id`、`stop_hook_active` 等必要字段，转换为标准事件并通过 localhost IPC 通知 Electron 主进程。

#### FR-203 Codex Hook 信任状态（P1）

当 Codex 需要用户确认或信任 Hook 时，显示“等待用户信任”、操作说明和重新检测入口，不绕过安全确认机制。

### 10.4 默认音频配置

#### FR-301 内置默认音频（P0）

安装包至少内置一段 0.5～2 秒、无人物语音、音量适中的合法提示音，建议使用 WAV。

#### FR-302 更换默认音频（P0）

支持 WAV、MP3、OGG/Vorbis。导入后复制到应用数据目录，不长期依赖原始路径。

#### FR-303 默认音量（P0）

范围 0%～100%，默认建议 70%。

#### FR-304 试听默认音频（P0）

点击后按当前音量立即播放，不受监控开关影响。

#### FR-305 恢复内置音频（P1）

可一键恢复安装包内置提示音。

### 10.5 Claude 自定义音频

#### FR-401 Claude 音频模式（P0）

互斥选项：

- 使用默认音频。
- 使用自定义音频。

默认使用全局默认音频。

#### FR-402 选择 Claude 自定义音频（P0）

校验文件、复制到应用目录、保存内部路径并允许试听。

#### FR-403 Claude 自定义音频回退（P0）

文件不存在、不可读、格式不支持或解码失败时，自动回退全局默认音频。

### 10.6 Codex 自定义音频

规则与 Claude 相同，但配置和文件独立。

### 10.7 音频播放

#### FR-601 播放决策（P0）

处理顺序：

1. 判断事件来源。
2. 判断对应监控开关。
3. 去重。
4. 判断合并窗口。
5. 解析音频。
6. 校验文件。
7. 播放音频。
8. 记录诊断结果。

#### FR-602 音频解析规则（P0）

- 监控关闭：不播放。
- 使用默认音频：播放全局默认音频。
- 使用自定义音频：播放对应 CLI 自定义音频。
- 自定义音频异常：回退默认音频。

#### FR-603 非阻塞播放（P0）

不得阻塞 Electron 主进程、设置界面、Hook 脚本或 IPC 接收循环。

#### FR-604 音频播放队列（P0）

- 同一时刻仅播放一段提示音。
- 新事件进入有限队列。
- 1 秒内多个事件可合并为一次播放。
- 队列超过上限时只记录，不连续播放大量声音。

#### FR-605 音频设备异常（P0）

无输出设备、蓝牙断开、设备切换或解码失败均不得导致应用退出。

### 10.8 事件去重与合并

#### FR-701 事件去重（P0）

优先键：

```text
source + sessionId + turnId + eventType
```

Claude 没有可靠 `turnId` 时使用 3 秒时间窗口。

#### FR-702 并发事件合并（P0）

1 秒内到达的多个单轮结束事件最多触发一次实际播放。

#### FR-703 防止无限缓存（P0）

缓存仅保留最近 5 分钟并设置最大数量。

### 10.9 系统托盘

#### FR-801 托盘常驻（P0）

关闭设置窗口后默认继续后台运行。

#### FR-802 托盘菜单（P0）

至少包含：

- 监控状态。
- Claude 状态。
- Codex 状态。
- 测试提示音。
- 打开设置。
- 暂停全部监控。
- 退出。

#### FR-803 暂停全部监控（P1）

暂停不修改 Claude/Codex 独立开关的持久化配置。

#### FR-804 退出应用（P0）

只有点击托盘“退出”才完全结束。应用退出后 Hook 失败不得影响 CLI。

### 10.10 开机启动

#### FR-901 开机自动启动（P0）

默认建议开启。

#### FR-902 静默启动（P0）

开机启动后不打开设置窗口，直接进入托盘并初始化 IPC 和音频模块。

### 10.11 配置管理

#### FR-1001 配置持久化（P0）

建议位置：

```text
Windows: %APPDATA%\AgentMonitor\config.json
macOS: ~/Library/Application Support/AgentMonitor/config.json
```

#### FR-1002 配置原子写入（P0）

临时文件写入、刷新后原子替换正式文件。

#### FR-1003 配置版本（P0）

配置必须包含 `version` 字段，并支持后续迁移。

#### FR-1004 配置损坏恢复（P0）

备份损坏文件、加载默认配置并在应用窗口内提示。

## 11. 页面设计

主设置页面建议包含：

- 应用运行状态。
- Claude Hook 状态。
- Codex Hook 状态。
- 全局默认音频、音量、试听、恢复默认。
- Claude 监控开关和音频模式。
- Codex 监控开关和音频模式。
- 开机启动。
- 关闭窗口后驻留托盘。
- 重新检测 CLI。
- 修复 Hook。

配置采用即时保存，不设置单独“保存”按钮。

## 12. 行为矩阵

| Claude 监控 | Claude 音频 | Codex 监控 | Codex 音频 | 结果 |
|---|---|---|---|---|
| 开启 | 默认 | 开启 | 默认 | 两者均播放全局默认音频 |
| 开启 | 自定义 | 开启 | 默认 | Claude 自定义，Codex 默认 |
| 开启 | 默认 | 开启 | 自定义 | Claude 默认，Codex 自定义 |
| 开启 | 自定义 | 开启 | 自定义 | 两者播放各自自定义音频 |
| 关闭 | 任意 | 开启 | 默认 | Claude 静默，Codex 默认音频 |
| 开启 | 默认 | 关闭 | 任意 | Claude 默认音频，Codex 静默 |
| 关闭 | 任意 | 关闭 | 任意 | 全部静默 |
| 开启 | 自定义异常 | 任意 | 任意 | Claude 回退默认音频 |
| 任意 | 任意 | 开启 | 自定义异常 | Codex 回退默认音频 |
| 全局暂停 | 任意 | 任意 | 任意 | 全部静默 |

## 13. 技术方案

### 13.1 最终技术组合

```text
桌面框架：Electron
构建工具：electron-vite
核心业务：Electron Main Process + TypeScript
设置界面：Vue 3 + TypeScript + Less
音频播放：Web Audio API / HTMLAudioElement
运行时：Node.js + Chromium
配置序列化：TypeScript 类型 + JSON Schema/Zod 校验
IPC：localhost TCP + 随机 Token
Hook 程序：独立 TypeScript/JavaScript Hook 脚本，发布时打包为可独立执行的 Hook Runner
配置存储：本地 JSON
构建发布：electron-vite + electron-builder + GitHub Actions
```

界面不使用 Element Plus、Ant Design Vue、Tailwind CSS 等第三方 UI 或原子化样式框架。组件使用 Vue 单文件组件自主实现，样式使用 Less 组织，并通过统一的颜色、字体、间距、圆角、阴影和动效 Token 保持软件整体视觉一致。运行期需要动态调整的样式值使用 CSS Variables。

### 13.2 标准事件结构

```json
{
  "version": 1,
  "source": "claude",
  "eventType": "turnStopped",
  "sessionId": "session-123",
  "turnId": null,
  "cwd": "/Users/demo/project",
  "timestamp": 1785220000000
}
```

MVP 不传输完整 Prompt、助手回复、transcript、代码或 Git 信息。

### 13.3 配置结构

```json
{
  "version": 1,
  "defaultAudio": {
    "source": "builtin",
    "path": "builtin://complete.wav",
    "volume": 0.7
  },
  "monitors": {
    "claude": {
      "enabled": true,
      "audioMode": "default",
      "customAudioPath": null
    },
    "codex": {
      "enabled": true,
      "audioMode": "default",
      "customAudioPath": null
    }
  },
  "globalPaused": false,
  "autoStart": true,
  "closeToTray": true
}
```

## 14. 非功能需求

### 14.1 性能

| 指标 | 目标 |
|---|---|
| Hook 脚本启动至退出 | 通常不超过 500 毫秒 |
| Hook 事件到音频开始播放 | P95 不超过 1 秒 |
| 设置修改响应 | 不超过 200 毫秒 |
| 空闲 CPU 占用 | 接近 0%，目标低于 1% |
| 空闲私有内存占用 | 目标不超过 300 MB，以打包后的发布版本稳定空闲状态实测为准 |
| IPC 单事件大小 | 不超过 64 KB |
| 应用启动时间 | 目标不超过 3 秒 |

### 14.2 稳定性

- 音频失败不得导致进程退出。
- Hook 解析失败不得导致 CLI 异常。
- 配置损坏不得导致应用无法启动。
- 防止多实例、队列无限增长和日志无限增长。

### 14.3 兼容性

- Windows 10/11 64 位。
- macOS 13 及以上。
- Apple Silicon 必须支持；Intel 可根据发布成本决定。

### 14.4 隐私

不注册、不上传代码、不上传音频、不上传终端输出、不上传对话、不连接业务服务器、不包含第三方分析 SDK。

### 14.5 安全

- Hook 配置写入前备份。
- IPC 不执行任意命令。
- IPC 不指定任意音频路径。
- 播放路径必须来自本地已验证配置。
- 自定义音频复制到应用数据目录。
- Token 不写入日志。

## 15. 异常处理

| 异常 | 处理方式 |
|---|---|
| Claude/Codex 未安装 | 显示未检测，不影响另一方 |
| Hook 配置不存在 | 创建必要目录和配置 |
| Hook JSON 错误 | 停止写入并提示 |
| Hook 重复 | 自动去重 |
| 桌面应用未运行 | Hook 快速失败并退出 |
| IPC Token 无效 | 丢弃事件 |
| 默认音频丢失 | 回退安装包内置音频 |
| 自定义音频丢失 | 回退默认音频 |
| 无音频设备 | 记录日志，不崩溃 |
| 多任务同时结束 | 合并或有限排队 |
| 配置保存失败 | 保留旧配置并提示 |
| 系统睡眠 | 不补播大量过期事件 |

## 16. 验收标准

- Claude/Codex 监控开关独立生效。
- 默认音频和两类自定义音频正确播放。
- 自定义音频失效时正确回退。
- 重复事件只播放一次。
- 关闭窗口后继续后台运行。
- 托盘退出后进程完全结束。
- 开机启动后静默进入托盘。
- Hook 安装不覆盖用户已有 Hook。
- 配置损坏可恢复。
- Windows 和 macOS 安装包均可正常使用。

## 17. MVP 版本范围

### V0.1 技术验证

验证 Claude Hook、Codex Hook、Hook Runner、IPC、Web Audio 和双平台构建。

### V0.5 内部测试版

包含托盘、设置页面、独立开关、默认/自定义音频、Hook 安装、配置持久化、开机启动和去重。

### V1.0 MVP

交付 Windows/macOS 安装包和完整核心功能。

## 18. 后续版本候选

- 最短任务时长过滤。
- 免打扰时间。
- 更多内置提示音。
- 每个 CLI 独立音量。
- 最近单轮结束记录。
- Claude 后台任务过滤。
- 项目级音频规则。
- Named Pipe/Unix Domain Socket。
- 自动更新。

## 19. 风险分析

- CLI Hook 结构可能变化。
- Stop 只表示一轮结束，不等同于整个项目完成。
- macOS 需要处理应用及 Hook Runner 的签名、公证和执行权限。
- Windows 音频设备差异较大。
- 用户已有复杂 Hook 可能造成配置冲突。

## 20. 产品决策总结

1. Electron + electron-vite + Vue 3 + TypeScript + Less。
2. Electron 主进程使用 TypeScript 实现核心逻辑。
3. 独立 Hook 脚本负责适配 Claude Code、Codex CLI 官方 Hook 事件，发布时打包为可独立执行的 Hook Runner。
4. Claude/Codex Stop Hook。
5. Web Audio API 播放短音频。
6. 两类 CLI 默认共用全局默认音频。
7. 两类 CLI 可分别配置自定义音频和监控开关。
8. Hook 始终保留，应用侧过滤。
9. 不实现 TTS 和系统通知。
10. 不依赖云端，不上传用户数据。
