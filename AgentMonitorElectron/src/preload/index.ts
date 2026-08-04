import { contextBridge, ipcRenderer } from 'electron'
import { channels } from '../shared/channels'
import type {
  AgentMonitorApi,
  AppConfig,
  AudioMode,
  AudioPlayCommand,
  AudioPlayResult,
  ProjectWebsite,
  RuntimeState,
  UpdateState
} from '../shared/types'

const api: AgentMonitorApi = {
  platform: process.platform,
  minimizeWindow: () => ipcRenderer.send(channels.windowMinimize),
  toggleMaximizeWindow: () => ipcRenderer.send(channels.windowToggleMaximize),
  isWindowMaximized: () => ipcRenderer.invoke(channels.windowGetMaximized),
  closeWindow: () => ipcRenderer.send(channels.windowClose),
  getConfig: () => ipcRenderer.invoke(channels.configGet),
  setMonitorEnabled: (source, enabled) =>
    ipcRenderer.invoke(channels.configSetMonitor, source, enabled),
  setAudioMode: (source, mode: AudioMode) =>
    ipcRenderer.invoke(channels.configSetAudioMode, source, mode),
  setDefaultVolume: (volume) => ipcRenderer.invoke(channels.configSetVolume, volume),
  setGlobalPaused: (paused) => ipcRenderer.invoke(channels.configSetGlobalPaused, paused),
  setCloseToTray: (enabled) => ipcRenderer.invoke(channels.configSetCloseToTray, enabled),
  setAutoStart: (enabled) => ipcRenderer.invoke(channels.configSetAutoStart, enabled),
  setLogLevel: (level) => ipcRenderer.invoke(channels.configSetLogLevel, level),
  importAudio: (target) => ipcRenderer.invoke(channels.audioImport, target),
  previewAudio: (target) => ipcRenderer.invoke(channels.audioPreview, target),
  restoreBuiltinAudio: () => ipcRenderer.invoke(channels.audioRestoreBuiltin),
  getAudioLibrary: () => ipcRenderer.invoke(channels.audioLibraryGet),
  selectDefaultAudio: (id) => ipcRenderer.invoke(channels.audioLibrarySelect, id),
  previewLibraryAudio: (id) => ipcRenderer.invoke(channels.audioLibraryPreview, id),
  deleteUploadedAudio: (id) => ipcRenderer.invoke(channels.audioLibraryDelete, id),
  getHookStatus: () => ipcRenderer.invoke(channels.hooksGetStatus),
  getHookPreview: (source) => ipcRenderer.invoke(channels.hooksGetPreview, source),
  openHookDirectory: (source) => ipcRenderer.invoke(channels.hooksOpenDirectory, source),
  installHook: (source) => ipcRenderer.invoke(channels.hooksInstall, source),
  repairHook: (source) => ipcRenderer.invoke(channels.hooksRepair, source),
  getRuntimeState: () => ipcRenderer.invoke(channels.runtimeGet),
  getUpdateState: () => ipcRenderer.invoke(channels.updateGetState),
  checkForUpdates: () => ipcRenderer.invoke(channels.updateCheck),
  downloadUpdate: () => ipcRenderer.invoke(channels.updateDownload),
  installUpdate: () => ipcRenderer.invoke(channels.updateInstall),
  openProjectWebsite: (target: ProjectWebsite) =>
    ipcRenderer.invoke(channels.linksOpenProject, target),
  openLogDirectory: () => ipcRenderer.invoke(channels.logsOpenDirectory),
  onConfigChanged: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, config: AppConfig): void =>
      callback(config)
    ipcRenderer.on(channels.configChanged, listener)
    return () => ipcRenderer.removeListener(channels.configChanged, listener)
  },
  onRuntimeChanged: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: RuntimeState): void =>
      callback(state)
    ipcRenderer.on(channels.runtimeChanged, listener)
    return () => ipcRenderer.removeListener(channels.runtimeChanged, listener)
  },
  onWindowMaximizedChanged: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, maximized: boolean): void =>
      callback(maximized)
    ipcRenderer.on(channels.windowMaximizedChanged, listener)
    return () => ipcRenderer.removeListener(channels.windowMaximizedChanged, listener)
  },
  onOpenSettings: (callback) => {
    const listener = (): void => callback()
    ipcRenderer.on(channels.windowOpenSettings, listener)
    return () => ipcRenderer.removeListener(channels.windowOpenSettings, listener)
  },
  onUpdateStateChanged: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: UpdateState): void =>
      callback(state)
    ipcRenderer.on(channels.updateStateChanged, listener)
    return () => ipcRenderer.removeListener(channels.updateStateChanged, listener)
  },
  onAudioCommand: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, command: AudioPlayCommand): void =>
      callback(command)
    ipcRenderer.on(channels.audioPlay, listener)
    return () => ipcRenderer.removeListener(channels.audioPlay, listener)
  },
  reportAudioResult: (result: AudioPlayResult) => ipcRenderer.send(channels.audioResult, result),
  reportRendererError: (error) => ipcRenderer.send(channels.loggingRendererError, error)
}

contextBridge.exposeInMainWorld('agentMonitor', api)
