<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import type {
  AppConfig,
  AudioMode,
  CliSource,
  HookPreview,
  LogLevel,
  RuntimeState,
  UpdateState,
  UpdateStatus
} from '../../../shared/types'
import { withMinimumDuration } from '../../../shared/minimum-duration'
import BaseModalDialog from '../components/base/BaseModalDialog.vue'
import BaseSelect from '../components/base/BaseSelect.vue'
import type { BaseSelectOption } from '../components/base/base-select'
import BaseToggle from '../components/base/BaseToggle.vue'
import OperationNotice from '../components/OperationNotice.vue'
import StatusPill from '../components/StatusPill.vue'
import UiIcon from '../components/UiIcon.vue'
import giteeIcon from '../assets/images/gitee.png'
import githubIcon from '../assets/images/github.png'

const props = defineProps<{ config: AppConfig; runtime: RuntimeState }>()
const emit = defineEmits<{
  'runtime-refresh': []
  'runtime-update': [state: RuntimeState]
  'open-audio-manager': []
}>()
const api = window.agentMonitor
const appVersion = `v${__APP_VERSION__}`
const MINIMUM_REPAIR_LOADING_MS = 500
const logLevelOptions = [
  { value: 'debug', label: 'Debug', color: '#3f7fe5' },
  { value: 'info', label: 'Info', color: '#6f55e8' },
  { value: 'warn', label: 'Warn', color: '#c47a18' },
  { value: 'error', label: 'Error', color: '#d44d75' }
] satisfies BaseSelectOption[]
const busy = reactive(new Set<string>())
const draftVolume = ref(props.config.defaultAudio.volume)
const hookPreview = ref<HookPreview | null>(null)
const updateState = ref<UpdateState | null>(null)
let removeUpdateListener: (() => void) | null = null
const operationNotice = ref<{
  tone: 'success' | 'warning' | 'error'
  text: string
} | null>(null)

const volumeStyle = computed<Record<string, string>>(() => ({
  '--range-progress': `${Math.round(draftVolume.value * 100)}%`
}))

const updateTitle = computed(() => {
  switch (updateState.value?.status) {
    case 'unsupported':
      return '当前版本不支持自动更新'
    case 'checking':
      return '正在检查更新…'
    case 'available':
      return `发现新版本 v${updateState.value.latestVersion}`
    case 'up-to-date':
      return '当前已是最新版本'
    case 'downloading':
      return `正在下载 v${updateState.value.latestVersion}`
    case 'downloaded':
      return `v${updateState.value.latestVersion} 已准备就绪`
    case 'installing':
      return '正在退出并安装更新…'
    case 'error':
      return updateState.value.error ?? '自动更新发生错误'
    default:
      return '检查 Agent Monitor 新版本'
  }
})

const updateDescription = computed(() => {
  if (!updateState.value) return '正在读取更新状态…'
  if (!updateState.value.supported) return '自动更新仅支持打包后的 Windows 正式版本。'
  if (updateState.value.status === 'available') return '确认后下载，下载期间可以继续使用应用。'
  if (updateState.value.status === 'downloaded') return '重启应用后将自动完成安装，现有配置会保留。'
  if (updateState.value.status === 'error') return '请检查网络连接，也可以前往 GitHub 手动下载。'
  return `当前版本 ${appVersion}，应用启动后会在后台自动检查一次。`
})

const updateActionLabel = computed(() => {
  switch (updateState.value?.status) {
    case 'checking':
      return '检查中…'
    case 'available':
      return '下载更新'
    case 'downloading':
      return `下载中 ${Math.round(updateState.value.progress ?? 0)}%`
    case 'downloaded':
      return '立即重启安装'
    case 'installing':
      return '正在安装…'
    case 'unsupported':
      return '仅 Windows 版支持'
    default:
      return '检查更新'
  }
})

const updateStatusLabel = computed(() => {
  const labels: Record<UpdateStatus, string> = {
    unsupported: '不可用',
    idle: '待检查',
    checking: '检查中',
    available: '可更新',
    'up-to-date': '最新',
    downloading: '下载中',
    downloaded: '待安装',
    installing: '安装中',
    error: '失败'
  }
  return updateState.value ? labels[updateState.value.status] : '加载中'
})

