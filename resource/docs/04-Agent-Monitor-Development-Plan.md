# Agent Monitor 研发任务拆分与里程碑

## 1. 研发目标

交付 Windows/macOS Agent Monitor MVP，实现：

- Claude Code 官方 Stop Hook。
- Codex CLI 官方 Stop Hook。
- CLI 一轮 Agent 执行停止后触发提醒。
- Hook 脚本通过 localhost IPC 通知 Electron 主进程。
- Claude/Codex 独立监控开关。
- 全局默认提示音。
- Claude/Codex 独立自定义提示音。
- 试听和音量。
- 托盘常驻。
- 开机启动。
- Hook 安装、检测与修复。
- 事件去重与有限播放队列。
- 本地配置和日志。

## 2. 最终技术组合

```text
桌面框架：Electron
构建工具：electron-vite
主进程：Node.js + TypeScript
Preload：TypeScript + contextBridge
设置界面：Vue 3 + TypeScript + Less
音频播放：Web Audio API / HTMLAudioElement
Hook 适配：TypeScript/JavaScript Hook 脚本
发布版 Hook：独立可执行 Hook Runner
外部 IPC：localhost TCP + 随机 Token
内部 IPC：Electron IPC 白名单
配置存储：本地 JSON
打包发布：electron-builder + GitHub Actions
```

## 3. 研发阶段

1. Electron 工程初始化。
2. 官方 Hook、Hook Runner、IPC 和音频技术验证。
3. 核心业务开发。
4. 桌面界面与系统集成。
5. 双平台测试与发布。
6. MVP 验收。

## 4. 阶段一：工程初始化

任务：

- 创建 electron-vite + Vue 3 + TypeScript 项目。
- 建立 Main、Preload、Renderer、Hook 四层目录。
- 安装 Less，仅作为样式预处理器，不引入第三方 UI 组件框架。
- 建立 `tokens.less`、`themes.less`、`mixins.less`、`animations.less`、`reset.less` 和 `global.less`。
- 使用统一设计 Token 管理色彩、字体、间距、圆角、阴影和动效。
- 使用 CSS Variables 承载运行期动态样式值。
- 配置 ESLint、Prettier、Vitest 和 TypeScript。
- 配置 electron-builder。
- 配置基础 CI。
- 定义分支、提交和版本规范。
- 配置严格 CSP、`contextIsolation`、`sandbox` 和 `nodeIntegration: false`。

验收：

- Windows 可启动空白 Electron 应用。
- Main、Preload、Renderer 可分别编译。
- Renderer 无法直接访问 Node.js。
- CI 执行 lint、typecheck、unit test 和生产构建。
- macOS CI 可完成无签名测试构建。

## 5. 阶段二：核心技术验证

### 5.1 Claude Code Hook POC

- 确认 Claude Code 官方配置路径和 Stop Hook 格式。
- 注册不覆盖用户已有配置的 Agent Monitor Hook。
- 验证 stdin JSON。
- 验证正常停止、用户中断、多会话和后台任务场景。
- 确认 Stop 事件只表示 Agent 单轮停止。
- 输出兼容性记录。

### 5.2 Codex CLI Hook POC

- 确认 Codex CLI 官方配置路径和 Stop Hook 格式。
- 验证 Hook 信任流程。
- 验证 `session_id`、`turn_id` 和 `stop_hook_active`。
- 验证多轮和并行进程。
- 确认 Stop 事件只表示 Agent 单轮停止。

### 5.3 Hook Runner POC

- 开发 TypeScript/JavaScript Hook 脚本。
- 限量读取 stdin。
- 适配 Claude/Codex 事件。
- 读取固定位置 `runtime.json`。
- 使用短超时发送 localhost TCP。
- Electron 未运行时快速退出。
- 评估开发版 Node 脚本和发布版独立 Hook Runner。
- 验证 Hook P95 总执行时间低于 1 秒，通常不超过 500 毫秒。
- 验证失败始终不影响原 CLI。

