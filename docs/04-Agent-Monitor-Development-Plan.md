# Agent Monitor 研发任务拆分与里程碑

## 1. 研发目标

交付 Windows/macOS Agent Monitor MVP，实现：

- Claude Code Stop Hook。
- Codex CLI Stop Hook。
- Claude/Codex 独立监控开关。
- 全局默认提示音。
- Claude/Codex 独立自定义提示音。
- 试听和音量。
- 托盘常驻。
- 开机启动。
- Hook 安装与修复。
- 本地 IPC。
- 去重与播放队列。
- 本地配置和日志。

## 2. 研发阶段

1. 工程初始化。
2. 核心技术验证。
3. 核心业务开发。
4. 桌面界面与系统集成。
5. 双平台测试与发布。
6. MVP 验收。

## 3. 阶段一：工程初始化

任务：

- 创建 Git 仓库。
- 配置 Rust Workspace。
- 创建 Tauri 2 + Vue 3 项目。
- 配置 TypeScript、ESLint、Prettier。
- 配置 rustfmt、Clippy。
- 配置基础 CI。
- 定义分支和版本规范。

验收：

- Windows/macOS 均可启动空白 Tauri 应用。
- Rust Workspace 可完整编译。
- CI 执行前端检查和 Rust 测试。

## 4. 阶段二：核心技术验证

### 4.1 Claude Hook POC

- 确认配置路径。
- 添加 Stop Hook。
- 读取 stdin。
- 验证正常完成、中断和多会话。
- 输出兼容性记录。

### 4.2 Codex Hook POC

- 确认 Hook 配置。
- 验证信任流程。
- 获取 `turn_id`。
- 验证多轮和并行进程。

### 4.3 rodio POC

- 播放 WAV、MP3、OGG。
- 调整音量。
- 验证蓝牙和无设备异常。
- 确保不阻塞主线程。

### 4.4 IPC POC

- 桌面端动态端口。
- 随机 Token。
- runtime.json。
- Hook TCP Client。
- 超时和异常退出。
- P95 事件延迟低于 1 秒。

## 5. 阶段三：核心业务开发

### CORE-CONFIG 配置模块

- AppConfig。
- 默认配置。
- 读取、校验、原子写入。
- 损坏恢复。
- 版本迁移。
- 单元测试。

### CORE-PROTOCOL 协议模块

- CompletionEvent。
- IPC Request/Response。
- 版本字段。
- 字段长度校验。
- 未知字段兼容。
- 协议测试。

### HOOK-AGENT Hook 辅助程序

- 来源参数。
- stdin 长度限制。
- Claude/Codex 适配。
- runtime.json。
- TCP Client。
- 超时。
- 安全退出。
- Sidecar 打包。

### CORE-IPC IPC 服务端

- 动态绑定。
- Token。
- runtime.json。
- 请求限制和超时。
- JSON 解析。
- 响应。
- 优雅关闭和清理。

### CORE-EVENT 事件处理器

- 全局暂停。
- Claude/Codex 开关。
- 去重键和缓存。
- 定时清理。
- 合并窗口。
- 音频派发。
- 日志。

### CORE-AUDIO-RESOLVER 音频解析

- 默认音频。
- Claude/Codex 自定义音频。
- 文件检查。
- 解码检查。
- 异常回退。
- 内置最终回退。

### CORE-AUDIO-PLAYER 音频播放

- rodio 初始化。
- 工作线程。
- 有界队列。
- 串行播放。
- 音量。
- 试听。
- 设备异常恢复。
- 应用退出停止。

### CORE-AUDIO-IMPORT 音频导入

- 文件选择。
- 扩展名和解码校验。
- 文件复制。
- 冲突处理。
- 旧文件清理。
- 失败回滚。

## 6. 阶段四：桌面界面与系统集成

### UI-SETTINGS 设置页面

- 运行状态。
- Hook 状态。
- 默认音频。
- Claude/Codex 配置。
- 通用设置。
- 修复入口。
- 即时保存。

### UI-DEFAULT-AUDIO

- 当前音频名称。
- 选择、音量、试听、恢复默认。
- 错误提示。

### UI-CLAUDE

- 监控开关。
- 默认/自定义模式。
- 选择和试听。
- Hook 状态与修复。

### UI-CODEX

- 与 Claude 相同。
- 额外展示信任状态。

### SYSTEM-TRAY

- 托盘图标。
- 打开设置。
- 显示状态。
- 测试提示音。
- 全局暂停。
- 退出。
- 关闭窗口后驻留。

### SYSTEM-AUTOSTART

- 接入 Tauri Autostart。
- 开关和状态同步。
- 静默启动。
- 双平台测试。

### SYSTEM-SINGLE-INSTANCE

- 防止多实例。
- 第二次启动激活原窗口。
- 防止重复 IPC、托盘和音频实例。

## 7. Hook 安装与修复

### HOOK-CLAUDE-INSTALLER

- 配置检测。
- JSON 解析。
- 备份。
- Stop Hook 合并。
- 重复识别。
- 原子写入。
- 修复。