const updateActionDisabled = computed(() => {
  const status = updateState.value?.status
  return (
    !updateState.value || ['unsupported', 'checking', 'downloading', 'installing'].includes(status!)
  )
})

const updateTone = computed<'success' | 'warning' | 'muted' | 'accent'>(() => {
  const status = updateState.value?.status
  if (status === 'downloaded' || status === 'up-to-date') return 'success'
  if (status === 'available') return 'accent'
  if (status === 'error') return 'warning'
  return 'muted'
})

watch(
  () => props.config.defaultAudio.volume,
  (volume) => {
    draftVolume.value = volume
  }
)

onMounted(() => {
  removeUpdateListener = api.onUpdateStateChanged((state) => {
    updateState.value = state
  })
  void api
    .getUpdateState()
    .then((state) => {
      updateState.value = state
    })
    .catch((error: unknown) => {
      showOperationNotice('error', error instanceof Error ? error.message : '更新状态读取失败')
    })
})

onBeforeUnmount(() => removeUpdateListener?.())

async function run(key: string, action: () => Promise<unknown>): Promise<void> {
  if (busy.has(key)) return
  busy.add(key)
  operationNotice.value = null
  try {
    await action()
  } catch (error) {
    showOperationNotice('error', error instanceof Error ? error.message : '操作失败')
  } finally {
    busy.delete(key)
  }
}

function isBusy(key: string): boolean {
  return busy.has(key)
}

function showOperationNotice(tone: 'success' | 'warning' | 'error', text: string): void {
  operationNotice.value = { tone, text }
}

function setMonitor(source: CliSource, enabled: boolean): void {
  void run(`monitor-${source}`, () => api.setMonitorEnabled(source, enabled))
}

function setGlobalReminder(enabled: boolean): void {
  void run('global-reminder', () => api.setGlobalPaused(!enabled))
}

function setAutoStart(enabled: boolean): void {
  void run('auto-start', () => api.setAutoStart(enabled))
}

function setCloseToTray(enabled: boolean): void {
  void run('close-to-tray', () => api.setCloseToTray(enabled))
}

function setLogLevel(value: string): void {
  const level = value as LogLevel
  void run('log-level', () => api.setLogLevel(level))
}

function handleUpdateAction(): void {
  const status = updateState.value?.status
  if (status === 'available') {
    void run('update-download', async () => {
      updateState.value = await api.downloadUpdate()
    })
    return
  }
  if (status === 'downloaded') {
    void run('update-install', () => api.installUpdate())
    return
  }
  void run('update-check', async () => {
    updateState.value = await api.checkForUpdates()
  })
}

function setMode(source: CliSource, mode: AudioMode): void {
  void run(`mode-${source}`, () => api.setAudioMode(source, mode))
}

function updateDraftVolume(event: Event): void {
  draftVolume.value = Number((event.target as HTMLInputElement).value)
}

function saveVolume(): void {
  void run('volume', () => api.setDefaultVolume(draftVolume.value))
}

function installHook(source: CliSource): void {
  void run(`hook-${source}`, async () => {
    await api.installHook(source)
    emit('runtime-refresh')
  })
}

function redetectHooks(): void {
  void run('detect-hooks', async () => {
    const [state] = await Promise.all([
      api.getRuntimeState(),
      new Promise<void>((resolve) => window.setTimeout(resolve, 600))
    ])
    emit('runtime-update', state)
    const issues = (['claude', 'codex'] as const)
      .filter((source) => state.hooks[source].state !== 'configured')
      .map((source) => {
        const name = source === 'claude' ? 'Claude Code' : 'Codex'
        return state.hooks[source].state === 'invalid' ? `${name} 配置异常` : `${name} 待配置`
      })
    if (issues.length === 0) {
      showOperationNotice('success', '检测完成：Claude Code 与 Codex Hook 均已配置')
    } else {
      showOperationNotice('warning', `检测完成：${issues.join('，')}`)
    }
  })
}

