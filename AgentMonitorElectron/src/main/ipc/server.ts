import { randomBytes, timingSafeEqual } from 'node:crypto'
import { writeFile, rename, rm } from 'node:fs/promises'
import { createServer, type Server, type Socket } from 'node:net'
import type { IpcResponse, IpcRuntime, TurnStoppedEvent } from '../../shared/types'
import type { AppPaths } from '../paths'
import { ipcRequestSchema } from '../config/schema'

const MAX_REQUEST_BYTES = 64 * 1024

export class LocalIpcServer {
  private server: Server | null = null
  private runtime: IpcRuntime | null = null

  constructor(
    private readonly paths: AppPaths,
    private readonly onEvent: (event: TurnStoppedEvent) => Promise<IpcResponse>
  ) {}

  async start(): Promise<IpcRuntime> {
    if (this.server && this.runtime) return this.runtime
    const token = randomBytes(32).toString('base64url')
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
    if (!address || typeof address === 'string') {
      server.close()
      throw new Error('IPC_ADDRESS_UNAVAILABLE')
    }

    this.server = server
    this.runtime = {
      version: 1,
      host: '127.0.0.1',
      port: address.port,
      token,
      pid: process.pid,
      startedAt: Date.now()
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
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
    await rm(this.paths.runtimeFile, { force: true }).catch(() => undefined)
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
