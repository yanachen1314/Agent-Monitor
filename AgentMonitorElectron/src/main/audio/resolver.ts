import { access } from 'node:fs/promises'
import type { AppConfig, CliSource, ResolvedAudio } from '../../shared/types'
import type { AppPaths } from '../paths'

export class AudioResolver {
  constructor(private readonly paths: AppPaths) {}

  async resolve(config: AppConfig, source: CliSource): Promise<ResolvedAudio> {
    const monitor = config.monitors[source]
    if (monitor.audioMode === 'custom' && monitor.customAudioPath) {
      if (await this.isReadable(monitor.customAudioPath)) {
        return {
          path: monitor.customAudioPath,
          volume: config.defaultAudio.volume,
          fallbackUsed: false
        }
      }
    }

    const defaultPath = config.defaultAudio.path.startsWith('builtin://')
      ? this.paths.builtinAudio
      : config.defaultAudio.path

    if (await this.isReadable(defaultPath)) {
      return {
        path: defaultPath,
        volume: config.defaultAudio.volume,
        fallbackUsed: monitor.audioMode === 'custom'
      }
    }

    return {
      path: this.paths.builtinAudio,
      volume: config.defaultAudio.volume,
      fallbackUsed: true
    }
  }

  async resolvePreview(config: AppConfig, target: 'default' | CliSource): Promise<ResolvedAudio> {
    if (target === 'default') {
      const path = config.defaultAudio.path.startsWith('builtin://')
        ? this.paths.builtinAudio
        : config.defaultAudio.path
      return {
        path: (await this.isReadable(path)) ? path : this.paths.builtinAudio,
        volume: config.defaultAudio.volume,
        fallbackUsed: !(await this.isReadable(path))
      }
    }
    return this.resolve(config, target)
  }

  private async isReadable(path: string): Promise<boolean> {
    try {
      await access(path)
      return true
    } catch {
      return false
    }
  }
}