### 5.4 Web Audio POC

- 在 Electron Renderer 播放 WAV、MP3、OGG。
- 调整音量。
- 窗口隐藏到托盘后继续播放。
- 开机静默启动后播放。
- 验证蓝牙切换和无输出设备异常。
- 确保不阻塞主进程和设置界面。

### 5.5 localhost IPC POC

- Electron 主进程动态端口。
- 随机 Token。
- `runtime.json`。
- Hook TCP Client。
- 单请求大小限制。
- 读写超时和异常退出。
- P95 事件到音频开始播放低于 1 秒。

### 5.6 资源占用 POC

- 使用打包后的发布版本测量。
- 空闲 CPU 目标低于 1%。
- 空闲私有内存目标不超过 300 MB。
- 窗口隐藏、长时间托盘运行后内存无持续增长。
- 连续 Hook 事件后队列和缓存可回收。

## 6. 阶段三：核心业务开发

### CORE-CONFIG 配置模块

- `AppConfig` TypeScript 类型。
- JSON Schema/Zod 运行时校验。
- 默认配置。
- 读取、标准化和原子写入。
- 配置损坏备份与恢复。
- 版本迁移。
- 单元测试。

### CORE-PROTOCOL 协议模块

- `TurnStoppedEvent`。
- IPC Request/Response。
- `turnStopped` 事件语义。
- 协议和事件独立版本。
- 字段长度校验。
- 未知字段兼容。
- 协议测试。

### HOOK-AGENT Hook 脚本

- 来源参数只允许 `claude` 或 `codex`。
- stdin 最大 256 KB。
- Claude/Codex 输入适配。
- 不保留 Prompt、回复、transcript 或代码。
- 读取固定位置 `runtime.json`。
- TCP Client 和总超时。
- 安全退出。
- 发布版 Hook Runner 打包。

### CORE-IPC IPC 服务端

- 仅动态绑定 `127.0.0.1`。
- 每次启动生成随机 Token。
- 原子写入 `runtime.json`。
- 单请求最大 64 KB。
- 连接、读取和响应超时。
- JSON、版本、字段和 Token 校验。
- 优雅关闭和运行文件清理。

### CORE-EVENT 事件处理器

- 全局暂停。
- Claude/Codex 独立开关。
- 过期事件过滤。
- 去重键和缓存。
- 定时清理。
- 1 秒合并窗口。
- 音频派发。
- 结构化日志。

### CORE-AUDIO-RESOLVER 音频解析

- 默认音频。
- Claude/Codex 自定义音频。
- 文件存在性和可读性检查。
- 自定义异常回退。
- 默认异常回退内置音频。
- 路径只来源于已验证配置。

### CORE-AUDIO-QUEUE 播放队列

- 主进程维护有界队列。
- 同时只允许一段音频。
- Renderer 播放状态回执。
- 音量。
- 试听。
- Renderer 重载恢复。
- 设备异常后下次重试。
- 应用退出时停止。

### CORE-AUDIO-IMPORT 音频导入

- 主进程打开原生文件选择器。
- 扩展名、大小和可读性校验。
- Renderer 解码验证。
- 复制到应用数据目录。
- 文件名冲突处理。
- 旧文件清理。
- 失败回滚。

## 7. 阶段四：桌面界面与系统集成

### UI-HOME 首页

- 应用运行状态。
- Claude/Codex Hook 状态。
- 最近一次 Agent 单轮停止事件。
- 默认提示音概览。
- 最近活动。

### UI-SETTINGS 设置页面

- 提醒设置。
- Claude/Codex 独立监控。
- 默认/自定义音频。
- 通用设置。
- Hook 检测与修复。
- 即时保存。
- 不提供首次启动引导。

### UI-DEFAULT-AUDIO

- 当前默认音频名称。
- 选择、音量、试听和恢复内置音频。
- 导入与播放错误提示。

### UI-CLAUDE

