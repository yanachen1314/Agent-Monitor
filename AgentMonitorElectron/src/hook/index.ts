import { readFile } from 'node:fs/promises'
import { createConnection } from 'node:net'
import type {
  CliSource,
  IpcRequest,
  IpcResponse,
  IpcRuntime,
  TurnStoppedEvent
} from '../shared/types'

const MAX_STDIN_BYTES = 256 * 1024
const RUNTIME_RECOVERY_TIMEOUT_MS = 4_000
const RUNTIME_RECOVERY_INTERVAL_MS = 100

export interface HookClientOptions {
  recoverRuntime?: () => Promise<void> | void
  recoveryTimeoutMs?: number
  recoveryIntervalMs?: number
}

interface HookPayload {
  session_id?: unknown
  sessionId?: unknown
  turn_id?: unknown
  turnId?: unknown
  cwd?: unknown
}

export async function runHookClient(
  source: CliSource,
  runtimeFile: string,
  input: NodeJS.ReadableStream = process.stdin,
  options: HookClientOptions = {}
): Promise<IpcResponse | null> {
  try {
    const payload = await readStdinJson(input)
    const event = adaptEvent(source, payload)
    try {
      return await sendEvent(await readRuntime(runtimeFile), event)
    } catch {
      if (!options.recoverRuntime) return null
      await options.recoverRuntime()
      return await sendEventAfterRecovery(runtimeFile, event, options)
    }
  } catch {
    return null
  }
}

export function adaptEvent(source: CliSource, payload: HookPayload): TurnStoppedEvent {
  return {
    version: 1,
    source,
    eventType: 'turnStopped',
    sessionId: stringOrNull(payload.session_id ?? payload.sessionId),
    turnId: source === 'codex' ? stringOrNull(payload.turn_id ?? payload.turnId) : null,
    cwd: stringOrNull(payload.cwd),
    timestamp: Date.now()
  }
}

async function readStdinJson(input: NodeJS.ReadableStream): Promise<HookPayload> {
  input.setEncoding('utf8')
  let content = ''
  for await (const chunk of input) {
    content += chunk
    if (Buffer.byteLength(content, 'utf8') > MAX_STDIN_BYTES) {
      throw new Error('HOOK_INPUT_TOO_LARGE')
    }
  }
  const parsed: unknown = JSON.parse(content || '{}')
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('HOOK_INPUT_INVALID')
  }
  return parsed as HookPayload
}

async function readRuntime(path: string): Promise<IpcRuntime> {
  const content = await Promise.race([
    readFile(path, 'utf8'),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('RUNTIME_READ_TIMEOUT')), 200)
    )
  ])
  const runtime = JSON.parse(content) as Partial<IpcRuntime>
  if (runtime.version !== 1 || typeof runtime.token !== 'string' || runtime.token.length < 16) {
    throw new Error('RUNTIME_INVALID')
  }
  if (
    runtime.transport === 'pipe' &&
    (typeof runtime.pipeName !== 'string' || runtime.pipeName.length === 0)
  ) {
    throw new Error('RUNTIME_INVALID')
  }
  if (
    runtime.transport === 'tcp' &&
    (runtime.host !== '127.0.0.1' ||
      !Number.isInteger(runtime.port) ||
      !runtime.port ||
      runtime.port < 1 ||
      runtime.port > 65535)
  ) {
    throw new Error('RUNTIME_INVALID')
  }
  if (runtime.transport !== 'pipe' && runtime.transport !== 'tcp') {
    throw new Error('RUNTIME_INVALID')
  }
  return runtime as IpcRuntime
}

async function sendEvent(runtime: IpcRuntime, event: TurnStoppedEvent): Promise<IpcResponse> {
  const request: IpcRequest = {
    protocolVersion: 1,
    token: runtime.token,
    event
  }

  return new Promise<IpcResponse>((resolve, reject) => {
    const socket =
      runtime.transport === 'pipe'
        ? createConnection(runtime.pipeName)
        : createConnection({ host: runtime.host, port: runtime.port })
    socket.setEncoding('utf8')
    socket.setTimeout(500)
    let response = ''
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error('HOOK_TOTAL_TIMEOUT'))
    }, 1_000)

    socket.once('connect', () => {
      socket.write(`${JSON.stringify(request)}\n`)
    })
    socket.on('data', (chunk: string) => {
      response += chunk
      const newline = response.indexOf('\n')
      if (newline < 0) return
      clearTimeout(timer)
      socket.end()
      resolve(JSON.parse(response.slice(0, newline)) as IpcResponse)
    })
    socket.once('timeout', () => {
      clearTimeout(timer)
      socket.destroy()
      reject(new Error('HOOK_SOCKET_TIMEOUT'))
    })
    socket.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

async function sendEventAfterRecovery(
  runtimeFile: string,
  event: TurnStoppedEvent,
  options: HookClientOptions
): Promise<IpcResponse> {
  const timeout = options.recoveryTimeoutMs ?? RUNTIME_RECOVERY_TIMEOUT_MS
  const interval = options.recoveryIntervalMs ?? RUNTIME_RECOVERY_INTERVAL_MS
  const deadline = Date.now() + timeout
  let lastError: unknown = new Error('RUNTIME_RECOVERY_FAILED')

  do {
    try {
      return await sendEvent(await readRuntime(runtimeFile), event)
    } catch (error) {
      lastError = error
      await delay(interval)
    }
  } while (Date.now() < deadline)

  throw lastError
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value.slice(0, 4096) : null
}
