# Agent Monitor 系统架构设计文档

## 1. 文档信息

| 项目 | 内容 |
|---|---|
| 文档名称 | Agent Monitor 系统架构设计文档 |
| 文档版本 | V1.0 |
| 关联 PRD | Agent Monitor PRD V1.0 |
| 目标平台 | Windows 10/11、macOS 13+ |
| 桌面框架 | Tauri 2 |
| 前端技术 | Vue 3、TypeScript |
| 核心语言 | Rust |
| 音频组件 | rodio |
| IPC | localhost TCP + 随机 Token |
| 配置存储 | JSON |
| 支持 CLI | Claude Code、Codex CLI |

## 2. 架构目标

1. CLI 结束一次 Agent 任务轮次后，在 1 秒内开始播放提示音。
2. Hook 程序失败不得影响 CLI 主流程。
3. Claude 和 Codex 配置相互独立。
4. 默认音频和自定义音频统一解析。
5. 桌面应用低资源后台运行。
6. Windows/macOS 共用绝大部分代码。
7. 前端不直接执行任意系统命令。
8. 配置、音频、IPC 异常均不得导致崩溃。
9. 预留 Linux、免打扰、项目级规则等扩展能力。

## 3. 总体架构

```text
Claude Code / Codex CLI
          │ Stop Hook / stdin JSON
          ▼
agent-monitor-hook 辅助程序
          │ localhost TCP / JSON
          ▼
Agent Monitor 桌面应用
          ├── IPC Server
          ├── Event Processor
          ├── Audio Resolver
          ├── Audio Player
          ├── Config Manager
          ├── Hook Manager
          ├── Tray Manager
          └── Logging
```

## 4. 系统组件

### 4.1 桌面应用

负责：

- 系统托盘和设置窗口。
- 配置读写。
- 本地 IPC 服务。
- 事件接收、过滤、去重和合并。
- 音频解析和播放队列。
- Hook 安装、检测、修复。
- 开机启动。
- 本地诊断日志。

不负责：

- 启动或控制 CLI。
- 读取代码或完整 transcript。
- 分析 Agent 回复。
- 上传数据。

### 4.2 Hook 辅助程序

独立 Rust 二进制：

```text
Windows: agent-monitor-hook.exe
macOS: agent-monitor-hook
```

调用形式：

```text
agent-monitor-hook claude
agent-monitor-hook codex
```

职责：

1. 识别来源参数。
2. 读取 stdin JSON。
3. 转换标准事件。
4. 读取 runtime.json。
5. 发送本地 IPC。
6. 快速退出。

不播放音频、不显示 UI、不访问网络、不修改 CLI 配置、不阻塞主流程。

### 4.3 前端设置界面

Vue 3 + TypeScript，主要组件：

```text
SettingsView
├── RuntimeStatusCard
├── DefaultAudioCard
├── ClaudeMonitorCard
├── CodexMonitorCard
├── GeneralSettingsCard
└── HookDiagnosticsCard
```

所有系统操作通过受限 Tauri Command 调用 Rust 后端。

## 5. Rust 模块设计

```text
src-tauri/src/
├── main.rs
├── app_state.rs
├── commands/
├── config/
├── ipc/
├── events/
├── audio/
├── hooks/
├── tray/
├── startup/
├── logging/
└── error.rs
```

建议 Workspace：

```text
agent-monitor/
├── apps/desktop
├── crates/agent-monitor-core
├── crates/agent-monitor-protocol
├── crates/agent-monitor-hook
├── assets
└── .github/workflows
```

## 6. 应用状态模型

```rust
pub struct AppState {
    pub config: Arc<RwLock<AppConfig>>,
    pub audio_player: Arc<AudioPlayer>,
    pub event_processor: Arc<EventProcessor>,
    pub ipc_runtime: Arc<RwLock<IpcRuntime>>,
    pub shutdown: CancellationToken,
}
```

音频输出实例全局单例，避免设备竞争和重复初始化。

