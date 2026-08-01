import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runHookClient } from '../src/hook'
import { LocalIpcServer } from '../src/main/ipc/server'
import type { AppPaths } from '../src/main/paths'

describe('Local IPC server', () => {
  const temporaryDirectories: string[] = []

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories
        .splice(0)
        .map((directory) => rm(directory, { recursive: true, force: true }))
    )
  })

  it('通过当前平台传输接收 Hook 事件', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'agent-monitor-ipc-'))
    temporaryDirectories.push(directory)
    const paths: AppPaths = {
      userData: directory,
      configFile: join(directory, 'config.json'),
      runtimeFile: join(directory, 'runtime.json'),
      inboxDir: join(directory, 'inbox'),
      audioDir: join(directory, 'audio'),
      backupDir: join(directory, 'backups'),
      logDir: join(directory, 'logs'),
      builtinAudio: join(directory, 'complete.wav')
    }
    const onEvent = vi.fn(async () => ({ ok: true as const, code: 'ACCEPTED' as const }))
    const server = new LocalIpcServer(paths, onEvent)

    try {
      const runtime = await server.start()
      expect(runtime.transport).toBe(process.platform === 'win32' ? 'file' : 'tcp')
      expect(JSON.parse(await readFile(paths.runtimeFile, 'utf8')).transport).toBe(
        runtime.transport
      )

      const response = await runHookClient(
        'codex',
        paths.runtimeFile,
        Readable.from(
          JSON.stringify({
            session_id: 'session-1',
            turn_id: 'turn-1',
            cwd: 'C:\\workspace',
            hook_event_name: 'Stop'
          })
        )
      )

      expect(response).toEqual({ ok: true, code: 'ACCEPTED' })
      await vi.waitFor(() =>
        expect(onEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            source: 'codex',
            sessionId: 'session-1',
            turnId: 'turn-1'
          })
        )
      )
    } finally {
      await server.stop()
    }
  })

  it('运行时不存在时恢复服务并发送同一次 Hook 事件', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'agent-monitor-recovery-'))
    temporaryDirectories.push(directory)
    const paths: AppPaths = {
      userData: directory,
      configFile: join(directory, 'config.json'),
      runtimeFile: join(directory, 'runtime.json'),
      inboxDir: join(directory, 'inbox'),
      audioDir: join(directory, 'audio'),
      backupDir: join(directory, 'backups'),
      logDir: join(directory, 'logs'),
      builtinAudio: join(directory, 'complete.wav')
    }
    const onEvent = vi.fn(async () => ({ ok: true as const, code: 'ACCEPTED' as const }))
    const server = new LocalIpcServer(paths, onEvent)
    const recoverRuntime = vi.fn(() => server.start().then(() => undefined))

    try {
      const response = await runHookClient(
        'codex',
        paths.runtimeFile,
        Readable.from(
          JSON.stringify({
            session_id: 'recovery-session',
            turn_id: 'recovery-turn',
            hook_event_name: 'Stop'
          })
        ),
        { recoverRuntime, recoveryTimeoutMs: 1_000, recoveryIntervalMs: 10 }
      )

      expect(recoverRuntime).toHaveBeenCalledOnce()
      expect(response).toEqual({ ok: true, code: 'ACCEPTED' })
      await vi.waitFor(() =>
        expect(onEvent).toHaveBeenCalledWith(
          expect.objectContaining({ sessionId: 'recovery-session', turnId: 'recovery-turn' })
        )
      )
    } finally {
      await server.stop()
    }
  })
})
