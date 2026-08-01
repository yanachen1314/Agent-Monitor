# macOS 构建、测试与运行指南

本文面向需要在 macOS 上构建、验证或分发 Agent Monitor 的开发者。当前 `0.1.23` 已在
Windows 10 上完成 Claude Code、Codex CLI 和 Codex Desktop 的提醒验证；macOS 仍需要按本文
清单在真实设备上完成验收，不能仅以“DMG 成功生成”作为可发布依据。

## 1. 先了解平台差异

| 项目        | Windows                                 | macOS                                             |
| ----------- | --------------------------------------- | ------------------------------------------------- |
| Hook Runner | 独立原生 `AgentMonitorHook.exe`         | 应用自身的 Electron 可执行文件                    |
| Hook 参数   | `AgentMonitorHook.exe codex/claude`     | `Agent Monitor --agent-monitor-hook=codex/claude` |
| 本机 IPC    | `%TEMP%` 文件队列                       | `127.0.0.1` 随机 TCP 端口                         |
| 运行时文件  | `%TEMP%\agent-monitor-ipc\runtime.json` | Electron `userData` 目录下的 `runtime.json`       |
| 构建产物    | x64 NSIS                                | arm64、x64 两个独立 DMG                           |

macOS 不编译或调用 `resources/hook/AgentMonitorHook.c`。Hook 会直接启动已安装 App Bundle 内的
Electron 主程序；主进程识别 `--agent-monitor-hook=<source>` 后只读取标准输入、发送事件并退出，
不会进入普通桌面窗口流程。

如果 Agent Monitor 尚未运行，Hook 会尝试以 `--hidden` 启动一个后台实例，并在最多 4 秒内等待
`runtime.json` 和本机 TCP 服务就绪。因此，冷启动路径必须单独测试。

## 2. 构建环境

建议使用真实 Mac 完成正式构建，至少准备：

- 与目标版本兼容的 macOS；同时记录 `sw_vers` 输出。
- Xcode 和 Xcode Command Line Tools。
- Node.js 与 npm。全程使用同一个 Node 版本，CI 中应固定版本。
- Claude Code 和 Codex CLI；若验证 Codex Desktop，还需安装对应 macOS 桌面端。
- 正式分发时需要 Apple Developer Program、`Developer ID Application` 证书及公证凭据。

环境检查：

```bash
uname -m
sw_vers
node --version
npm --version
xcode-select --print-path
xcrun notarytool --version
security find-identity -v -p codesigning
```

不要在 Windows 上把“成功生成 macOS 文件”视为正式构建结果。签名、Hardened Runtime、公证、
Gatekeeper、DMG 挂载和 App Bundle 内可执行文件都应在 macOS 上验证。Electron 官方也要求为
macOS 发布准备 Xcode、签名证书和公证流程。

## 3. 安装依赖与基础检查

```bash
git clone https://github.com/yanachen1314/Agent-Monitor.git
cd Agent-Monitor/AgentMonitorElectron
npm ci
npm run typecheck
npm test
npm run lint
npm run format:check
```

所有检查都应在 Mac 上重新运行。项目当前没有原生 Node 扩展，但 Electron 下载包、文件权限、
路径分隔符、大小写敏感文件系统和架构选择仍可能暴露 Windows 上无法发现的问题。

开发模式可执行：

```bash
npm run dev
```

开发模式配置的 Hook 会引用仓库内 Electron 可执行文件和应用目录。它只适合开发验证；移动仓库、
删除 `node_modules` 或切换到安装版后，应启动安装版 Agent Monitor，让应用修复 Hook 命令。

## 4. 构建 DMG 与架构验证

```bash
npm run build:mac
```

当前 `electron-builder.yml` 会分别生成：

```text
release/<version>/Agent Monitor-<version>-macOS-arm64.dmg
release/<version>/Agent Monitor-<version>-macOS-x64.dmg
```

- Apple Silicon 使用 `arm64` 包。
- Intel Mac 使用 `x64` 包。
- Apple Silicon 上验证 `x64` 包需要 Rosetta 2。
- 当前不是单一 Universal DMG；发布页面必须明确标注两个架构，避免用户下载错误。

