import { copyFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import type { AppConfig, AudioMode, CliSource } from '../../shared/types'
import type { AppPaths } from '../paths'
import { appConfigSchema } from './schema'

const defaultConfig: AppConfig = {
  version: 1,
  defaultAudio: {
    source: 'builtin',
    path: 'builtin://complete.wav',
    volume: 0.7
  },
  monitors: {
    claude: { enabled: true, audioMode: 'default', customAudioPath: null },
    codex: { enabled: true, audioMode: 'default', customAudioPath: null }
  },
  globalPaused: false,
  autoStart: true,
  closeToTray: true
}

export class ConfigManager {
  private config: AppConfig = structuredClone(defaultConfig)
  private writeChain: Promise<void> = Promise.resolve()

  constructor(private readonly paths: AppPaths) {}

  async initialize(): Promise<AppConfig> {
    await Promise.all([
      mkdir(this.paths.userData, { recursive: true }),
      mkdir(this.paths.audioDir, { recursive: true }),
      mkdir(this.paths.backupDir, { recursive: true }),
      mkdir(this.paths.logDir, { recursive: true })
    ])

    try {
      const raw = await readFile(this.paths.configFile, 'utf8')
      this.config = appConfigSchema.parse(JSON.parse(raw)) as AppConfig
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        await this.backupDamagedConfig().catch(() => undefined)
      }
      this.config = structuredClone(defaultConfig)
      await this.persist()
    }

    return this.get()
  }

  get(): AppConfig {
    return structuredClone(this.config)
  }

  async setMonitorEnabled(source: CliSource, enabled: boolean): Promise<AppConfig> {
    this.config.monitors[source].enabled = enabled
    return this.saveAndGet()
  }

  async setAudioMode(source: CliSource, audioMode: AudioMode): Promise<AppConfig> {
    this.config.monitors[source].audioMode = audioMode
    return this.saveAndGet()
  }

  async setDefaultVolume(volume: number): Promise<AppConfig> {
    this.config.defaultAudio.volume = Math.min(1, Math.max(0, volume))
    return this.saveAndGet()
  }

  async setGlobalPaused(globalPaused: boolean): Promise<AppConfig> {
    this.config.globalPaused = globalPaused
    return this.saveAndGet()
  }

  async setCloseToTray(closeToTray: boolean): Promise<AppConfig> {
    this.config.closeToTray = closeToTray
    return this.saveAndGet()
  }

  async setAutoStart(autoStart: boolean): Promise<AppConfig> {
    this.config.autoStart = autoStart
    return this.saveAndGet()
  }

  async importAudio(sourcePath: string, target: 'default' | CliSource): Promise<AppConfig> {
    const extension = extname(sourcePath).toLowerCase()
    if (!['.wav', '.mp3', '.ogg'].includes(extension)) {
      throw new Error('UNSUPPORTED_AUDIO')
    }
    const sourceStats = await stat(sourcePath)
    if (!sourceStats.isFile() || sourceStats.size > 20 * 1024 * 1024) {
      throw new Error('AUDIO_FILE_TOO_LARGE')
    }

    const safeName = `${target}-${Date.now()}${extension}`
    const destination = join(this.paths.audioDir, safeName)
    await copyFile(sourcePath, destination)

    if (target === 'default') {
      this.config.defaultAudio.source = 'imported'
      this.config.defaultAudio.path = destination
    } else {
      this.config.monitors[target].customAudioPath = destination
      this.config.monitors[target].audioMode = 'custom'
    }
    return this.saveAndGet()
  }

  async restoreBuiltinAudio(): Promise<AppConfig> {
    this.config.defaultAudio.source = 'builtin'
    this.config.defaultAudio.path = 'builtin://complete.wav'
    return this.saveAndGet()
  }

  displayAudioName(target: 'default' | CliSource): string {
    const path =
      target === 'default'
        ? this.config.defaultAudio.path
        : this.config.monitors[target].customAudioPath
    if (!path || path.startsWith('builtin://')) return '默认提示音.wav'
    return basename(path)
  }

  private async saveAndGet(): Promise<AppConfig> {
    await this.persist()
    return this.get()
  }

  private async persist(): Promise<void> {
    const snapshot = appConfigSchema.parse(this.config)
    const content = `${JSON.stringify(snapshot, null, 2)}\n`
    this.writeChain = this.writeChain.then(async () => {
      const temporary = `${this.paths.configFile}.tmp`
      await writeFile(temporary, content, 'utf8')
      await rename(temporary, this.paths.configFile)
    })
    await this.writeChain
  }

  private async backupDamagedConfig(): Promise<void> {
    const backup = join(this.paths.backupDir, `config-damaged-${Date.now()}.json`)
    await copyFile(this.paths.configFile, backup)
  }
}
