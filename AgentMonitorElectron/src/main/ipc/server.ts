import { randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { createServer, type Server, type Socket } from 'node:net'
import type { IpcResponse, IpcRuntime, TurnStoppedEvent } from '../../shared/types'
import type { AppPaths } from '../paths'
import { ipcRequestSchema } from '../config/schema'

const MAX_REQUEST_BYTES = 64 * 1024

export class LocalIpcServer {
  private server: Server | null = null
  private runtime: IpcRuntime | null = null
  private filePoller: NodeJS.Timeout | null = null
  private drainingInbox = false

  constructor(
    private readonly paths: AppPaths,
    private readonly onEvent: (event: TurnStoppedEvent) => Promise<IpcResponse>
  ) {}

  async start(): Promise<IpcRuntime> {
    if (this.server && this.runtime) return this.runtime
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
        void this.drainInbox(token)
        const now = new Date()
        void utimes(this.paths.runtimeFile, now, now).catch(() => undefined)
      }, 100)
      void this.drainInbox(token)
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
    await rm(this.paths.runtimeFile, { force: true }).catch(() => undefined)
  }

  private async drainInbox(token: string): Promise<void> {
    if (this.drainingInbox) return
    this.drainingInbox = true
    try {
      const entries = await readdir(this.paths.inboxDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.json')) continue
        const path = `${this.paths.inboxDir}\\${entry.name}`
        try {
          const fileStats = await stat(path)
          if (fileStats.size > MAX_REQUEST_BYTES) continue
          const parsed = ipcRequestSchema.safeParse(JSON.parse(await readFile(path, 'utf8')))
          if (!parsed.success || !this.tokenMatches(token, parsed.data.token)) continue
          await this.onEvent(parsed.data.event as TurnStoppedEvent)
        } catch {
          // 无效或写入未完成的事件由本轮忽略并清理。
        } finally {
          await rm(path, { force: true }).catch(() => undefined)
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

    socket.on('timeout', () => reply({ ok: false, code: 'INVALID_REQUEST' }))
    socket.on('error', () => socket.destroy())
    socket.on('data', async (chunk: string) => {
      received += chunk
      if (Buffer.byteLength(received, 'utf8') > MAX_REQUEST_BYTES) {
        reply({ ok: false, code: 'INVALID_REQUEST' })
        return
      }
      const newline = received.indexOf('\n')
      if (newline < 0) return

      try {
        const parsed = ipcRequestSchema.safeParse(JSON.parse(received.slice(0, newline)))
        if (!parsed.success) {
          reply({ ok: false, code: 'INVALID_REQUEST' })
          return
        }
        if (!this.tokenMatches(token, parsed.data.token)) {
          reply({ ok: false, code: 'UNAUTHORIZED' })
          return
        }
        const response = await this.onEvent(parsed.data.event as TurnStoppedEvent)
        reply(response)
      } catch {
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
