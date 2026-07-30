import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AudioResolver } from '../src/main/audio/resolver'
import type { AppPaths } from '../src/main/paths'
import type { AppConfig } from '../src/shared/types'

const temporaryDirectories: string[] = []

const config: AppConfig = {
  version: 1,
  defaultAudio: { source: 'builtin', path: 'builtin://complete.wav', volume: 0.7 },
  monitors: {
    claude: { enabled: true, audioMode: 'default', customAudioPath: null },
    codex: { enabled: true, audioMode: 'custom', customAudioPath: null }
  },
  globalPaused: false,
  autoStart: true,
  closeToTray: true
}

async function createPaths(): Promise<AppPaths> {
  const userData = await mkdtemp(join(tmpdir(), 'agent-monitor-audio-'))
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

describe('AudioResolver', () => {
  it('自定义音频存在时优先使用', async () => {
    const paths = await createPaths()
    const customAudio = join(paths.userData, 'custom.wav')
    await writeFile(paths.builtinAudio, Buffer.from('builtin'))
    await writeFile(customAudio, Buffer.from('custom'))
    const customConfig = structuredClone(config)
    customConfig.monitors.codex.customAudioPath = customAudio

    const result = await new AudioResolver(paths).resolve(customConfig, 'codex')
    expect(result.path).toBe(customAudio)
    expect(result.fallbackUsed).toBe(false)
  })

  it('自定义音频丢失时回退到内置提示音', async () => {
    const paths = await createPaths()
    await writeFile(paths.builtinAudio, Buffer.from('builtin'))
    const missingConfig = structuredClone(config)
    missingConfig.monitors.codex.customAudioPath = join(paths.userData, 'missing.wav')

    const result = await new AudioResolver(paths).resolve(missingConfig, 'codex')
    expect(result.path).toBe(paths.builtinAudio)
    expect(result.fallbackUsed).toBe(true)
  })
})