- 监控开关。
- 默认/自定义模式。
- 选择和试听。
- 官方 Hook 状态。
- 安装和修复入口。

### UI-CODEX

- 与 Claude 相同。
- 额外展示 Hook 信任状态。

### SYSTEM-PRELOAD

- 使用 `contextBridge` 暴露类型化 API。
- Renderer 不获得原始 `ipcRenderer`。
- 所有 Channel 使用常量白名单。
- 所有入参在主进程再次校验。

### SYSTEM-TRAY

- 托盘图标。
- 打开设置。
- 显示 Claude/Codex 监控状态。
- 测试提示音。
- 全局暂停。
- 退出。
- 关闭窗口后隐藏而非销毁。

### SYSTEM-AUTOSTART

- 使用 `app.setLoginItemSettings()`。
- 开关和系统状态同步。
- 使用 `--hidden` 静默启动。
- Windows/macOS 测试。

### SYSTEM-SINGLE-INSTANCE

- 使用 `app.requestSingleInstanceLock()`。
- 第二次启动激活已有窗口。
- 防止重复 TCP Server、托盘和播放队列。

## 8. Hook 安装与修复

### HOOK-CLAUDE-INSTALLER

- 定位 Claude Code 官方配置。
- JSON 解析。
- 写入前备份。
- 合并官方 Stop Hook。
- 保留用户已有 Hook。
- 重复识别。
- 原子写入。
- 路径转义。
- 修复和卸载自身配置。

### HOOK-CODEX-INSTALLER

- 定位 Codex CLI 官方配置。
- 解析官方 Hook 格式。
- 保留用户已有 Hook。
- 写入前备份。
- 检测信任状态。
- 路径转义。
- 修复和卸载自身配置。

### 兼容性测试矩阵

| 场景 | Claude | Codex |
|---|---:|---:|
| 无配置文件 | 必测 | 必测 |
| 空配置文件 | 必测 | 必测 |
| 已有其他 Hook | 必测 | 必测 |
| 已有 Agent Monitor Hook | 必测 | 必测 |
| 配置语法错误 | 必测 | 必测 |
| 路径包含空格 | 必测 | 必测 |
| 非 ASCII 用户名 | 必测 | 必测 |
| 配置只读 | 必测 | 必测 |
| Hook Runner 不存在 | 必测 | 必测 |
| Electron 未运行 | 必测 | 必测 |

## 9. 阶段五：测试与发布

### 9.1 单元测试

覆盖：

- 配置校验和迁移。
- 音频解析。
- 去重和合并。
- Hook 配置合并。
- Claude/Codex 输入适配。
- Token 校验。
- 路径处理。

核心模块覆盖率目标：70% 以上。

### 9.2 集成测试

- 官方 Hook → Hook Runner → TCP → Event Processor → Audio Queue。
- 配置修改 → 原子保存 → 重启恢复。
- 音频导入 → Renderer 播放。
- 文件丢失 → 回退。
- 重复事件 → 单次播放。
- Electron 未运行 → Hook 快速退出。
- 多 CLI 并行停止。
- 窗口隐藏 → 继续提醒。

### 9.3 Windows 测试

- Windows 10/11。
- PowerShell、Windows Terminal。
- 中文和空格路径。
- 蓝牙、USB 音频。
- 系统静音。
- 开机启动。
- 托盘和单实例。
- NSIS 安装、升级和卸载。

### 9.4 macOS 测试

- macOS 13+。
- Apple Silicon。
- Terminal、iTerm2。
- 中文路径。
- 睡眠恢复。
- 蓝牙音频。
- 开机启动。
- DMG。
- 应用和 Hook Runner 签名、公证及执行权限。

### 9.5 CI/CD

Pull Request：

- npm lint。
- npm typecheck。
- npm test。
- electron-vite build。

Tag Release：

- Windows/macOS Electron 构建。
- Hook Runner 构建。
- electron-builder 打包。
- 代码签名和 macOS 公证。
- NSIS/DMG 安装包。
- 校验值。
- GitHub Release。

