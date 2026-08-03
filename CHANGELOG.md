# 版本更新记录

本文件记录 Agent Monitor 各版本的重要功能变化，按版本从新到旧排列。

## 0.4.1

`0.4.1` 是用于验证应用内自动更新完整链路的小版本：

- 将应用版本从 `0.4.0` 更新至 `0.4.1`，用于测试版本检查、下载安装和重启升级流程。
- 不包含其他功能或配置变更。

## 0.4.0

`0.4.0` 新增 Windows 正式版本的应用内自动更新能力：

- 接入 `electron-updater`，应用启动 30 秒后会在后台检查 GitHub Release，也可以在“设置 →
  软件更新”中手动检查。
- 发现新版本后由用户确认下载；下载完成后再次确认才会退出应用并启动安装，不会在使用过程中强制重启。
- 设置页新增更新状态、下载进度、版本说明以及检查、下载、安装操作入口。
- GitHub Actions 发布时会同步上传 `latest.yml`、Windows 安装包和 `.blockmap`，支持后续版本的
  更新检查与增量下载。
- Windows 安装包名称统一为 `Agent.Monitor-<version>-Windows-x64-Setup.exe`，确保 Release 资产
  名称与更新清单中的下载地址一致。
- `win-unpacked` 压缩版可以检查和下载更新；安装阶段会启动 NSIS 安装程序，不会直接覆盖用户解压的目录。
- 新增自动更新服务单元测试，覆盖版本检查、更新下载、安装触发、不支持平台以及更新说明解析。

> 这是首个包含自动更新能力的版本，因此从旧版本升级到 `0.4.0` 仍需手动下载安装；安装
> `0.4.0` 后，后续版本即可使用应用内更新。

## 0.3.0

`0.3.0` 重点增强了本地诊断能力与设置体验：

- 日志升级为 JSON Lines 结构化格式，覆盖应用、Hook、IPC、事件处理、音频播放和 Renderer
  异常链路。
- 停止事件使用 `traceId` 贯通投递、判定和播放过程，音频播放通过 `requestId` 关联状态。
- 通用设置新增 `Debug`、`Info`、`Warn`、`Error` 四档日志记录级别，修改后即时生效并持久化。
- 日志时间改为本地毫秒级格式，单个日志文件最大 100MB，并对 Token、会话标识和本地路径进行
  脱敏处理。
- 新增可复用的自绘下拉列表基础组件，支持选项语义配色、键盘操作、自动定位和无障碍状态。
- Windows Hook 诊断日志改为追加写入，并提供更明确的投递失败错误码。

## 0.2.0

Windows 版的 Stop Hook 链路在 `0.2.0` 中完成了一轮兼容性调整：

- Windows Hook Runner 改为无 CLR 依赖的原生 `AgentMonitorHook.exe`，避免受限进程无法加载
  Electron 或 .NET 运行时。
- Runner 不再直接从 `Program Files` 执行。应用会将它部署到
  `%CODEX_HOME%\agent-monitor\AgentMonitorHook.exe`；未设置 `CODEX_HOME` 时，默认位置为
  `%USERPROFILE%\.codex\agent-monitor\AgentMonitorHook.exe`。
- Codex 与 Claude Code 使用不同的 Windows 命令格式：Codex 使用原生 Windows 路径，Claude
  Code 因通过 Bash 执行 Hook，使用带引号的正斜杠路径。
- Windows IPC 从命名管道调整为带随机 Token 的临时文件队列，以兼容 Codex Windows 沙箱。
- 应用启动时会检查并修复已经配置的 Agent Monitor Hook，包括旧版 Electron、PowerShell、
  CMD、.NET Runner 和旧路径配置。
- 空白或 0 字节的 `hooks.json` 现在按“尚未配置”处理，可以直接点击“配置 Hook”；真正损坏的
  JSON 仍会停止写入，避免覆盖用户配置。
- 提示音播放会等待 Renderer 就绪，避免应用刚启动时收到的第一条 Stop 事件因音频通道尚未
  加载而超时。
