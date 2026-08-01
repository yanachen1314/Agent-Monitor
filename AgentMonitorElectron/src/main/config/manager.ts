import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, parse } from 'node:path'
import type { AppConfig, AudioLibraryItem, AudioMode, CliSource } from '../../shared/types'
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

const supportedAudioExtensions = new Set(['.wav', '.mp3', '.ogg'])

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
    if (!supportedAudioExtensions.has(extension)) {
      throw new Error('UNSUPPORTED_AUDIO')
    }
    const sourceStats = await stat(sourcePath)
    if (!sourceStats.isFile() || sourceStats.size > 20 * 1024 * 1024) {
      throw new Error('AUDIO_FILE_TOO_LARGE')
    }

    const originalName = parse(sourcePath)
      .name.replace(/[^\p{L}\p{N}._-]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)
    const safeName = `${target}-${Date.now()}-${originalName || 'audio'}${extension}`
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

  async getAudioLibrary(): Promise<AudioLibraryItem[]> {
    const builtinDirectory = dirname(this.paths.builtinAudio)
    const [builtinFiles, uploadedFiles] = await Promise.all([
      this.listAudioFiles(builtinDirectory),
      this.listAudioFiles(this.paths.audioDir, 'default-')
    ])

    const items: AudioLibraryItem[] = [
      ...builtinFiles.map((file) => ({
        id: `builtin://${file}`,
        name: this.audioDisplayName(file, 'builtin'),
        format: extname(file).slice(1).toUpperCase(),
        source: 'builtin' as const,
        selected: this.config.defaultAudio.path === `builtin://${file}`
      })),
      ...uploadedFiles.map((file) => {
        const path = join(this.paths.audioDir, file)
        return {
          id: `uploaded://${file}`,
          name: this.audioDisplayName(file, 'uploaded'),
          format: extname(file).slice(1).toUpperCase(),
          source: 'uploaded' as const,
          selected: this.config.defaultAudio.path === path
        }
      })
    ]

    return items.sort((left, right) => {
      if (left.source !== right.source) return left.source === 'builtin' ? -1 : 1
      return left.name.localeCompare(right.name, 'zh-CN')
    })
  }

  async selectDefaultAudio(id: string): Promise<AppConfig> {
    const path = await this.resolveLibraryAudio(id)
    this.config.defaultAudio.source = id.startsWith('builtin://') ? 'builtin' : 'imported'
    this.config.defaultAudio.path = id.startsWith('builtin://') ? id : path
    return this.saveAndGet()
  }

  async deleteUploadedAudio(id: string): Promise<AppConfig> {
    if (!id.startsWith('uploaded://')) throw new Error('BUILTIN_AUDIO_CANNOT_BE_DELETED')
    const path = await this.resolveLibraryAudio(id)
    await rm(path, { force: true })
    if (this.config.defaultAudio.path === path) {
      this.config.defaultAudio.source = 'builtin'
      this.config.defaultAudio.path = 'builtin://complete.wav'
    }
    return this.saveAndGet()
  }

  async resolveLibraryAudio(id: string): Promise<string> {
    const builtin = id.startsWith('builtin://')
    const uploaded = id.startsWith('uploaded://')
    if (!builtin && !uploaded) throw new Error('INVALID_AUDIO_LIBRARY_ID')
    const file = id.slice(id.indexOf('://') + 3)
    if (
      !file ||
      basename(file) !== file ||
      !supportedAudioExtensions.has(extname(file).toLowerCase())
    ) {
      throw new Error('INVALID_AUDIO_LIBRARY_ID')
    }
    if (uploaded && !file.startsWith('default-')) throw new Error('INVALID_AUDIO_LIBRARY_ID')
    const path = join(builtin ? dirname(this.paths.builtinAudio) : this.paths.audioDir, file)
    const fileStats = await stat(path).catch(() => null)
    if (!fileStats?.isFile()) throw new Error('AUDIO_NOT_FOUND')
    return path
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

  private async listAudioFiles(directory: string, prefix = ''): Promise<string[]> {
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
    return entries
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name.startsWith(prefix) &&
          supportedAudioExtensions.has(extname(entry.name).toLowerCase())
      )
      .map((entry) => entry.name)
  }

  private audioDisplayName(file: string, source: 'builtin' | 'uploaded'): string {
    const stem = parse(file).name
    if (source === 'builtin' && stem === 'complete') return '默认提示音'
    if (source === 'uploaded') return stem.replace(/^default-\d+-?/, '') || stem
    return stem.replace(/[-_]+/g, ' ')
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
