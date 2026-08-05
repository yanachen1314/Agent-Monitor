import { dirname, extname, join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  shell,
  Tray,
  type IpcMainInvokeEvent
} from 'electron'
import { electronApp, is } from '@electron-toolkit/utils'
import type {
  AppConfig,
  AudioMode,
  AudioPlayResult,
  CliSource,
  IpcResponse,
  LogLevel,
  ProjectWebsite,
  RuntimeState,
  TurnStoppedEvent,
  UpdateState
} from '../shared/types'
import { channels } from '../shared/channels'
import { runHookClient } from '../hook'
import { createAppPaths, type AppPaths } from './paths'
import { ConfigManager } from './config/manager'
import { AudioResolver } from './audio/resolver'
import { AudioQueue } from './audio/queue'
import { EventProcessor } from './events/processor'
import { LocalIpcServer } from './ipc/server'
import { HookManager } from './hooks/manager'
import {
  createTraceId,
  hashIdentifier,
  initializeLogger,
  serializeError,
  summarizePath
} from './logging/logger'
import { createTrayIcon } from './tray-icon'
import { UpdateService } from './update/service'
import { isSafeExternalUrl } from './security/external-url'
import { getAutoStartState, shouldStartHidden, syncLoginItem } from './login-item'
import { getWindowChromeOptions } from './window-chrome'

const hookSource = parseHookSource(process.argv)

if (hookSource) {
  app.whenReady().then(async () => {
    const paths = createAppPaths()
    const response = await runHookClient(hookSource, paths.runtimeFile, process.stdin, {
      recoverRuntime: startHiddenDesktopApplication
    })
    if (!response?.ok) {
      process.stderr.write(`Agent Monitor Hook 发送失败：${response?.code ?? 'IPC_UNAVAILABLE'}\n`)
      app.exit(1)
      return
    }
    process.stdout.write('{"continue":true}\n')
    app.exit(0)
  })
} else {
  startDesktopApplication()
}

function startHiddenDesktopApplication(): void {
  const args = app.isPackaged ? ['--hidden'] : [app.getAppPath(), '--hidden']
  const child = spawn(process.execPath, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  })
  child.unref()
}