function repairHooks(): void {
  void run('repair', async () => {
    await withMinimumDuration(async () => {
      await api.repairHook('claude')
      await api.repairHook('codex')
    }, MINIMUM_REPAIR_LOADING_MS)
    emit('runtime-refresh')
    showOperationNotice('success', '修复完成：Claude Code 与 Codex Hook 已重新写入')
  })
}

function openHookPreview(source: CliSource): void {
  void run(`preview-hook-${source}`, async () => {
    hookPreview.value = await api.getHookPreview(source)
  })
}

function openHookDirectory(): void {
  const source = hookPreview.value?.source
  if (!source) return
  void run(`open-hook-directory-${source}`, () => api.openHookDirectory(source))
}

function audioName(target: 'default' | CliSource): string {
  const path =
    target === 'default'
      ? props.config.defaultAudio.path
      : props.config.monitors[target].customAudioPath
  if (!path || path.startsWith('builtin://')) return '默认提示音.wav'
  return path.split(/[\\/]/).pop() ?? '已选择音频'
}

function hookTone(source: CliSource): 'success' | 'warning' {
  return props.runtime.hooks[source].state === 'configured' ? 'success' : 'warning'
}

function hookLabel(source: CliSource): string {
  return props.runtime.hooks[source].state === 'configured' ? 'Hook 已配置' : 'Hook 待配置'
}
</script>

