export type CliSource = 'claude' | 'codex'
export type AudioMode = 'default' | 'custom'
export type HookState = 'configured' | 'notConfigured' | 'notDetected' | 'invalid' | 'untrusted'

export interface DefaultAudioConfig {
  source: 'builtin' | 'imported'
  path: string
  volume: number
}

export interface CliMonitorConfig {
  enabled: boolean
  audioMode: AudioMode
  customAudioPath: string | null
}

export interface AppConfig {
  version: 1
  defaultAudio: DefaultAudioConfig
  monitors: Record<CliSource, CliMonitorConfig>
  globalPaused: boolean
  autoStart: boolean
  closeToTray: boolean
}

export interface TurnStoppedEvent {
  version: 1
  source: CliSource
  eventType: 'turnStopped'
  sessionId: string | null
  turnId: string | null
  cwd: string | null
  timestamp: number
}

export interface IpcRequest {
  protocolVersion: 1
  token: string
  event: TurnStoppedEvent
}

export type IpcResponseCode =
  | 'ACCEPTED'
  | 'DUPLICATE_IGNORED'
  | 'MONITOR_DISABLED'
  | 'GLOBAL_PAUSED'
  | 'UNAUTHORIZED'
  | 'UNSUPPORTED_PROTOCOL'
  | 'INVALID_REQUEST'
  | 'INTERNAL_ERROR'

export interface IpcResponse {
  ok: boolean
  code: IpcResponseCode
}

export interface IpcRuntime {
  version: 1
  host: '127.0.0.1'
  port: number
  token: string
  pid: number
  startedAt: number
}

export interface HookStatus {
  source: CliSource
  state: HookState
  configPath: string | null
  message: string
}

export interface HookPreview {
  source: CliSource
  configPath: string
  content: string
}

export interface RecentActivity {
  id: string
  source: CliSource
  stoppedAt: number
  cwd: string | null
  result: 'reminded' | 'suppressed' | 'failed'
}

export interface RuntimeState {
  running: boolean
  ipcPort: number | null
  hooks: Record<CliSource, HookStatus>
  lastEvent: TurnStoppedEvent | null
  recentActivities: RecentActivity[]
}

export interface ResolvedAudio {
  path: string
  volume: number
  fallbackUsed: boolean
}

export interface AudioLibraryItem {
  id: string
  name: string
  format: string
  source: 'builtin' | 'uploaded'
  selected: boolean
  uploadedAt: number | null
}

export interface AudioPlayCommand extends ResolvedAudio {
  requestId: string
}

export interface AudioPlayResult {
  requestId: string
  status: 'started' | 'ended' | 'failed'
  message?: string
}

export type ProjectWebsite = 'github' | 'gitee'

export interface AgentMonitorApi {
  minimizeWindow(): void
  toggleMaximizeWindow(): void
  isWindowMaximized(): Promise<boolean>
  closeWindow(): void
  getConfig(): Promise<AppConfig>
  setMonitorEnabled(source: CliSource, enabled: boolean): Promise<AppConfig>
  setAudioMode(source: CliSource, mode: AudioMode): Promise<AppConfig>
  setDefaultVolume(volume: number): Promise<AppConfig>
  setGlobalPaused(paused: boolean): Promise<AppConfig>
  setCloseToTray(enabled: boolean): Promise<AppConfig>
  setAutoStart(enabled: boolean): Promise<AppConfig>
  importAudio(target: 'default' | CliSource): Promise<AppConfig | null>
  previewAudio(target: 'default' | CliSource): Promise<void>
  restoreBuiltinAudio(): Promise<AppConfig>
  getAudioLibrary(): Promise<AudioLibraryItem[]>
  selectDefaultAudio(id: string): Promise<AppConfig>
  previewLibraryAudio(id: string): Promise<void>
  deleteUploadedAudio(id: string): Promise<AppConfig>
  getHookStatus(): Promise<Record<CliSource, HookStatus>>
  getHookPreview(source: CliSource): Promise<HookPreview>
  openHookDirectory(source: CliSource): Promise<void>
  installHook(source: CliSource): Promise<HookStatus>
  repairHook(source: CliSource): Promise<HookStatus>
  getRuntimeState(): Promise<RuntimeState>
  openProjectWebsite(target: ProjectWebsite): Promise<void>
  openLogDirectory(): Promise<void>
  onConfigChanged(callback: (config: AppConfig) => void): () => void
  onRuntimeChanged(callback: (state: RuntimeState) => void): () => void
  onWindowMaximizedChanged(callback: (maximized: boolean) => void): () => void
  onAudioCommand(callback: (command: AudioPlayCommand) => void): () => void
  reportAudioResult(result: AudioPlayResult): void
}