function startDesktopApplication(): void {
  const hasLock = app.requestSingleInstanceLock()
  if (!hasLock) {
    app.quit()
    return
  }

  let mainWindow: BrowserWindow | null = null
  let tray: Tray | null = null
  const projectWebsites: Record<ProjectWebsite, string> = {
    github: 'https://github.com/yanachen1314/Agent-Monitor',
    gitee: 'https://gitee.com/yanachen1314/agent-monitor'
  }
  let quitting = false
  let shutdownStarted = false
  let installingUpdate = false
  let paths: AppPaths
  let configManager: ConfigManager
  let hookManager: HookManager
  let eventProcessor: EventProcessor
  let audioResolver: AudioResolver
  let audioQueue: AudioQueue
  let ipcServer: LocalIpcServer
  let updateService: UpdateService
  let logger: ReturnType<typeof initializeLogger>
  let lastLoggedConfig: AppConfig | null = null
  let startHidden = process.argv.includes('--hidden')
  let resolveRendererReady: (() => void) | null = null
  const rendererReady = new Promise<void>((resolve) => {
    resolveRendererReady = resolve
  })

  const assertTrustedFrame = (event: IpcMainInvokeEvent): void => {
    if (!mainWindow || event.sender.id !== mainWindow.webContents.id) {
      throw new Error('UNTRUSTED_RENDERER')
    }
  }

  const emitConfig = (config: AppConfig): void => {
    const changes = lastLoggedConfig ? describeConfigChanges(lastLoggedConfig, config) : []
    if (changes.length > 0) {
      logger.info('config', 'config_changed', '应用配置已更新', { changes })
    }
    lastLoggedConfig = structuredClone(config)
    mainWindow?.webContents.send(channels.configChanged, config)
    rebuildTray()
  }

  const getRuntimeState = async (): Promise<RuntimeState> => {
    const ipcRuntime = ipcServer.getRuntime()
    return {
      running: true,
      ipcPort: ipcRuntime?.transport === 'tcp' ? ipcRuntime.port : null,
      autoStart: getAutoStartState(app, process.platform),
      hooks: await hookManager.getStatuses(),
      lastEvent: eventProcessor.getLastEvent(),
      recentActivities: eventProcessor.getActivities()
    }
  }

  const emitRuntime = async (): Promise<void> => {
    mainWindow?.webContents.send(channels.runtimeChanged, await getRuntimeState())
    rebuildTray()
  }

  const emitUpdateState = (state: UpdateState): void => {
    mainWindow?.webContents.send(channels.updateStateChanged, state)
  }

  const prepareUpdateInstall = async (): Promise<void> => {
    if (installingUpdate) return
    installingUpdate = true
    quitting = true
    shutdownStarted = true
    audioQueue?.shutdown()
    try {
      await ipcServer?.stop()
    } catch (error) {
      logger?.error('ipc', 'ipc_stop_failed_for_update', '安装更新前停止 IPC 服务失败', {
        error: serializeError(error)
      })
    }
  }

  const emitRuntimeSafely = (traceId?: string): void => {
    void emitRuntime().catch((error) => {
      logger.error('runtime', 'runtime_emit_failed', '运行状态广播失败', {
        traceId,
        error: serializeError(error)
      })
    })
  }

  const onStoppedEvent = async (event: TurnStoppedEvent): Promise<IpcResponse> => {
    const traceId = event.traceId ?? createTraceId()
    const normalizedEvent = { ...event, traceId }
    const config = configManager.get()
    const startedAt = Date.now()
    const result = eventProcessor.process(normalizedEvent, config)
    logger.info('event', 'turn_stopped_processed', '单轮停止事件处理完成', {
      traceId,
      source: event.source,
      resultCode: result.code,
      shouldPlay: result.shouldPlay,
      eventDelayMs: Math.max(0, Date.now() - event.timestamp),
      durationMs: Date.now() - startedAt,
      sessionIdHash: hashIdentifier(event.sessionId),
      turnIdHash: hashIdentifier(event.turnId),
      workspaceName: summarizePath(event.cwd),
      globalPaused: config.globalPaused,
      monitorEnabled: config.monitors[event.source].enabled
    })
    if (result.shouldPlay) {
      const audio = await audioResolver.resolve(config, event.source)
      const audioContext = {
        traceId,
        source: event.source,
        fileName: summarizePath(audio.path),
        fallbackUsed: audio.fallbackUsed
      }
      if (audio.fallbackUsed) {
        logger.warn(
          'audio',
          'audio_fallback_used',
          '配置的提示音不可用，已回退到内置提示音',
          audioContext
        )
      } else {
        logger.debug('audio', 'audio_resolved', '提示音解析成功', audioContext)
      }
      void audioQueue
        .enqueue(audio, { traceId, source: event.source, kind: 'notification' })
        .catch((error) => {
          logger.error('audio', 'notification_failed', '停止事件提醒播放失败', {
            traceId,
            source: event.source,
            error: serializeError(error)
          })
          eventProcessor.markLatestFailed()
          emitRuntimeSafely(traceId)
        })
    }
    emitRuntimeSafely(traceId)
    return { ok: true, code: result.code }
  }

  const createWindow = (): BrowserWindow => {
    const window = new BrowserWindow({
      width: 1060,
      height: 760,
      minWidth: 900,
      minHeight: 650,
      show: false,
      ...getWindowChromeOptions(process.platform),
      transparent: false,
      backgroundColor: '#f8f6ff',
      title: 'Agent Monitor',
      webPreferences: {
        preload: join(__dirname, '../preload/index.cjs'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true
      }
    })

    window.webContents.setWindowOpenHandler(({ url }) => {
      if (!isSafeExternalUrl(url)) {
        logger.warn('security', 'external_url_blocked', '已阻止打开不安全的外部链接')
        return { action: 'deny' }
      }
      void shell.openExternal(url).catch((error) => {
        logger.error('links', 'external_url_open_failed', '外部链接打开失败', {
          error: serializeError(error)
        })
      })
      return { action: 'deny' }
    })
    window.webContents.once('did-finish-load', () => {
      logger.info('renderer', 'renderer_ready', 'Renderer 页面加载完成')
      resolveRendererReady?.()
    })
    window.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
      logger.error('renderer', 'renderer_load_failed', 'Renderer 页面加载失败', {
        errorCode,
        errorDescription
      })
    })
    window.webContents.on('render-process-gone', (_event, details) => {
      logger.error('renderer', 'renderer_process_gone', 'Renderer 进程异常退出', {
        reason: details.reason,
        exitCode: details.exitCode
      })
    })
    window.on('unresponsive', () => {
      logger.warn('renderer', 'renderer_unresponsive', 'Renderer 无响应')
    })
    window.webContents.on('will-navigate', (event, url) => {
      const allowed =
        is.dev && process.env.ELECTRON_RENDERER_URL
          ? url.startsWith(process.env.ELECTRON_RENDERER_URL)
          : url.startsWith('file://')
      if (!allowed) {
        logger.warn('security', 'renderer_navigation_blocked', '已阻止 Renderer 导航到非信任地址')
        event.preventDefault()
      }
    })
    window.on('close', (event) => {
      if (!quitting && configManager.get().closeToTray) {
        event.preventDefault()
        window.hide()
      } else if (!quitting) {
        quitting = true
        app.quit()
      }
    })
    window.on('ready-to-show', () => {
      if (!startHidden) window.show()
    })
    window.on('maximize', () => {
      window.webContents.send(channels.windowMaximizedChanged, true)
    })
    window.on('unmaximize', () => {
      window.webContents.send(channels.windowMaximizedChanged, false)
    })

    if (is.dev && process.env.ELECTRON_RENDERER_URL) {
      void window.loadURL(process.env.ELECTRON_RENDERER_URL)
    } else {
      void window.loadFile(join(__dirname, '../renderer/index.html'))
    }
    return window
  }

  const showMainWindow = (): void => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }

  const openSettings = (): void => {
    if (!mainWindow) return
    showMainWindow()
    const sendOpenSettings = (): void => {
      mainWindow?.webContents.send(channels.windowOpenSettings)
    }
    if (mainWindow.webContents.isLoadingMainFrame()) {
      mainWindow.webContents.once('did-finish-load', sendOpenSettings)
    } else {
      sendOpenSettings()
    }
  }

  const rebuildTray = (): void => {
    if (!tray || !configManager) return
    const config = configManager.get()
    const label = (source: CliSource): string =>
      `${source === 'claude' ? 'Claude Code' : 'Codex'}：${
        config.monitors[source].enabled ? '已开启' : '已关闭'
      }`
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: config.globalPaused ? '监控状态：已暂停' : '监控状态：运行中', enabled: false },
        { label: label('claude'), enabled: false },
        { label: label('codex'), enabled: false },
        { type: 'separator' },
        {
          label: '测试提示音',
          click: () => void previewAudio('default')
        },
        { label: '打开设置', click: openSettings },
        {
          label: config.globalPaused ? '恢复全部监控' : '暂停全部监控',
          click: async () => {
            emitConfig(await configManager.setGlobalPaused(!config.globalPaused))
          }
        },
        { type: 'separator' },
        {
          label: '退出',
          click: () => {
            quitting = true
            app.quit()
          }
        }
      ])
    )
  }

  const createTray = (): Tray => {
    const instance = new Tray(createTrayIcon())
    instance.setToolTip('Agent Monitor')
    instance.on('click', showMainWindow)
    return instance
  }

  const previewAudio = async (target: 'default' | CliSource): Promise<void> => {
    const audio = await audioResolver.resolvePreview(configManager.get(), target)
    await audioQueue.enqueue(audio, {
      traceId: createTraceId(),
      ...(target === 'default' ? {} : { source: target }),
      kind: 'preview'
    })
  }

  const registerIpcHandlers = (): void => {
    ipcMain.on(channels.windowMinimize, (event) => {
      if (mainWindow && event.sender.id === mainWindow.webContents.id) mainWindow.minimize()
    })
    ipcMain.on(channels.windowToggleMaximize, (event) => {
      if (!mainWindow || event.sender.id !== mainWindow.webContents.id) return
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize()
      } else {
        mainWindow.maximize()
      }
    })
    ipcMain.handle(channels.windowGetMaximized, (event) => {
      assertTrustedFrame(event)
      return mainWindow?.isMaximized() ?? false
    })
    ipcMain.on(channels.windowClose, (event) => {
      if (mainWindow && event.sender.id === mainWindow.webContents.id) mainWindow.close()
    })
    ipcMain.handle(channels.configGet, (event) => {
      assertTrustedFrame(event)
      return configManager.get()
    })
    ipcMain.handle(
      channels.configSetMonitor,
      async (event, source: CliSource, enabled: boolean) => {
        assertTrustedFrame(event)
        emitConfig(await configManager.setMonitorEnabled(source, Boolean(enabled)))
        return configManager.get()
      }
    )
    ipcMain.handle(
      channels.configSetAudioMode,
      async (event, source: CliSource, mode: AudioMode) => {
        assertTrustedFrame(event)
        if (!['default', 'custom'].includes(mode)) throw new Error('INVALID_AUDIO_MODE')
        emitConfig(await configManager.setAudioMode(source, mode))
        return configManager.get()
      }
    )
    ipcMain.handle(channels.configSetVolume, async (event, volume: number) => {
      assertTrustedFrame(event)
      emitConfig(await configManager.setDefaultVolume(Number(volume)))
      return configManager.get()
    })
    ipcMain.handle(channels.configSetGlobalPaused, async (event, paused: boolean) => {
      assertTrustedFrame(event)
      emitConfig(await configManager.setGlobalPaused(Boolean(paused)))
      return configManager.get()
    })
    ipcMain.handle(channels.configSetCloseToTray, async (event, enabled: boolean) => {
      assertTrustedFrame(event)
      emitConfig(await configManager.setCloseToTray(Boolean(enabled)))
      return configManager.get()
    })
    ipcMain.handle(channels.configSetAutoStart, async (event, enabled: boolean) => {
      assertTrustedFrame(event)
      const desired = Boolean(enabled)
      emitConfig(await configManager.setAutoStart(desired))
      syncLoginItem(app, process.platform, desired)
      emitRuntimeSafely()
      return configManager.get()
    })
    ipcMain.handle(channels.configSetLogLevel, async (event, level: LogLevel) => {
      assertTrustedFrame(event)
      if (!['debug', 'info', 'warn', 'error'].includes(level)) {
        throw new Error('INVALID_LOG_LEVEL')
      }
      const config = await configManager.setLogLevel(level)
      logger.setLevel(config.logLevel)
      emitConfig(config)
      return config
    })
    ipcMain.handle(channels.audioImport, async (event, target: 'default' | CliSource) => {
      assertTrustedFrame(event)
      if (!['default', 'claude', 'codex'].includes(target)) {
        throw new Error('INVALID_AUDIO_TARGET')
      }
      const result = await dialog.showOpenDialog(mainWindow!, {
        title: '选择提示音',
        properties: ['openFile'],
        filters: [{ name: '音频文件', extensions: ['wav', 'mp3', 'ogg'] }]
      })
      const file = result.filePaths[0]
      if (result.canceled || !file) return null
      const config = await configManager.importAudio(file, target)
      emitConfig(config)
      return config
    })
    ipcMain.handle(channels.audioPreview, async (event, target: 'default' | CliSource) => {
      assertTrustedFrame(event)
      await previewAudio(target)
    })
    ipcMain.handle(channels.audioRestoreBuiltin, async (event) => {
      assertTrustedFrame(event)
      const config = await configManager.restoreBuiltinAudio()
      emitConfig(config)
      return config
    })
    ipcMain.handle(channels.audioLibraryGet, async (event) => {
      assertTrustedFrame(event)
      return configManager.getAudioLibrary()
    })
    ipcMain.handle(channels.audioLibrarySelect, async (event, id: string) => {
      assertTrustedFrame(event)
      const config = await configManager.selectDefaultAudio(String(id))
      emitConfig(config)
      return config
    })
    ipcMain.handle(channels.audioLibraryPreview, async (event, id: string) => {
      assertTrustedFrame(event)
      const path = await configManager.resolveLibraryAudio(String(id))
      await audioQueue.enqueue({
        path,
        volume: configManager.get().defaultAudio.volume,
        fallbackUsed: false
      })
    })
    ipcMain.handle(channels.audioLibraryDelete, async (event, id: string) => {
      assertTrustedFrame(event)
      const config = await configManager.deleteUploadedAudio(String(id))
      emitConfig(config)
      return config
    })
    ipcMain.on(channels.audioResult, (event, result: AudioPlayResult) => {
      if (mainWindow && event.sender.id === mainWindow.webContents.id) {
        audioQueue.handleResult(result)
      }
    })
    ipcMain.on(channels.loggingRendererError, (event, error: unknown) => {
      if (!mainWindow || event.sender.id !== mainWindow.webContents.id) return
      const candidate = error as { message?: unknown; stack?: unknown }
      logger.error('renderer', 'renderer_unhandled_error', 'Renderer 发生未捕获异常', {
        error: {
          name: 'RendererError',
          message:
            typeof candidate?.message === 'string'
              ? candidate.message.slice(0, 2_000)
              : 'Unknown renderer error',
          ...(typeof candidate?.stack === 'string'
            ? { stack: candidate.stack.slice(0, 10_000) }
            : {})
        }
      })
    })
    ipcMain.handle(channels.hooksGetStatus, async (event) => {
      assertTrustedFrame(event)
      return hookManager.getStatuses()
    })
    ipcMain.handle(channels.hooksGetPreview, async (event, source: CliSource) => {
      assertTrustedFrame(event)
      return hookManager.getPreview(assertCliSource(source))
    })
    ipcMain.handle(channels.hooksOpenDirectory, async (event, source: CliSource) => {
      assertTrustedFrame(event)
      const result = await shell.openPath(
        dirname(hookManager.getConfigPath(assertCliSource(source)))
      )
      if (result) throw new Error(result)
    })
    ipcMain.handle(channels.hooksInstall, async (event, source: CliSource) => {
      assertTrustedFrame(event)
      const validSource = assertCliSource(source)
      try {
        const status = await hookManager.install(validSource)
        logger.info('hook', 'hook_installed', '提醒 Hook 安装完成', {
          source: validSource,
          state: status.state
        })
        emitRuntimeSafely()
        return status
      } catch (error) {
        logger.error('hook', 'hook_install_failed', '提醒 Hook 安装失败', {
          source: validSource,
          error: serializeError(error)
        })
        throw error
      }
    })
    ipcMain.handle(channels.hooksRepair, async (event, source: CliSource) => {
      assertTrustedFrame(event)
      const validSource = assertCliSource(source)
      try {
        const status = await hookManager.repair(validSource)
        logger.info('hook', 'hook_repaired', '提醒 Hook 修复完成', {
          source: validSource,
          state: status.state
        })
        emitRuntimeSafely()
        return status
      } catch (error) {
        logger.error('hook', 'hook_repair_failed', '提醒 Hook 修复失败', {
          source: validSource,
          error: serializeError(error)
        })
        throw error
      }
    })
    ipcMain.handle(channels.runtimeGet, async (event) => {
      assertTrustedFrame(event)
      return getRuntimeState()
    })
    ipcMain.handle(channels.updateGetState, (event) => {
      assertTrustedFrame(event)
      return updateService.getState()
    })
    ipcMain.handle(channels.updateCheck, async (event) => {
      assertTrustedFrame(event)
      return updateService.checkForUpdates()
    })
    ipcMain.handle(channels.updateDownload, async (event) => {
      assertTrustedFrame(event)
      return updateService.downloadUpdate()
    })
    ipcMain.handle(channels.updateInstall, async (event) => {
      assertTrustedFrame(event)
      await updateService.installUpdate()
    })
    ipcMain.handle(channels.linksOpenProject, async (event, target: ProjectWebsite) => {
      assertTrustedFrame(event)
      if (target !== 'github' && target !== 'gitee') throw new Error('INVALID_PROJECT_WEBSITE')
      await shell.openExternal(projectWebsites[target])
    })
    ipcMain.handle(channels.logsOpenDirectory, async (event) => {
      assertTrustedFrame(event)
      await shell.openPath(paths.logDir)
    })
  }

  app.on('second-instance', () => showMainWindow())
  app.on('window-all-closed', () => {
    // 托盘应用在窗口关闭后继续运行。
  })
  app.on('before-quit', (event) => {
    if (installingUpdate) return
    if (shutdownStarted) return
    event.preventDefault()
    shutdownStarted = true
    quitting = true
    logger?.info('app', 'app_quitting', 'Agent Monitor 正在退出')
    audioQueue?.shutdown()
    void ipcServer
      ?.stop()
      .catch((error) => {
        logger?.error('ipc', 'ipc_stop_failed', 'IPC 服务停止失败', {
          error: serializeError(error)
        })
      })
      .finally(() => app.exit(0))
  })

  void app
    .whenReady()
    .then(async () => {
      electronApp.setAppUserModelId('com.agentmonitor.desktop')
      startHidden = shouldStartHidden(app, process.platform, process.argv)
      paths = createAppPaths()
      logger = initializeLogger(paths, await readConfiguredLogLevel(paths.configFile))
      registerGlobalErrorLogging(logger)
      logger.info('app', 'app_starting', 'Agent Monitor 正在启动', {
        electronVersion: process.versions.electron,
        nodeVersion: process.versions.node,
        packaged: app.isPackaged,
        hidden: startHidden
      })
      configManager = new ConfigManager(paths, logger)
      const initialConfig = await configManager.initialize()
      logger.setLevel(initialConfig.logLevel)
      lastLoggedConfig = structuredClone(initialConfig)
      syncLoginItem(app, process.platform, initialConfig.autoStart)
      hookManager = new HookManager(paths)
      await refreshConfiguredHooks(hookManager, logger).catch((error) => {
        logger.error('hook', 'hook_refresh_failed', '刷新 Hook 命令失败', {
          error: serializeError(error)
        })
      })
      eventProcessor = new EventProcessor()
      audioResolver = new AudioResolver(paths)
      audioQueue = new AudioQueue(async (command) => {
        await rendererReady
        const content = await readFile(command.path)
        const extension = extname(command.path).toLowerCase()
        const mime =
          extension === '.mp3' ? 'audio/mpeg' : extension === '.ogg' ? 'audio/ogg' : 'audio/wav'
        mainWindow?.webContents.send(channels.audioPlay, {
          ...command,
          path: `data:${mime};base64,${content.toString('base64')}`
        })
      }, logger)
      ipcServer = new LocalIpcServer(paths, onStoppedEvent, logger)
      updateService = new UpdateService({
        logger,
        emitState: emitUpdateState,
        prepareInstall: prepareUpdateInstall
      })
      registerIpcHandlers()
      mainWindow = createWindow()
      updateService.initialize()
      tray = createTray()
      rebuildTray()
      await ipcServer.start()
      await emitRuntime()
      logger.info('app', 'app_ready', 'Agent Monitor 已启动', {
        transport: ipcServer.getRuntime()?.transport,
        monitors: {
          claude: initialConfig.monitors.claude.enabled,
          codex: initialConfig.monitors.codex.enabled
        },
        globalPaused: initialConfig.globalPaused
      })
    })
    .catch((error) => {
      if (logger) {
        logger.error('app', 'app_start_failed', 'Agent Monitor 启动失败', {
          error: serializeError(error)
        })
      } else {
        process.stderr.write(`Agent Monitor 启动失败：${String(error)}\n`)
      }
      app.exit(1)
    })
}