<template>
  <section class="settings-stack">
    <OperationNotice :notice="operationNotice" @dismiss="operationNotice = null" />

    <article class="settings-panel">
      <div class="section-title">
        <UiIcon name="bell" />
        <h2>提醒设置</h2>
      </div>
      <div class="setting-row setting-row--audio">
        <label>默认提示音</label>
        <div class="file-field">{{ audioName('default') }}</div>
        <button class="outline-button audio-manager-trigger" @click="emit('open-audio-manager')">
          更换音频
          <UiIcon name="arrow-right" />
        </button>
        <button
          class="outline-button"
          :disabled="isBusy('preview-default')"
          @click="run('preview-default', () => api.previewAudio('default'))"
        >
          试听
        </button>
      </div>
      <div class="setting-row setting-row--volume">
        <label for="default-volume">音量</label>
        <div class="volume-control">
          <UiIcon name="music" />
          <input
            id="default-volume"
            class="range"
            type="range"
            min="0"
            max="1"
            step="0.01"
            :value="draftVolume"
            :style="volumeStyle"
            :disabled="isBusy('volume')"
            @input="updateDraftVolume"
            @change="saveVolume"
          />
        </div>
        <output class="volume-value" for="default-volume">
          {{ Math.round(draftVolume * 100) }}%
        </output>
      </div>

      <template v-for="source in ['claude', 'codex'] as const" :key="source">
        <div class="monitor-divider" />
        <div class="monitor-heading">
          <span class="source-badge" :class="`source-badge--${source}`">{{
            source === 'claude' ? 'C' : 'X'
          }}</span>
          <strong>{{ source === 'claude' ? 'Claude Code' : 'Codex' }} 提醒</strong>
          <StatusPill :tone="hookTone(source)">{{ hookLabel(source) }}</StatusPill>
          <button
            v-if="runtime.hooks[source].state === 'configured'"
            class="mini-button hook-preview-button"
            :disabled="isBusy(`preview-hook-${source}`)"
            @click="openHookPreview(source)"
          >
            {{ isBusy(`preview-hook-${source}`) ? '读取中…' : '预览' }}
          </button>
          <button
            v-if="runtime.hooks[source].state !== 'configured'"
            class="mini-button"
            :disabled="isBusy(`hook-${source}`)"
            @click="installHook(source)"
          >
            配置 Hook
          </button>
        </div>
        <div class="setting-row">
          <label>开启任务监控</label>
          <BaseToggle
            :model-value="config.monitors[source].enabled"
            :label="`开启 ${source} 监控`"
            :disabled="isBusy(`monitor-${source}`)"
            @update:model-value="setMonitor(source, $event)"
          />
          <label class="radio-option">
            <input
              type="radio"
              :name="`${source}-mode`"
              :checked="config.monitors[source].audioMode === 'default'"
              :disabled="isBusy(`mode-${source}`)"
              @change="setMode(source, 'default')"
            />
            使用默认音频
          </label>
          <label class="radio-option">
            <input
              type="radio"
              :name="`${source}-mode`"
              :checked="config.monitors[source].audioMode === 'custom'"
              :disabled="isBusy(`mode-${source}`)"
              @change="setMode(source, 'custom')"
            />
            使用自定义音频
          </label>
        </div>
        <div
          v-if="config.monitors[source].audioMode === 'custom'"
          class="setting-row setting-row--audio"
        >
          <label>自定义音频</label>
          <div class="file-field">{{ audioName(source) }}</div>
          <button
            class="outline-button"
            :disabled="isBusy(`import-${source}`)"
            @click="run(`import-${source}`, () => api.importAudio(source))"
          >
            选择音频
          </button>
          <button
            class="outline-button"
            :disabled="isBusy(`preview-${source}`)"
            @click="run(`preview-${source}`, () => api.previewAudio(source))"
          >
            试听
          </button>
        </div>
      </template>
    </article>

    <article class="settings-panel settings-panel--compact">
      <div class="section-title">
        <UiIcon name="settings" />
        <h2>通用设置</h2>
      </div>
      <div class="general-settings-list">
        <div class="general-setting-row">
          <div class="general-setting-copy">
            <strong>全局提醒</strong>
            <span>暂停后仍接收 Agent 单轮停止事件，但不播放提示音</span>
          </div>
          <div class="general-setting-control">
            <StatusPill :tone="config.globalPaused ? 'warning' : 'success'">
              {{ config.globalPaused ? '已暂停' : '正在运行' }}
            </StatusPill>
            <BaseToggle
              :model-value="!config.globalPaused"
              label="全局提醒"
              :disabled="isBusy('global-reminder')"
              @update:model-value="setGlobalReminder"
            />
          </div>
        </div>

        <div class="general-setting-row">
          <div class="general-setting-copy">
            <strong>开机自动启动</strong>
            <span>登录 Windows 后自动启动 Agent Monitor 并在后台监听</span>
          </div>
          <BaseToggle
            :model-value="config.autoStart"
            label="开机自动启动"
            :disabled="isBusy('auto-start')"
            @update:model-value="setAutoStart"
          />
        </div>

        <div class="general-setting-row">
          <div class="general-setting-copy">
            <strong>关闭窗口后驻留托盘</strong>
            <span>关闭主窗口时继续在后台运行，可从系统托盘重新打开</span>
          </div>
          <BaseToggle
            :model-value="config.closeToTray"
            label="关闭窗口后驻留托盘"
            :disabled="isBusy('close-to-tray')"
            @update:model-value="setCloseToTray"
          />
        </div>

        <div class="general-setting-row">
          <div class="general-setting-copy">
            <strong>日志记录级别</strong>
            <span>仅记录所选级别及更严重的日志，排查问题时建议选择 Debug</span>
          </div>
          <BaseSelect
            class="log-level-select"
            label="日志记录级别"
            :model-value="config.logLevel"
            :options="logLevelOptions"
            :disabled="isBusy('log-level')"
            @update:model-value="setLogLevel"
          />
        </div>

        <div class="general-setting-row">
          <div class="general-setting-copy">
            <strong>重新检测 Hook</strong>
            <span>重新读取 Claude Code 与 Codex 的 Hook 配置状态</span>
          </div>
          <button
            class="wide-button general-setting-action"
            :class="{ 'is-loading': isBusy('detect-hooks') }"
            :disabled="isBusy('detect-hooks')"
            title="重新读取 Claude Code 与 Codex 的 Hook 配置状态"
            @click="redetectHooks"
          >
            <UiIcon name="refresh" />
            {{ isBusy('detect-hooks') ? '检测中…' : '立即检测' }}
          </button>
        </div>

        <div class="general-setting-row">
          <div class="general-setting-copy">
            <strong>修复 Hook</strong>
            <span>重新写入 Agent Monitor 的 Stop Hook，并保留已有 Hook 配置</span>
          </div>
          <button
            class="wide-button general-setting-action"
            :class="{ 'is-loading': isBusy('repair') }"
            :disabled="isBusy('repair')"
            @click="repairHooks"
          >
            <UiIcon name="wrench" />
            {{ isBusy('repair') ? '修复中…' : '立即修复' }}
          </button>
        </div>
      </div>
    </article>

    <article class="settings-panel settings-panel--compact update-panel">
      <div class="section-title">
        <UiIcon name="refresh" />
        <h2>软件更新</h2>
      </div>
      <div class="update-panel__content">
        <div class="update-panel__copy">
          <div class="update-panel__heading">
            <strong>{{ updateTitle }}</strong>
            <StatusPill :tone="updateTone">{{ updateStatusLabel }}</StatusPill>
          </div>
          <span>{{ updateDescription }}</span>
          <div v-if="updateState?.status === 'downloading'" class="update-progress">
            <i :style="{ width: `${updateState.progress ?? 0}%` }" />
          </div>
          <details v-if="updateState?.releaseNotes" class="update-release-notes">
            <summary>查看更新说明</summary>
            <p>{{ updateState.releaseNotes }}</p>
          </details>
        </div>
        <button
          class="wide-button general-setting-action update-panel__action"
          :class="{
            'is-loading': ['checking', 'downloading', 'installing'].includes(
              updateState?.status as UpdateStatus
            )
          }"
          :disabled="updateActionDisabled"
          @click="handleUpdateAction"
        >
          <UiIcon :name="updateState?.status === 'downloaded' ? 'check' : 'refresh'" />
          {{ updateActionLabel }}
        </button>
      </div>
    </article>

    <article class="settings-panel about-panel">
      <div class="section-title">
        <UiIcon name="info" />
        <h2>关于</h2>
      </div>
      <div class="about-panel__content">
        <div class="about-panel__mascot" aria-hidden="true" />
        <div class="about-panel__details">
          <div class="about-panel__meta">
            <div><span>应用名称</span><strong>Agent Monitor</strong></div>
            <div>
              <span>版本号</span><strong>{{ appVersion }}</strong>
            </div>
          </div>
          <p>监控 Claude Code 和 Codex 的 Agent 单轮停止事件并及时播放提示音。</p>
        </div>
        <div class="about-panel__actions">
          <div class="about-panel__repositories" aria-label="开源仓库">
            <button
              class="repository-button"
              title="打开 GitHub 仓库"
              aria-label="打开 GitHub 仓库"
              @click="api.openProjectWebsite('github')"
            >
              <img :src="githubIcon" alt="" draggable="false" />
            </button>
            <button
              class="repository-button"
              title="打开 Gitee 仓库"
              aria-label="打开 Gitee 仓库"
              @click="api.openProjectWebsite('gitee')"
            >
              <img :src="giteeIcon" alt="" draggable="false" />
            </button>
          </div>
          <button class="outline-button about-panel__action" @click="api.openLogDirectory()">
            <UiIcon name="folder" />
            打开日志目录
          </button>
        </div>
      </div>
    </article>

    <BaseModalDialog
      :open="Boolean(hookPreview)"
      :title="`${hookPreview?.source === 'claude' ? 'Claude Code' : 'Codex'} Hook 配置`"
      @close="hookPreview = null"
    >
      <template v-if="hookPreview">
        <p class="hook-preview-description">
          仅显示 Agent Monitor 写入的 Stop Hook，不包含配置文件中的其他 Hook。
        </p>
        <div class="hook-preview-path">
          <span>配置文件</span>
          <code>{{ hookPreview.configPath }}</code>
        </div>
        <pre class="hook-preview-code"><code>{{ hookPreview.content }}</code></pre>
      </template>
      <template #footer>
        <button class="outline-button modal-action-button" @click="hookPreview = null">关闭</button>
        <button
          class="soft-button modal-action-button"
          :disabled="hookPreview ? isBusy(`open-hook-directory-${hookPreview.source}`) : false"
          @click="openHookDirectory"
        >
          打开 Hook 文件所在目录
        </button>
      </template>
    </BaseModalDialog>
  </section>
</template>
