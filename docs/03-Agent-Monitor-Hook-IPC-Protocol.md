# Agent Monitor Hook 与 IPC 接口协议文档

## 1. 协议目的

定义 Claude Code、Codex CLI Hook 辅助程序与 Agent Monitor 桌面应用之间的本地通信格式。

目标：

- 结构简单。
- 处理快速。
- 支持版本升级。
- 不传输用户代码或完整会话。
- 不允许远程调用。
- 不允许事件指定任意音频或系统操作。

## 2. 通信参与方

- Hook 调用方：Claude Code Stop Hook、Codex CLI Stop Hook。
- Hook 适配器：`agent-monitor-hook`。
- IPC 服务端：Agent Monitor 桌面应用。

协议中的 `turnCompleted` 表示一次 Agent 任务轮次停止或本轮响应结束，不代表用户的整体业务目标已经完成。

## 3. Hook 命令约定

```text
agent-monitor-hook claude
agent-monitor-hook codex
```

第一个参数仅允许 `claude` 或 `codex`。

## 4. Hook 输入约定

Hook JSON 通过 stdin 输入。

要求：

- 最大输入长度 256 KB。
- UTF-8。
- 超限立即停止读取。
- JSON 无法解析时记录简短错误并正常退出。
- 不保存原始输入。
- 不打印完整输入。

## 5. Claude 事件适配

可能输入：

```json
{
  "session_id": "session-001",
  "cwd": "/project/demo",
  "stop_hook_active": false,
  "last_assistant_message": "已完成",
  "background_tasks": []
}
```

映射：

| Claude 字段 | 标准字段 |
|---|---|
| session_id | sessionId |
| cwd | cwd |
| 无 | turnId = null |
| 当前时间 | timestamp |
| 固定值 | source = claude |
| 固定值 | eventType = turnCompleted |

不发送 `last_assistant_message`、完整 transcript、用户 Prompt、工具参数和代码内容。

## 6. Codex 事件适配

可能输入：

```json
{
  "session_id": "session-002",
  "turn_id": "turn-010",
  "cwd": "C:\\project\\demo",
  "stop_hook_active": false,
  "last_assistant_message": "Done"
}
```

映射：

| Codex 字段 | 标准字段 |
|---|---|
| session_id | sessionId |
| turn_id | turnId |
| cwd | cwd |
| 当前时间 | timestamp |
| 固定值 | source = codex |
| 固定值 | eventType = turnCompleted |

`last_assistant_message` 不进入 IPC。

## 7. 运行状态文件协议

文件：`runtime.json`

