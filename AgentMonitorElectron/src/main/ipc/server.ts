import { randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { createServer, type Server, type Socket } from 'node:net'
import { join } from 'node:path'
import type { IpcResponse, IpcRuntime, TurnStoppedEvent } from '../../shared/types'
import type { AppPaths } from '../paths'
import { ipcRequestSchema } from '../config/schema'
import type { AppLogger } from '../logging/logger'
import { serializeError } from '../logging/logger'

const MAX_REQUEST_BYTES = 64 * 1024

export class LocalIpcServer {
  private server: Server | null = null
  private runtime: IpcRuntime | null = null
  private filePoller: NodeJS.Timeout | null = null
  private drainingInbox = false
  private lastHeartbeatWarningAt = 0

  constructor(
    private readonly paths: AppPaths,
    private readonly onEvent: (event: TurnStoppedEvent) => Promise<IpcResponse>,
    private readonly logger?: AppLogger
  ) {}

  async start(): Promise<IpcRuntime> {
    if (this.runtime) return this.runtime
    const token = randomBytes(32).toString('base64url')
    if (process.platform === 'win32') {
      await mkdir(this.paths.inboxDir, { recursive: true })
      this.runtime = {
        version: 1,
        transport: 'file',
        inboxDir: this.paths.inboxDir,
        token,
        pid: process.pid,
        startedAt: Date.now()
      }
      await this.writeRuntimeFile(this.runtime)
      this.filePoller = setInterval(() => {
        void this.drainInbox(token).catch((error) => {
          this.logger?.error('ipc', 'ipc_inbox_drain_failed', 'IPC 收件箱扫描失败', {
            error: serializeError(error)
          })
        })
        const now = new Date()
        void utimes(this.paths.runtimeFile, now, now).catch((error) => {
          if (Date.now() - this.lastHeartbeatWarningAt < 30_000) return
          this.lastHeartbeatWarningAt = Date.now()
          this.logger?.warn('ipc', 'ipc_heartbeat_failed', 'IPC 运行时心跳更新失败', {
            error: serializeError(error)
          })
        })
      }, 100)
      void this.drainInbox(token).catch((error) => {
        this.logger?.error('ipc', 'ipc_inbox_drain_failed', 'IPC 收件箱初次扫描失败', {
          error: serializeError(error)
        })
      })
      this.logger?.info('ipc', 'ipc_started', '本地 IPC 服务已启动', {
        transport: 'file',
        pollIntervalMs: 100
      })
      return this.runtime
    }

    const server = createServer((socket) => this.handleConnection(socket, token))
    server.maxConnections = 32

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject)
        resolve()
      })
    })

    const address = server.address()
    if (!address) {
      server.close()
      throw new Error('IPC_ADDRESS_UNAVAILABLE')
    }

    this.server = server
    const common = { version: 1 as const, token, pid: process.pid, startedAt: Date.now() }
    if (typeof address === 'string') {
      server.close()
      throw new Error('IPC_ADDRESS_UNAVAILABLE')
    }
    this.runtime = {
      ...common,
      transport: 'tcp',
      host: '127.0.0.1',
      port: address.port
    }
    await this.writeRuntimeFile(this.runtime)
    this.logger?.info('ipc', 'ipc_started', '本地 IPC 服务已启动', {
      transport: 'tcp',
      host: '127.0.0.1',
      port: address.port
    })
    return this.runtime
  }

  getRuntime(): IpcRuntime | null {
    return this.runtime ? { ...this.runtime } : null
  }

  async stop(): Promise<void> {
    const server = this.server
    this.server = null
    this.runtime = null
    if (this.filePoller) clearInterval(this.filePoller)
    this.filePoller = null
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
    await rm(this.paths.runtimeFile, { force: true }).catch((error) => {
      this.logger?.warn('ipc', 'ipc_runtime_cleanup_failed', 'IPC 运行时文件清理失败', {
        error: serializeError(error)
      })
    })
    this.logger?.info('ipc', 'ipc_stopped', '本地 IPC 服务已停止')
  }

  private async drainInbox(token: string): Promise<void> {
    if (this.drainingInbox) return
    this.drainingInbox = true
    try {
      const entries = await readdir(this.paths.inboxDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.json')) continue
        const path = join(this.paths.inboxDir, entry.name)
        try {
          const fileStats = await stat(path)
          if (fileStats.size > MAX_REQUEST_BYTES) {
            this.logger?.warn('ipc', 'ipc_request_too_large', 'IPC 事件文件超过大小限制', {
              requestBytes: fileStats.size,
              maxRequestBytes: MAX_REQUEST_BYTES
            })
            continue
          }
          const content = await readFile(path, 'utf8')
          let json: unknown
          try {
            json = JSON.parse(content)
          } catch (error) {
            this.logger?.warn('ipc', 'ipc_request_invalid_json', 'IPC 事件不是有效 JSON', {
              requestBytes: fileStats.size,
              error: serializeError(error)
            })
            continue
          }
          const parsed = ipcRequestSchema.safeParse(json)
          if (!parsed.success) {
            this.logger?.warn('ipc', 'ipc_request_invalid_schema', 'IPC 事件结构校验失败', {
              issues: parsed.error.issues.map((issue) => ({
                path: issue.path.join('.'),
                code: issue.code
              }))
            })
            continue
          }
          if (!this.tokenMatches(token, parsed.data.token)) {
            this.logger?.warn('ipc', 'ipc_unauthorized', 'IPC 事件鉴权失败', {
              transport: 'file'
            })
            continue
          }
          const startedAt = Date.now()
          const response = await this.onEvent(parsed.data.event as TurnStoppedEvent)
          this.logger?.debug('ipc', 'ipc_event_dispatched', 'IPC 事件已交付处理器', {
            traceId: parsed.data.event.traceId,
            source: parsed.data.event.source,
            resultCode: response.code,
            durationMs: Date.now() - startedAt
          })
        } catch (error) {
          this.logger?.error('ipc', 'ipc_event_file_failed', 'IPC 事件文件处理失败', {
            error: serializeError(error)
          })
        } finally {
          await rm(path, { force: true }).catch((error) => {
            this.logger?.warn('ipc', 'ipc_event_cleanup_failed', 'IPC 事件文件清理失败', {
              error: serializeError(error)
            })
          })
        }
      }
    } finally {
      this.drainingInbox = false
    }
  }

  private handleConnection(socket: Socket, token: string): void {
    socket.setEncoding('utf8')
    socket.setTimeout(1_000)
    let received = ''
    let completed = false

    const reply = (response: IpcResponse): void => {
      if (completed) return
      completed = true
      socket.end(`${JSON.stringify(response)}\n`)
    }

    socket.on('timeout', () => {
      this.logger?.warn('ipc', 'ipc_socket_timeout', 'IPC 连接读取超时', { transport: 'tcp' })
      reply({ ok: false, code: 'INVALID_REQUEST' })
    })
    socket.on('error', (error) => {
      this.logger?.warn('ipc', 'ipc_socket_error', 'IPC 连接发生异常', {
        transport: 'tcp',
        error: serializeError(error)
      })
      socket.destroy()
    })
    socket.on('data', async (chunk: string) => {
      received += chunk
      if (Buffer.byteLength(received, 'utf8') > MAX_REQUEST_BYTES) {
        this.logger?.warn('ipc', 'ipc_request_too_large', 'IPC 请求超过大小限制', {
          transport: 'tcp',
          maxRequestBytes: MAX_REQUEST_BYTES
        })
        reply({ ok: false, code: 'INVALID_REQUEST' })
        return
      }
      const newline = received.indexOf('\n')
      if (newline < 0) return

      try {
        let json: unknown
        try {
          json = JSON.parse(received.slice(0, newline))
        } catch (error) {
          this.logger?.warn('ipc', 'ipc_request_invalid_json', 'IPC 请求不是有效 JSON', {
            transport: 'tcp',
            error: serializeError(error)
          })
          reply({ ok: false, code: 'INVALID_REQUEST' })
          return
        }
        const parsed = ipcRequestSchema.safeParse(json)
        if (!parsed.success) {
          this.logger?.warn('ipc', 'ipc_request_invalid_schema', 'IPC 请求结构校验失败', {
            transport: 'tcp'
          })
          reply({ ok: false, code: 'INVALID_REQUEST' })
          return
        }
        if (!this.tokenMatches(token, parsed.data.token)) {
          this.logger?.warn('ipc', 'ipc_unauthorized', 'IPC 请求鉴权失败', { transport: 'tcp' })
          reply({ ok: false, code: 'UNAUTHORIZED' })
          return
        }
        const response = await this.onEvent(parsed.data.event as TurnStoppedEvent)
        reply(response)
      } catch (error) {
        this.logger?.error('ipc', 'ipc_request_failed', 'IPC 请求处理失败', {
          transport: 'tcp',
          error: serializeError(error)
        })
        reply({ ok: false, code: 'INTERNAL_ERROR' })
      }
    })
  }

  private tokenMatches(expected: string, actual: string): boolean {
    const expectedBuffer = Buffer.from(expected)
    const actualBuffer = Buffer.from(actual)
    return (
      expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer)
    )
  }

  private async writeRuntimeFile(runtime: IpcRuntime): Promise<void> {
    const temporary = `${this.paths.runtimeFile}.tmp`
    await writeFile(temporary, `${JSON.stringify(runtime, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600
    })
    await rename(temporary, this.paths.runtimeFile)
  }
}
