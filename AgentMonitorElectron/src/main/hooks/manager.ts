import { app } from 'electron'
import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import type { CliSource, HookPreview, HookStatus } from '../../shared/types'
import type { AppPaths } from '../paths'
import { extractAgentMonitorStopHooks } from './filter'

interface HookEntry {
  matcher?: string
  hooks: Array<{ type: 'command'; command: string }>
}

interface HooksDocument {
  hooks?: Record<string, HookEntry[]>
  [key: string]: unknown
}

export class HookManager {
  constructor(private readonly paths: AppPaths) {}

  async getStatuses(): Promise<Record<CliSource, HookStatus>> {
    const [claude, codex] = await Promise.all([this.getStatus('claude'), this.getStatus('codex')])
    return { claude, codex }
  }

  async getStatus(source: CliSource): Promise<HookStatus> {
    const configPath = this.getConfigPath(source)
    try {
      const content = await readFile(configPath, 'utf8')
      const document = JSON.parse(content) as HooksDocument
      const configured = this.hasOwnHook(document, source)
      return {
        source,
        state: configured ? 'configured' : 'notConfigured',
        configPath,
        message: configured
          ? source === 'codex'
            ? 'Hook 已配置；首次运行时请在 Codex CLI 中确认信任'
            : '官方 Stop Hook 已配置'
          : '已检测到 CLI 配置，但尚未配置提醒 Hook'
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        return {
          source,
          state: 'notConfigured',
          configPath,
          message: '尚未找到 Hook 配置文件，可点击配置'
        }
      }
      return {
        source,
        state: 'invalid',
        configPath,
        message: 'Hook 配置无法读取或格式无效'
      }
    }
  }

  async install(source: CliSource): Promise<HookStatus> {
    const configPath = this.getConfigPath(source)
    await mkdir(dirname(configPath), { recursive: true })

    let document: HooksDocument = {}
    try {
      const content = await readFile(configPath, 'utf8')
      document = JSON.parse(content) as HooksDocument
      await this.backup(configPath, source)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new Error('HOOK_CONFIG_INVALID', { cause: error })
      }
    }

    if (!document.hooks || typeof document.hooks !== 'object') {
      document.hooks = {}
    }
    const stopEntries = Array.isArray(document.hooks.Stop) ? document.hooks.Stop : []
    const command = this.createHookCommand(source)
    let updatedExistingHook = false
    for (const entry of stopEntries) {
      for (const hook of entry.hooks) {
        if (hook.command.includes(`--agent-monitor-hook=${source}`)) {
          hook.type = 'command'
          hook.command = command
          updatedExistingHook = true
        }
      }
    }
    if (!updatedExistingHook) {
      stopEntries.push({
        hooks: [
          {
            type: 'command',
            command
          }
        ]
      })
    }
    document.hooks.Stop = stopEntries
    await this.atomicWrite(configPath, document)
    return this.getStatus(source)
  }

  async repair(source: CliSource): Promise<HookStatus> {
    return this.install(source)
  }

  async getPreview(source: CliSource): Promise<HookPreview> {
    const configPath = this.getConfigPath(source)
    const document: unknown = JSON.parse(await readFile(configPath, 'utf8'))
    const entries = extractAgentMonitorStopHooks(document, source)
    if (entries.length === 0) throw new Error('HOOK_NOT_CONFIGURED')
    return {
      source,
      configPath,
      content: JSON.stringify({ hooks: { Stop: entries } }, null, 2)
    }
  }

  getConfigPath(source: CliSource): string {
    if (source === 'claude') {
      return join(homedir(), '.claude', 'settings.json')
    }
    const codexHome = process.env.CODEX_HOME || join(homedir(), '.codex')
    return join(codexHome, 'hooks.json')
  }

  private hasOwnHook(document: HooksDocument, source: CliSource): boolean {
    const entries = document.hooks?.Stop
    if (!Array.isArray(entries)) return false
    return entries.some((entry) =>
      Array.isArray(entry.hooks)
        ? entry.hooks.some(
            (hook) =>
              typeof hook.command === 'string' &&
              hook.command.includes(`--agent-monitor-hook=${source}`)
          )
        : false
    )
  }

  private createHookCommand(source: CliSource): string {
    const executable = `"${process.execPath.replaceAll('"', '\\"')}"`
    const appPath = app.isPackaged ? '' : ` "${app.getAppPath().replaceAll('"', '\\"')}"`
    return `${executable}${appPath} --agent-monitor-hook=${source}`
  }

  private async backup(configPath: string, source: CliSource): Promise<void> {
    await mkdir(this.paths.backupDir, { recursive: true })
    await copyFile(configPath, join(this.paths.backupDir, `${source}-hooks-${Date.now()}.json`))
  }

  private async atomicWrite(path: string, document: HooksDocument): Promise<void> {
    const temporary = `${path}.agent-monitor.tmp`
    await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, 'utf8')
    await rename(temporary, path)
  }
}