async function refreshConfiguredHooks(
  hookManager: HookManager,
  logger: ReturnType<typeof initializeLogger>
): Promise<void> {
  for (const source of ['claude', 'codex'] as const) {
    const status = await hookManager.getStatus(source)
    logger.info('hook', 'hook_status_checked', '提醒 Hook 状态检查完成', {
      source,
      state: status.state
    })
    if (status.state === 'configured') await hookManager.repair(source)
  }
}

function parseHookSource(args: string[]): CliSource | null {
  const argument = args.find((value) => value.startsWith('--agent-monitor-hook='))
  const source = argument?.split('=')[1]
  return source === 'claude' || source === 'codex' ? source : null
}

function assertCliSource(value: unknown): CliSource {
  if (value === 'claude' || value === 'codex') return value
  throw new Error('INVALID_CLI_SOURCE')
}

async function readConfiguredLogLevel(configFile: string): Promise<LogLevel> {
  try {
    const parsed = JSON.parse(await readFile(configFile, 'utf8')) as { logLevel?: unknown }
    return ['debug', 'info', 'warn', 'error'].includes(String(parsed.logLevel))
      ? (parsed.logLevel as LogLevel)
      : 'info'
  } catch {
    return 'info'
  }
}

function registerGlobalErrorLogging(logger: ReturnType<typeof initializeLogger>): void {
  process.on('uncaughtExceptionMonitor', (error, origin) => {
    logger.error('app', 'uncaught_exception', '主进程发生未捕获异常', {
      severity: 'critical',
      recoverable: false,
      origin,
      error: serializeError(error)
    })
  })
  process.on('unhandledRejection', (reason) => {
    logger.error('app', 'unhandled_rejection', '主进程发生未处理的 Promise 拒绝', {
      severity: 'critical',
      error: serializeError(reason)
    })
  })
}

function describeConfigChanges(previous: AppConfig, next: AppConfig): string[] {
  const changes: string[] = []
  const compare = (name: string, before: unknown, after: unknown): void => {
    if (before !== after) changes.push(name)
  }
  compare('globalPaused', previous.globalPaused, next.globalPaused)
  compare('autoStart', previous.autoStart, next.autoStart)
  compare('closeToTray', previous.closeToTray, next.closeToTray)
  compare('logLevel', previous.logLevel, next.logLevel)
  compare('defaultAudio.source', previous.defaultAudio.source, next.defaultAudio.source)
  compare('defaultAudio.path', previous.defaultAudio.path, next.defaultAudio.path)
  compare('defaultAudio.volume', previous.defaultAudio.volume, next.defaultAudio.volume)
  for (const source of ['claude', 'codex'] as const) {
    compare(
      `monitors.${source}.enabled`,
      previous.monitors[source].enabled,
      next.monitors[source].enabled
    )
    compare(
      `monitors.${source}.audioMode`,
      previous.monitors[source].audioMode,
      next.monitors[source].audioMode
    )
    compare(
      `monitors.${source}.customAudioPath`,
      previous.monitors[source].customAudioPath,
      next.monitors[source].customAudioPath
    )
  }
  return changes
}