### HOOK-CODEX-INSTALLER

- 配置检测。
- Hook 合并。
- 保留已有 Hook。
- 备份。
- 信任状态。
- 修复。

### 兼容性测试矩阵

| 场景 | Claude | Codex |
|---|---:|---:|
| 无配置文件 | 必测 | 必测 |
| 空配置文件 | 必测 | 必测 |
| 已有其他 Hook | 必测 | 必测 |
| 已有 Agent Monitor Hook | 必测 | 必测 |
| JSON 错误 | 必测 | 必测 |
| 路径包含空格 | 必测 | 必测 |
| 非 ASCII 用户名 | 必测 | 必测 |
| 配置只读 | 必测 | 必测 |

## 8. 阶段五：测试与发布

### 8.1 单元测试

覆盖：

- 配置校验和迁移。
- 音频解析。
- 去重和合并。
- Hook JSON 合并。
- Token 校验。
- 路径处理。

核心模块覆盖率目标：70% 以上。

### 8.2 集成测试

- Hook → IPC → Event Processor → Audio Queue。
- 配置修改 → 保存 → 重启恢复。
- 音频导入 → 播放。
- 文件丢失 → 回退。
- 重复事件 → 单次播放。
- 应用退出 → Hook 快速失败。
- 多 CLI 并行完成。

### 8.3 Windows 测试

- Windows 10/11。
- PowerShell、Windows Terminal。
- 中文和空格路径。
- 蓝牙、USB 音频。
- 系统静音。
- 开机启动。
- NSIS/MSI 安装卸载。

### 8.4 macOS 测试

- macOS 13+。
- Apple Silicon。
- Terminal、iTerm2。
- 中文路径。
- 睡眠恢复。
- 蓝牙音频。
- 开机启动。
- DMG。
- 签名、公证、Sidecar 权限。

### 8.5 CI/CD

Pull Request：

- npm lint。
- npm typecheck。
- cargo fmt --check。
- cargo clippy。
- cargo test。

Tag Release：

- Windows/macOS 构建。
- Sidecar 构建。
- 签名。
- 安装包。
- 校验值。
- GitHub Release。

## 9. 缺陷优先级

| 等级 | 定义 |
|---|---|
| P0 | 导致 CLI 异常、配置破坏、应用无法启动 |
| P1 | 不播放、开关失效、错误播放 |
| P2 | 状态不准、偶发重复、非关键功能错误 |
| P3 | UI 和文案问题 |

发布前关闭全部 P0、P1。

## 10. 里程碑

### Milestone 1：技术验证

交付 Claude Hook、Codex Hook、rodio、IPC POC。

退出条件：两类 CLI 均可触发本地音频。

### Milestone 2：核心链路

交付 Sidecar、IPC、配置、去重、音频解析和队列。

退出条件：无需 UI 即可稳定提醒。

### Milestone 3：桌面应用

交付设置页面、托盘、开机启动、默认/自定义音频和独立开关。

退出条件：用户无需手改配置文件。

### Milestone 4：Hook 管理

交付自动安装、检测、修复和备份。

退出条件：用户可随时通过设置页面完成 Hook 配置和修复，无需首次启动引导。

### Milestone 5：双平台候选版本

交付 Windows/macOS 安装包、回归、签名、公证、使用说明和隐私说明。

退出条件：通过 PRD 验收。

## 11. 团队角色建议

| 角色 | 职责 |
|---|---|
| Rust/Tauri 开发 | 核心、IPC、音频、Hook、系统集成 |
| Vue 前端开发 | 设置页面和交互 |
| 测试工程师 | 双平台、CLI、安装和兼容测试 |
| 产品/设计 | PRD、界面、文案和验收 |

## 12. Definition of Done

每项功能完成必须：

1. 代码已合并。
2. 通过格式和静态检查。
3. 核心逻辑有测试。
4. 错误场景已处理。
5. 完成对应平台验证。
6. 不记录敏感数据。
7. 不破坏用户原 Hook。
8. 有明确验收步骤。
9. 文案确认。
10. 文档更新。

## 13. MVP 最终验收清单

- [ ] Claude Stop Hook。
- [ ] Codex Stop Hook。
- [ ] Claude 独立开关。
- [ ] Codex 独立开关。
- [ ] 默认提示音。
- [ ] 默认音量。
- [ ] Claude 自定义音频。
- [ ] Codex 自定义音频。
- [ ] 自定义异常回退。
- [ ] 试听。
- [ ] 去重。
- [ ] 多事件不重叠。
- [ ] 托盘常驻。
- [ ] 关闭窗口不退出。
- [ ] 托盘退出。
- [ ] 开机启动。
- [ ] Hook 自动安装。
- [ ] Hook 修复。
- [ ] 保留用户已有 Hook。
- [ ] 配置原子写入。
- [ ] 配置损坏恢复。
- [ ] Windows 安装包。
- [ ] macOS 安装包。
- [ ] macOS Sidecar 签名。
- [ ] 无系统通知。
- [ ] 无 TTS。
- [ ] 无云端依赖。