```json
{
  "version": 1,
  "host": "127.0.0.1",
  "port": 43821,
  "token": "de2a53bb-7310-493e-9507-ff647acd73a4",
  "pid": 12345,
  "startedAt": 1785220000000
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| version | integer | 是 | 运行文件协议版本 |
| host | string | 是 | 必须为 127.0.0.1 |
| port | integer | 是 | 1～65535 |
| token | string | 是 | 当前启动周期随机令牌 |
| pid | integer | 是 | 桌面应用 PID |
| startedAt | integer | 是 | 毫秒时间戳 |

Hook 必须拒绝非 localhost、无效端口、空 Token 和不支持版本。

## 8. IPC 传输格式

```text
TCP + 单行 JSON
```

流程：

1. 建立 TCP。
2. 写入一行 JSON。
3. 行尾写入 `\n`。
4. 等待响应。
5. 关闭连接。

## 9. IPC 请求结构

```json
{
  "protocolVersion": 1,
  "token": "de2a53bb-7310-493e-9507-ff647acd73a4",
  "event": {
    "version": 1,
    "source": "claude",
    "eventType": "turnCompleted",
    "sessionId": "session-001",
    "turnId": null,
    "cwd": "/project/demo",
    "timestamp": 1785220000000
  }
}
```

## 10. 请求字段定义

### 顶层字段

| 字段 | 类型 | 必填 | 约束 |
|---|---|---:|---|
| protocolVersion | integer | 是 | 当前为 1 |
| token | string | 是 | 必须匹配 runtime.json |
| event | object | 是 | 标准事件 |

### 事件字段

| 字段 | 类型 | 必填 | 约束 |
|---|---|---:|---|
| version | integer | 是 | 当前为 1 |
| source | string | 是 | claude 或 codex |
| eventType | string | 是 | 当前仅 turnCompleted |
| sessionId | string/null | 否 | 最大 256 字符 |
| turnId | string/null | 否 | 最大 256 字符 |
| cwd | string/null | 否 | 最大 4096 字符 |
| timestamp | integer | 是 | 毫秒时间戳 |

## 11. IPC 响应结构

成功：

```json
{"ok": true, "code": "ACCEPTED"}
```

重复：

```json
{"ok": true, "code": "DUPLICATE_IGNORED"}
```

监控关闭：

```json
{"ok": true, "code": "MONITOR_DISABLED"}
```

全局暂停：

```json
{"ok": true, "code": "GLOBAL_PAUSED"}
```

认证失败：

```json
{"ok": false, "code": "UNAUTHORIZED"}
```

协议不支持：

```json
{"ok": false, "code": "UNSUPPORTED_PROTOCOL"}
```

请求无效：

```json
{"ok": false, "code": "INVALID_REQUEST"}
```

内部错误：

```json
{"ok": false, "code": "INTERNAL_ERROR"}
```

响应不得包含配置、音频路径、Token、系统敏感信息或错误栈。

## 12. 超时设置

| 阶段 | 建议超时 |
|---|---:|
| runtime.json 读取 | 200 毫秒 |
| TCP 连接 | 300 毫秒 |
| 写入请求 | 300 毫秒 |
| 等待响应 | 500 毫秒 |
| 总执行目标 | 1 秒以内 |

超时后放弃发送、记录简短错误、正常退出，不长时间重试。

## 13. 安全规则

### 服务端

- 仅监听 `127.0.0.1`。
- 请求最大 64 KB。
- Token 错误立即拒绝。
- 不解析事件中的任意播放路径。
- 不执行事件携带的命令。
- 不允许 IPC 修改配置、安装 Hook 或打开任意文件。

### Hook 程序

- 只读取固定位置 runtime.json。
- 不接受自定义 host/port。
- 不打印 Token。
- 不保存原始输入。
- 不向网络发送 CLI 内容。

## 14. 事件去重语义

Codex：

```text
codex:{sessionId}:{turnId}:turnCompleted
```

Claude：

```text
claude:{sessionId}:{3秒时间桶}:turnCompleted
```

字段缺失：

```text
{source}:unknown:{3秒时间桶}:turnCompleted
```

去重由服务端完成。

## 15. 兼容性策略

- 新增非必填字段不提升主版本。
- 删除字段或改变语义时提升版本。
- 服务端忽略未知字段。
- `protocolVersion` 与事件 `version` 独立。

## 16. Hook 程序退出码

提醒失败不影响 CLI，因此通常返回 0：

| 情况 | 退出码 |
|---|---:|
| 发送成功 | 0 |
| 桌面应用未运行 | 0 |
| IPC 失败 | 0 |
| Hook JSON 无效 | 0 |
| 来源参数无效 | 0 或 2 |
| 严重内部错误 | 优先 0 |

## 17. 测试用例

- 正常 Claude 事件：返回 `ACCEPTED` 并进入音频流程。
- 正常 Codex 事件：正确保留 `turnId`。
- Token 错误：返回 `UNAUTHORIZED`，不播放。
- 请求过大：拒绝，不持续占用内存。
- 重复事件：第二次返回 `DUPLICATE_IGNORED`。
- 监控关闭：返回 `MONITOR_DISABLED`。
- 应用未启动：Hook 快速退出。
- runtime.json 过期：连接失败，不尝试其他网络地址。
