import { dirname, extname, join } from 'node:path'
import { readFile } from 'node:fs/promises'
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
  RuntimeState,
  TurnStoppedEvent
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
import { initializeLogger } from './logging/logger'
import { createTrayIcon } from './tray-icon'

const hookSource = parseHookSource(process.argv)

if (hookSource) {
  app.whenReady().then(async () => {
    const paths = createAppPaths()
    await runHookClient(hookSource, paths.runtimeFile)
    app.exit(0)
  })
} else {
  startDesktopApplication()
}

function startDesktopApplication(): void {
  const hasLock = app.requestSingleInstanceLock()
  if (!hasLock) {
    app.quit()
    return
  }

  let mainWindow: BrowserWindow | null = null
  let tray: Tray | null = null
  let quitting = false
  let shutdownStarted = false
  let paths: AppPaths
  let configManager: ConfigManager
  let hookManager: HookManager
  let eventProcessor: EventProcessor
  let audioResolver: AudioResolver
  let audioQueue: AudioQueue
  let ipcServer: LocalIpcServer
  let logger: ReturnType<typeof initializeLogger>

  const assertTrustedFrame = (event: IpcMainInvokeEvent): void => {
    if (!mainWindow || event.sender.id !== mainWindow.webContents.id) {
      throw new Error('UNTRUSTED_RENDERER')
    }
  }

  const emitConfig = (config: AppConfig): void => {
    mainWindow?.webContents.send(channels.configChanged, config)
    rebuildTray()
  }

  const getRuntimeState = async (): Promise<RuntimeState> => ({
    running: true,
    ipcPort: ipcServer.getRuntime()?.port ?? null,
    hooks: await hookManager.getStatuses(),
    lastEvent: eventProcessor.getLastEvent(),
    recentActivities: eventProcessor.getActivities()
  })

  const emitRuntime = async (): Promise<void> => {
    mainWindow?.webContents.send(channels.runtimeChanged, await getRuntimeState())
    rebuildTray()
  }

  const onStoppedEvent = async (event: TurnStoppedEvent): Promise<IpcResponse> => {
    const result = eventProcessor.process(event, configManager.get())
    logger.info(`收到 ${event.source} 单轮停止事件：${result.code}`)
    if (result.shouldPlay) {
      const audio = await audioResolver.resolve(configManager.get(), event.source)
      void audioQueue.enqueue(audio).catch((error) => {
        logger.error('音频播放失败', error)
        eventProcessor.markLatestFailed()
        void emitRuntime()
      })
    }
    void emitRuntime()
    return { ok: true, code: result.code }
  }

  const createWindow = (): BrowserWindow => {
    const window = new BrowserWindow({
      width: 1060,
      height: 760,
      minWidth: 900,
      minHeight: 650,
      show: false,
      frame: false,
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

    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', (event, url) => {
      const allowed =
        is.dev && process.env.ELECTRON_RENDERER_URL
          ? url.startsWith(process.env.ELECTRON_RENDERER_URL)
          : url.startsWith('file://')
      if (!allowed) event.preventDefault()
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
      if (!process.argv.includes('--hidden')) window.show()
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

  const rebuildTray = (): void => {
    if (!tray || !configManager) return
    const config = configManager.get()
    const label = (source: CliSource): string =>
      `${source === 'claude' ? 'Claude Code' : 'Codex CLI'}：${
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
        { label: '打开设置', click: showMainWindow },
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
    await audioQueue.enqueue(audio)
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
      app.setLoginItemSettings({
        openAtLogin: Boolean(enabled),
        args: ['--hidden']
      })
      emitConfig(await configManager.setAutoStart(Boolean(enabled)))
      return configManager.get()
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
    ipcMain.on(channels.audioResult, (event, result: AudioPlayResult) => {
      if (mainWindow && event.sender.id === mainWindow.webContents.id) {
        audioQueue.handleResult(result)
      }
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
      const status = await hookManager.install(source)
      void emitRuntime()
      return status
    })
    ipcMain.handle(channels.hooksRepair, async (event, source: CliSource) => {
      assertTrustedFrame(event)
      const status = await hookManager.repair(source)
      void emitRuntime()
      return status
    })
    ipcMain.handle(channels.runtimeGet, async (event) => {
      assertTrustedFrame(event)
      return getRuntimeState()
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
    if (shutdownStarted) return
    event.preventDefault()
    shutdownStarted = true
    quitting = true
    audioQueue?.shutdown()
    void ipcServer
      ?.stop()
      .catch(() => undefined)
      .finally(() => app.exit(0))
  })

  void app.whenReady().then(async () => {
    electronApp.setAppUserModelId('com.agentmonitor.desktop')
    paths = createAppPaths()
    logger = initializeLogger(paths)
    configManager = new ConfigManager(paths)
    const initialConfig = await configManager.initialize()
    app.setLoginItemSettings({
      openAtLogin: initialConfig.autoStart,
      args: ['--hidden']
    })
    hookManager = new HookManager(paths)
    eventProcessor = new EventProcessor()
    audioResolver = new AudioResolver(paths)
    audioQueue = new AudioQueue((command) => {
      void readFile(command.path)
        .then((content) => {
          const extension = extname(command.path).toLowerCase()
          const mime =
            extension === '.mp3' ? 'audio/mpeg' : extension === '.ogg' ? 'audio/ogg' : 'audio/wav'
          mainWindow?.webContents.send(channels.audioPlay, {
            ...command,
            path: `data:${mime};base64,${content.toString('base64')}`
          })
        })
        .catch((error: Error) => {
          audioQueue.handleResult({
            requestId: command.requestId,
            status: 'failed',
            message: error.message
          })
        })
    })
    ipcServer = new LocalIpcServer(paths, onStoppedEvent)
    registerIpcHandlers()
    mainWindow = createWindow()
    tray = createTray()
    rebuildTray()
    await ipcServer.start()
    await emitRuntime()
    logger.info('Agent Monitor 已启动')
  })
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
