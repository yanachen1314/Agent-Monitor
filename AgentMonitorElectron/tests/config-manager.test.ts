import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ConfigManager } from '../src/main/config/manager'
import type { AppPaths } from '../src/main/paths'

const temporaryDirectories: string[] = []

async function createPaths(): Promise<AppPaths> {
  const userData = await mkdtemp(join(tmpdir(), 'agent-monitor-config-'))
  temporaryDirectories.push(userData)
  return {
    userData,
    configFile: join(userData, 'config.json'),
    runtimeFile: join(userData, 'runtime.json'),
    audioDir: join(userData, 'audio'),
    backupDir: join(userData, 'backups'),
    logDir: join(userData, 'logs'),
    builtinAudio: join(userData, 'builtin.wav')
  }
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe('ConfigManager', () => {
  it('首次启动生成默认配置并持久化修改', async () => {
    const paths = await createPaths()
    const manager = new ConfigManager(paths)

    const initial = await manager.initialize()
    expect(initial.monitors.claude.enabled).toBe(true)
    expect(initial.globalPaused).toBe(false)

    await manager.setGlobalPaused(true)
    await manager.setDefaultVolume(2)

    const persisted = JSON.parse(await readFile(paths.configFile, 'utf8'))
    expect(persisted.globalPaused).toBe(true)
    expect(persisted.defaultAudio.volume).toBe(1)
  })

  it('损坏配置会备份并恢复默认值', async () => {
    const paths = await createPaths()
    await writeFile(paths.configFile, '{invalid json', 'utf8')
    const manager = new ConfigManager(paths)

    const restored = await manager.initialize()
    expect(restored.defaultAudio.path).toBe('builtin://complete.wav')

    const { readdir } = await import('node:fs/promises')
    const backups = await readdir(paths.backupDir)
    expect(backups).toHaveLength(1)
    expect(backups[0]).toMatch(/^config-damaged-\d+\.json$/)
  })

  it('仅接受受支持且不超过大小限制的音频', async () => {
    const paths = await createPaths()
    const manager = new ConfigManager(paths)
    await manager.initialize()
    const audio = join(paths.userData, 'notice.wav')
    const unsupported = join(paths.userData, 'notice.flac')
    await writeFile(audio, Buffer.from('RIFF'))
    await writeFile(unsupported, Buffer.from('fLaC'))

    const updated = await manager.importAudio(audio, 'codex')
    expect(updated.monitors.codex.audioMode).toBe('custom')
    expect(updated.monitors.codex.customAudioPath).toMatch(/codex-\d+\.wav$/)
    await expect(manager.importAudio(unsupported, 'default')).rejects.toThrow('UNSUPPORTED_AUDIO')
  })
})