挂载后检查实际架构：

```bash
hdiutil attach "release/<version>/Agent Monitor-<version>-macOS-arm64.dmg"
file "/Volumes/Agent Monitor <version>/Agent Monitor.app/Contents/MacOS/Agent Monitor"
lipo -archs "/Volumes/Agent Monitor <version>/Agent Monitor.app/Contents/MacOS/Agent Monitor"
```

还应检查 DMG、Dock 和菜单栏图标。当前构建配置使用 `resources/icon.png`；正式发布前建议提供
规范的 `.icns` 应用图标。菜单栏 Tray 图标在 macOS 上宜使用名称以 `Template` 结尾的单色模板
图片，并提供 `@2x` Retina 版本，否则深色模式或高分屏下可能显示不佳。参见
[Electron Tray 平台说明](https://www.electronjs.org/docs/latest/api/tray/)。

## 5. 签名与公证

当前 `electron-builder.yml` 尚未显式配置 `mac.notarize`、entitlements 或
`forceCodeSigning`。这不妨碍本地开发构建，但不应直接把未验证签名和公证状态的 DMG 对外发布。

公开分发至少应完成：

1. 使用 `Developer ID Application` 签名 App Bundle。
2. 启用并验证 Hardened Runtime。
3. 将产物提交 Apple 公证服务。
4. 将公证票据 stapling 到产物。
5. 在一台没有开发证书、最好是新用户环境的 Mac 上重新下载并首次启动。

CI 可使用 `.p12` 证书和 App Store Connect API Key。敏感信息只能放入 Keychain 或 CI Secret，
不要写入仓库：

```bash
export CSC_LINK=/secure/path/developer-id-application.p12
export CSC_KEY_PASSWORD='***'
export APPLE_API_KEY=/secure/path/AuthKey_XXXXXXXXXX.p8
export APPLE_API_KEY_ID=XXXXXXXXXX
export APPLE_API_ISSUER=00000000-0000-0000-0000-000000000000
npm run build:mac
```

也可以使用 `APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD` 和 `APPLE_TEAM_ID`，但 CI 更适合使用 API
Key。electron-builder 需要在配置和凭据齐全时才会执行公证，建议正式发布配置启用
`forceCodeSigning`，避免缺少证书时静默产出未签名包。

产物验证：

```bash
codesign --verify --deep --strict --verbose=2 "/Applications/Agent Monitor.app"
spctl --assess --verbose --type exec "/Applications/Agent Monitor.app"
xcrun stapler validate "/Applications/Agent Monitor.app"
```

Apple 已停止接受旧 `altool` 公证上传，应使用 Xcode 提供的 `notarytool`。参考：

- [Electron：代码签名](https://www.electronjs.org/docs/latest/tutorial/code-signing)
- [electron-builder：macOS 代码签名](https://www.electron.build/docs/features/code-signing/code-signing-mac/)
- [electron-builder：macOS 公证](https://www.electron.build/docs/notarization/)
- [Apple：在分发前对 macOS 软件进行公证](https://developer.apple.com/cn/documentation/xcode/notarizing_macos_software_before_distribution/)

## 6. 安装与首次运行

1. 挂载 DMG。
2. 将 `Agent Monitor.app` 拖入 `/Applications`。
3. 从 `/Applications` 启动一次应用。
4. 再在 Agent Monitor 中配置 Claude/Codex Hook。

不要在挂载的 DMG 中配置 Hook。Hook 命令保存的是 App Bundle 内可执行文件的绝对路径；弹出 DMG
或之后移动/重命名 App 都会使旧命令失效。若确实移动了应用，请从新位置启动一次 Agent Monitor
并执行“修复 Hook”。

首次运行应验证：

- Gatekeeper 没有报告签名损坏或开发者身份不可验证。
- 主窗口可显示，关闭后应用继续驻留菜单栏。
- 菜单栏图标在浅色、深色和 Retina 屏幕上清晰可见。
- “试听”能够播放默认 WAV。
- 导入的 WAV、MP3、OGG 可以播放，中文和空格文件名可以正常处理。
- 完全退出后再次启动只有一个桌面实例。

本应用仅播放本地音频，不需要麦克风权限。若系统请求麦克风权限，应视为异常并调查依赖或构建
内容。

## 7. Hook 配置与环境变量

配置文件仍为：

```text
Claude Code: ~/.claude/settings.json
Codex:       ${CODEX_HOME:-$HOME/.codex}/hooks.json
```

安装到 `/Applications` 后，Hook 命令预期类似：

```text
"/Applications/Agent Monitor.app/Contents/MacOS/Agent Monitor" --agent-monitor-hook=claude
"/Applications/Agent Monitor.app/Contents/MacOS/Agent Monitor" --agent-monitor-hook=codex
```

必须保留双引号，因为应用名和路径包含空格。

### `CODEX_HOME` 的 Mac 特殊问题

从 Finder 启动的 GUI 应用通常不会读取 `.zshrc`。如果只在终端配置了自定义 `CODEX_HOME`，
Codex CLI 和 Agent Monitor 可能看到不同目录：CLI 读取自定义路径，而 Agent Monitor 写入默认
`~/.codex/hooks.json`。

首轮测试建议先使用默认 `~/.codex`。必须自定义时，需要确保 Finder/launchd 启动的 Agent
Monitor 也能获得相同环境变量，并分别检查应用“预览 Hook”显示的配置路径与：

```bash
echo "${CODEX_HOME:-$HOME/.codex}"
```

Codex Hook 根据完整定义记录信任状态。Hook 路径、应用安装位置或版本迁移导致命令变化后，应在
Codex Desktop 设置或 Codex CLI `/hooks` 中重新审查并信任。

## 8. macOS IPC 与日志排查

非 Windows 平台使用只监听 `127.0.0.1` 的随机 TCP 端口，并使用每次应用启动随机生成的 Token。
典型用户数据位置为：

```text
~/Library/Application Support/agent-monitor/
├── config.json
├── runtime.json
├── backups/
├── audio/
└── logs/agent-monitor.log
```

实际位置以 Agent Monitor 的“打开日志目录”和 Electron `userData` 路径为准。

检查运行时：

```bash
cat "$HOME/Library/Application Support/agent-monitor/runtime.json"
tail -f "$HOME/Library/Application Support/agent-monitor/logs/agent-monitor.log"
```

`runtime.json` 应包含 `transport: "tcp"`、`host: "127.0.0.1"`、随机端口、Token 和进程 ID。不要
把 Token 粘贴到 Issue 或构建日志中。公司防火墙、EDR 或网络过滤工具可能阻止 Electron 在
loopback 监听；出现提醒失败时，应同时检查系统日志和安全软件记录。

可直接验证 Hook 入口：

```bash
printf '%s\n' '{"session_id":"manual","turn_id":"manual","cwd":"/tmp"}' \
  | "/Applications/Agent Monitor.app/Contents/MacOS/Agent Monitor" \
      --agent-monitor-hook=codex
echo $?
```

预期退出码为 `0`，应用日志新增 `收到 codex 单轮停止事件：ACCEPTED`。该测试应分别在应用运行
和应用完全退出两种状态下执行。

## 9. 真实客户端验证

### Claude Code

```bash
claude -p "仅回复 OK，不调用任何工具。" \
  --output-format stream-json \
  --verbose \
  --include-hook-events
```

确认输出中的 Stop `hook_response` 为 `exit_code: 0`、`outcome: success`，并确认日志出现：

```text
收到 claude 单轮停止事件：ACCEPTED
```

### Codex CLI

先通过 `/hooks` 信任当前定义，再执行一个最小任务。自动化验收时可临时使用
`--dangerously-bypass-hook-trust`，但日常使用不应依赖该参数：

```bash
codex exec --dangerously-bypass-hook-trust --ephemeral \
  "仅回复 OK，不调用任何工具。"
```

确认没有 `Stop Failed`，并确认日志出现：

```text
收到 codex 单轮停止事件：ACCEPTED
```

Codex Desktop 需要另开一个最小任务验证，不能只用 CLI 结果代替 Desktop 验收。

## 10. 必测场景

| 场景                       | 预期结果                                |
| -------------------------- | --------------------------------------- |
| 应用前台运行               | Claude、Codex 均提醒                    |
| 窗口关闭但菜单栏驻留       | 仍正常提醒                              |
| 应用完全退出后首次 Stop    | 应用后台拉起，4 秒内完成提醒            |
| 连续快速完成多个任务       | 不崩溃、不重复播放同一事件              |
| 全局暂停                   | 接收事件但不播放声音                    |
| 单独关闭 Claude/Codex 监控 | 对应来源不播放，另一来源不受影响        |
| 默认和自定义音频           | WAV、MP3、OGG 均按设置播放              |
| 睡眠后唤醒                 | TCP 服务与音频仍可用；异常时重启可恢复  |
| 重启系统并登录             | 自启动状态正确，菜单栏驻留行为符合预期  |
| 应用路径含空格             | Hook 命令因正确引用而成功               |
| 用户名或工作目录含中文     | 配置、日志、音频与 Hook 均正常          |
| arm64 与 x64               | 对应硬件或 Rosetta 环境均通过           |
| 应用升级或移动             | 启动后自动修复旧 Hook，Codex 可重新信任 |

## 11. 当前代码需要重点关注的 Mac 风险

以下项目尚不能由 Windows 测试证明正确：

1. **4 秒冷启动恢复窗口**：首次启动可能被 Gatekeeper、公证校验或慢磁盘拖延。必须在“应用完全
   退出”和“刚下载安装”两种状态测试；若超时，应考虑为 macOS 增加更长恢复时间。
2. **登录启动隐藏行为**：当前代码向 `app.setLoginItemSettings` 传入 `args: ['--hidden']`，但
   Electron 文档说明 `args` 是 Windows 专用字段。macOS 登录启动可能显示主窗口，应实测并改为
   macOS 专用登录项状态判断。参见
   [Electron `app.setLoginItemSettings`](https://www.electronjs.org/docs/latest/api/app)。
3. **菜单栏图标**：当前图标不是专门的 macOS Template Image，需要验证浅色/深色菜单栏和 Retina。
4. **签名与公证配置**：当前 YAML 没有强制签名或显式公证，CI 可能在缺少凭据时仍产出不可公开
   分发的 DMG。
5. **Windows 资源进入 Mac 包**：顶层 `files` 和 `extraResources` 包含 Windows Hook Runner
   目录。它在 macOS 不会被执行，但发布前应检查 App Bundle，并考虑按平台排除无关 PE 文件。
6. **自定义无边框窗口**：当前 `frame: false` 使用自绘窗口按钮，不会自动获得标准 macOS
   traffic-light 交互；需要验证全屏、缩放、辅助功能和键盘操作。
7. **Finder 与 Shell 环境不一致**：除 `CODEX_HOME` 外，代理、PATH 和 CLI 配置也可能因启动方式
   不同而不一致。

## 12. 发布验收清单

- [ ] `npm ci`、类型检查、测试、Lint、格式检查全部通过。
- [ ] arm64 DMG 在 Apple Silicon 实机通过。
- [ ] x64 DMG 在 Intel 实机或 Rosetta 环境通过。
- [ ] App、内部可执行文件和 DMG 的签名状态正确。
- [ ] Apple 公证成功并完成 stapling。
- [ ] 从浏览器重新下载 DMG 后 Gatekeeper 首次启动通过。
- [ ] Claude Code Stop Hook 前台、驻留、冷启动三种状态通过。
- [ ] Codex CLI Stop Hook 前台、驻留、冷启动三种状态通过。
- [ ] Codex Desktop 单独通过。
- [ ] 默认音频和至少一个自定义音频通过。
- [ ] 睡眠唤醒、系统重启和登录启动通过。
- [ ] 日志不包含 Prompt、完整回复、Token 或用户代码。
- [ ] 发布页明确区分 arm64 与 x64 下载项，并附 SHA-256。
