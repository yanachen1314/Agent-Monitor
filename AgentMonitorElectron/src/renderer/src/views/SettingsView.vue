<script setup lang="ts">
import { ref } from 'vue'
import type { AppConfig, AudioMode, CliSource, RuntimeState } from '../../../shared/types'
import BaseToggle from '../components/BaseToggle.vue'
import StatusPill from '../components/StatusPill.vue'
import UiIcon from '../components/UiIcon.vue'

const props = defineProps<{ config: AppConfig; runtime: RuntimeState }>()
const emit = defineEmits<{
  'runtime-refresh': []
  'runtime-update': [state: RuntimeState]
}>()
const api = window.agentMonitor
const busy = ref<string | null>(null)
const message = ref('')

async function run(key: string, action: () => Promise<unknown>): Promise<void> {
  busy.value = key
  message.value = ''
  try {
    await action()
  } catch (error) {
    message.value = error instanceof Error ? error.message : '操作失败'
  } finally {
    busy.value = null
  }
}

function setMonitor(source: CliSource, enabled: boolean): void {
  void run(`monitor-${source}`, () => api.setMonitorEnabled(source, enabled))
}

function setMode(source: CliSource, mode: AudioMode): void {
  void run(`mode-${source}`, () => api.setAudioMode(source, mode))
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
  })
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
    <p v-if="message" class="inline-message">{{ message }}</p>

    <article class="settings-panel">
      <div class="section-title">
        <UiIcon name="bell" />
        <h2>提醒设置</h2>
      </div>
      <div class="setting-row setting-row--audio">
        <label>默认提示音</label>
        <div class="file-field">{{ audioName('default') }}</div>
        <button
          class="outline-button"
          @click="run('import-default', () => api.importAudio('default'))"
        >
          选择音频
        </button>
        <button
          class="outline-button"
          @click="run('preview-default', () => api.previewAudio('default'))"
        >
          试听
        </button>
        <button
          class="outline-button outline-button--pink"
          @click="run('restore', () => api.restoreBuiltinAudio())"
        >
          恢复默认
        </button>
      </div>
      <div class="setting-row">
        <label for="default-volume">音量</label>
        <input
          id="default-volume"
          class="range"
          type="range"
          min="0"
          max="1"
          step="0.01"
          :value="config.defaultAudio.volume"
          @change="api.setDefaultVolume(Number(($event.target as HTMLInputElement).value))"
        />
        <strong class="volume-value">{{ Math.round(config.defaultAudio.volume * 100) }}%</strong>
      </div>

      <template v-for="source in ['claude', 'codex'] as const" :key="source">
        <div class="monitor-divider" />
        <div class="monitor-heading">
          <span class="source-badge" :class="`source-badge--${source}`">{{
            source === 'claude' ? 'C' : 'X'
          }}</span>
          <strong>{{ source === 'claude' ? 'Claude Code' : 'Codex CLI' }} 提醒</strong>
          <StatusPill :tone="hookTone(source)">{{ hookLabel(source) }}</StatusPill>
          <button
            v-if="runtime.hooks[source].state !== 'configured'"
            class="mini-button"
            :disabled="busy === `hook-${source}`"
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
            @update:model-value="setMonitor(source, $event)"
          />
          <label class="radio-option">
            <input
              type="radio"
              :name="`${source}-mode`"
              :checked="config.monitors[source].audioMode === 'default'"
              @change="setMode(source, 'default')"
            />
            使用默认音频
          </label>
          <label class="radio-option">
            <input
              type="radio"
              :name="`${source}-mode`"
              :checked="config.monitors[source].audioMode === 'custom'"
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
            @click="run(`import-${source}`, () => api.importAudio(source))"
          >
            选择音频
          </button>
          <button
            class="outline-button"
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
      <div class="general-grid">
        <label class="check-row">
          <input
            type="checkbox"
            :checked="config.autoStart"
            @change="api.setAutoStart(($event.target as HTMLInputElement).checked)"
          />
          开机自动启动
        </label>
        <label class="check-row">
          <input
            type="checkbox"
            :checked="config.closeToTray"
            @change="api.setCloseToTray(($event.target as HTMLInputElement).checked)"
          />
          关闭窗口后驻留托盘
        </label>
        <button
          class="wide-button"
          :class="{ 'is-loading': busy === 'detect-hooks' }"
          :disabled="busy !== null"
          title="重新读取 Claude Code 与 Codex CLI 的 Hook 配置状态"
          @click="redetectHooks"
        >
          <UiIcon name="refresh" />
          {{ busy === 'detect-hooks' ? '检测中…' : '重新检测 Hook' }}
        </button>
        <button
          class="wide-button"
          :disabled="busy !== null"
          @click="
            run('repair', async () => {
              await api.repairHook('claude')
              await api.repairHook('codex')
              emit('runtime-refresh')
            })
          "
        >
          <UiIcon name="wrench" />修复 Hook
        </button>
      </div>
    </article>

    <article class="settings-panel about-panel">
      <div class="section-title">
        <UiIcon name="info" />
        <h2>关于</h2>
      </div>
      <div class="about-panel__content">
        <div class="mini-mark">AM</div>
        <div><span>应用名称</span><strong>Agent Monitor</strong></div>
        <div><span>版本号</span><strong>v0.1.1</strong></div>
        <p>监控 Claude Code 和 Codex CLI 的 Agent 单轮停止事件并及时播放提示音。</p>
        <button class="text-button" @click="api.openLogDirectory()">打开日志目录</button>
      </div>
    </article>
  </section>
</template>