## 7. 配置模型

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub version: u32,
    pub default_audio: DefaultAudioConfig,
    pub monitors: MonitorConfigs,
    pub global_paused: bool,
    pub auto_start: bool,
    pub close_to_tray: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DefaultAudioConfig {
    pub source: AudioSource,
    pub path: String,
    pub volume: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorConfigs {
    pub claude: CliMonitorConfig,
    pub codex: CliMonitorConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CliMonitorConfig {
    pub enabled: bool,
    pub audio_mode: AudioMode,
    pub custom_audio_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AudioMode {
    Default,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AudioSource {
    Builtin,
    Imported,
}
```

约束：

- `volume` 范围为 `0.0..=1.0`。
- `Custom` 且路径无效时回退默认音频。
- 配置加载后执行标准化校验。
- 未识别字段忽略，以提高兼容性。

## 8. 配置存储设计

### 8.1 存储目录

```text
Windows:
%APPDATA%\AgentMonitor\

macOS:
~/Library/Application Support/AgentMonitor/
```

目录结构：

```text
AgentMonitor/
├── config.json
├── runtime.json
├── audio/
├── backups/
└── logs/
```

### 8.2 原子写入

```text
写入 config.json.tmp
→ flush/sync
→ 原子替换 config.json
```

失败时保留旧配置。

### 8.3 配置迁移

```rust
pub trait ConfigMigration {
    fn from_version(&self) -> u32;
    fn to_version(&self) -> u32;
    fn migrate(
        &self,
        value: serde_json::Value
    ) -> Result<serde_json::Value, ConfigError>;
}
```

## 9. 音频模块设计

### 9.1 音频解析

```rust
pub struct ResolvedAudio {
    pub path: PathBuf,
    pub volume: f32,
    pub fallback_used: bool,
}
```

规则：

- 监控关闭：忽略。
- 默认模式：全局默认音频。
- 自定义模式且文件有效：自定义音频。
- 自定义模式但文件无效：全局默认音频。
- 默认音频无效：安装包内置音频。

### 9.2 自定义音频导入

1. 文件选择器。
2. 扩展名校验。
3. 实际解码校验。
4. 复制到应用数据目录。
5. 校验复制结果。
6. 更新配置。
7. 清理被替换的旧内部文件。

### 9.3 音频播放器

```rust
pub enum AudioCommand {
    Play { path: PathBuf, volume: f32 },
    Stop,
    Shutdown,
}
```

架构：

```text
Event Processor
→ mpsc::Sender<AudioCommand>
→ Audio Worker
→ rodio OutputStream / Sink
```

要求：

- 单音频串行播放。
- 有界队列。
- 失败后下次可重新初始化。
- 不阻塞 Tauri 主线程。

## 10. 事件处理设计

### 10.1 标准事件

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletionEvent {
    pub version: u32,
    pub source: CliSource,
    pub event_type: EventType,
    pub session_id: Option<String>,
    pub turn_id: Option<String>,
    pub cwd: Option<String>,
    pub timestamp: i64,
}
```

### 10.2 处理流水线

```text
IPC 接收
→ 协议校验
→ Token 校验
→ 字段校验
→ 全局暂停判断
→ CLI 开关判断
→ 去重
→ 合并
→ 音频解析
→ 播放队列
```

### 10.3 去重策略

优先键：

```text
source + sessionId + turnId + eventType
```

降级键：

```text
source + sessionId + eventType + 3秒时间桶
```

缓存：

```rust
HashMap<EventKey, Instant>
```

每 60 秒清理，保留 5 分钟，最多 1000 条。

### 10.4 合并策略

设置 1 秒合并窗口，窗口内多个单轮结束事件只触发一次播放。

## 11. IPC 架构

### 11.1 runtime.json

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

- 当前用户权限。
- 应用退出时删除。
- 异常退出后下次覆盖。
- Hook 必须实际连接端口验证可用性。

### 11.2 TCP 服务

- 仅绑定 `127.0.0.1`。
- 动态端口。
- 单连接单事件。
- 请求最大 64 KB。
- 读写短超时。
- 非法 Token 直接拒绝。

### 11.3 单实例

重复启动时激活现有窗口，不重复创建 IPC、托盘和音频实例。

## 12. Hook 管理设计

### 12.1 Claude Hook

- 定位配置。
- 读取 JSON。
- 合并 `hooks.Stop`。
- 创建备份。
- 识别重复。
- 原子写回。

### 12.2 Codex Hook

同样处理配置合并，并额外检测 Hook 信任状态。

### 12.3 Hook 开关策略

Hook 始终保留。Claude/Codex 监控开关仅控制应用是否播放，避免反复修改配置和重新信任。

## 13. Tauri Command 设计

```text
get_app_config
update_monitor_enabled
update_audio_mode
update_default_volume
import_default_audio
import_cli_audio
preview_default_audio
preview_cli_audio
restore_builtin_audio
get_hook_status
install_hook
repair_hook
set_autostart
open_log_directory
clear_logs
```

所有命令必须做参数校验，不接受任意可执行命令或任意系统路径。

## 14. 错误模型

```rust
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("配置文件读取失败")]
    ConfigRead,
    #[error("配置文件保存失败")]
    ConfigWrite,
    #[error("音频文件格式不受支持")]
    UnsupportedAudio,
    #[error("音频解码失败")]
    AudioDecode,
    #[error("音频输出设备不可用")]
    AudioDeviceUnavailable,
    #[error("Hook 配置格式错误")]
    InvalidHookConfig,
    #[error("Hook 配置写入失败")]
    HookWrite,
    #[error("IPC 服务不可用")]
    IpcUnavailable,
    #[error("请求未授权")]
    Unauthorized,
    #[error("参数无效")]
    InvalidArgument,
}
```

前端接收结构化错误码，不显示 Rust 堆栈。

## 15. 日志设计

日志级别：

- ERROR：当前操作失败。
- WARN：异常回退。
- INFO：启动、Hook、事件和播放结果。
- DEBUG：开发版。

禁止记录 Token、完整 Prompt、回复、代码和音频二进制。

## 16. 启动流程

```text
初始化日志
→ 单实例检查
→ 加载/恢复配置
→ 初始化托盘
→ 初始化音频模块
→ 启动 IPC
→ 写 runtime.json
→ 检测 Hook
→ 决定是否显示窗口
```

## 17. 退出流程

```text
停止接收事件
→ 停止音频线程
→ 关闭 IPC
→ 删除 runtime.json
→ 刷新日志
→ 退出
```

## 18. 安全边界

IPC 事件不能：

- 指定音频路径。
- 指定音量。
- 指定系统命令。
- 修改配置。
- 安装 Hook。
- 打开任意文件或窗口。

## 19. 可测试性

单元测试：

- 配置校验和迁移。
- 音频解析。
- 监控过滤。
- 去重和合并。
- Hook JSON 合并。
- Token 校验。

集成测试：

- Hook → IPC → Event Processor → Audio Queue。
- 配置保存和重启恢复。
- 音频导入与回退。
- 多 CLI 并发事件。

## 20. 架构决策记录

- **ADR-001**：Tauri 而非 Electron，降低常驻资源和安装体积。
- **ADR-002**：独立 Hook 程序，避免启动 GUI 和阻塞 CLI。
- **ADR-003**：MVP 使用 localhost TCP，简化跨平台实现。
- **ADR-004**：配置使用 JSON，无需数据库。
- **ADR-005**：Hook 始终保留，减少用户配置冲突。

## 21. 后续扩展

- Linux。
- 项目级规则。
- 工作目录音频映射。
- 免打扰。
- 最短任务时长。
- 最近单轮结束记录。
- Named Pipe/Unix Domain Socket。
- 自动更新。