## 10. 缺陷优先级

| 等级 | 定义 |
|---|---|
| P0 | 导致 CLI 异常、用户 Hook 配置损坏、应用无法启动 |
| P1 | 不提醒、错误提醒、监控开关失效、安全边界被绕过 |
| P2 | 状态不准、偶发重复、资源占用持续增长 |
| P3 | UI 和文案问题 |

发布前关闭全部 P0、P1。

## 11. 里程碑

### Milestone 1：技术验证

交付 Claude Hook、Codex Hook、Hook Runner、localhost IPC、Web Audio 和资源占用 POC。

退出条件：两类 CLI 的官方 Hook 均能在一轮执行停止后通知 Electron 主进程并触发提示音，失败不影响 CLI。

### Milestone 2：核心链路

交付 Hook Runner、IPC、配置、去重、合并、音频解析和队列。

退出条件：无需设置界面即可稳定提醒。

### Milestone 3：桌面应用

交付首页、设置页、Preload Bridge、托盘、开机启动、默认/自定义音频和独立开关。

退出条件：用户无需手改 Agent Monitor 配置文件。

### Milestone 4：Hook 管理

交付官方 Hook 自动安装、检测、修复、备份和 Codex 信任状态展示。

退出条件：用户可随时通过设置页面完成 Hook 配置和修复，无需首次启动引导。

### Milestone 5：双平台候选版本

交付 Windows/macOS 安装包、回归测试、签名、公证、使用说明和隐私说明。

退出条件：通过 PRD 验收。

## 12. 团队角色建议

| 角色 | 职责 |
|---|---|
| Electron/Node.js 开发 | 主进程、IPC、Hook、托盘、系统集成和打包 |
| Vue 前端开发 | 首页、设置页面、Preload 类型和音频运行时 |
| 测试工程师 | 双平台、CLI Hook、安装和兼容性测试 |
| 产品/设计 | PRD、界面、文案和验收 |

## 13. Definition of Done

每项功能完成必须：

1. 代码已合并。
2. 通过格式、静态检查和类型检查。
3. 核心逻辑有测试。
4. 错误场景已处理。
5. 完成对应平台验证。
6. 不记录敏感数据。
7. 不破坏用户原有 Hook。
8. Renderer 不直接访问 Node.js。
9. 有明确验收步骤。
10. 文档同步更新。

## 14. MVP 最终验收清单

- [x] Claude Code 官方 Stop Hook。
- [x] Codex CLI 官方 Stop Hook。
- [x] Agent 单轮停止后触发提醒。
- [x] Hook 脚本通知 Electron 主进程。
- [x] Electron 未运行时 Hook 快速退出。
- [x] Claude 独立开关。
- [x] Codex 独立开关。
- [x] 默认提示音。
- [x] 默认音量。
- [x] Claude 自定义音频。
- [x] Codex 自定义音频。
- [x] 自定义异常回退。
- [x] 试听。
- [x] 去重。
- [x] 多事件不重叠。
- [x] 托盘常驻。
- [x] 关闭窗口不退出。
- [x] 托盘退出。
- [x] 开机启动。
- [x] Hook 自动安装。
- [x] Hook 修复。
- [x] 保留用户已有 Hook。
- [x] 配置原子写入。
- [x] 配置损坏恢复。
- [x] 空闲 CPU 低于 1%（Windows 发布版 10 秒稳定空闲采样约 0.039%）。
- [x] 发布版稳定空闲状态私有内存不超过 300 MB。
- [x] Windows NSIS 安装包。
- [ ] macOS DMG。
- [ ] macOS 应用与 Hook Runner 签名。
- [x] 无系统通知。
- [x] 无 TTS。
- [x] 无云端依赖。

> macOS DMG、应用签名与公证必须在具备 Apple Developer ID 证书的 macOS 环境中执行，当前 Windows 开发环境仅完成对应构建配置。
