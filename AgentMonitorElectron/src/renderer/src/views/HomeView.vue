<script setup lang="ts">
import { computed } from 'vue'
import type { AppConfig, CliSource, RuntimeState } from '../../../shared/types'
import StatusPill from '../components/StatusPill.vue'
import UiIcon from '../components/UiIcon.vue'

const props = defineProps<{ config: AppConfig; runtime: RuntimeState }>()
defineEmits<{ 'open-settings': [] }>()
const api = window.agentMonitor

const lastEvent = computed(() => props.runtime.lastEvent)
const audioName = computed(() => {
  const path = props.config.defaultAudio.path
  return path.startsWith('builtin://') ? '默认提示音.wav' : path.split(/[\\/]/).pop()
})

function hookLabel(source: CliSource): string {
  const status = props.runtime.hooks[source]
  if (!props.config.monitors[source].enabled) return '已关闭'
  return status.state === 'configured' ? '已开启' : '待配置'
}

function monitorTone(source: CliSource): 'warning' | 'muted' | null {
  if (!props.config.monitors[source].enabled) return 'muted'
  return props.runtime.hooks[source].state === 'configured' ? null : 'warning'
}

function formatTime(timestamp?: number): string {
  if (!timestamp) return '尚无记录'
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(timestamp)
}

function sourceName(source: CliSource): string {
  return source === 'claude' ? 'Claude Code' : 'Codex CLI'
}
</script>

<template>
  <section class="home-grid">
    <article class="panel panel--status">
      <div class="panel__heading">
        <span class="panel__icon panel__icon--blue"><UiIcon name="pulse" /></span>
        <h2>运行概览</h2>
        <span class="petal">✦</span>
      </div>
      <dl class="status-list">
        <div>
          <dt>应用状态</dt>
          <dd :class="{ paused: config.globalPaused }">
            <span class="status-dot" />{{ config.globalPaused ? '已暂停' : '正在运行' }}
          </dd>
        </div>
        <div>
          <dt>Claude 监控</dt>
          <dd :class="monitorTone('claude')">
            <span class="status-dot" />{{ hookLabel('claude') }}
          </dd>
        </div>
        <div>
          <dt>Codex 监控</dt>
          <dd :class="monitorTone('codex')"><span class="status-dot" />{{ hookLabel('codex') }}</dd>
        </div>
      </dl>
      <div class="mascot-line">
        <span>Local only</span>
        <i />
      </div>
    </article>

    <article class="panel panel--last">
      <div class="panel__heading">
        <span class="panel__icon panel__icon--pink"><UiIcon name="bell" /></span>
        <h2>最近一次提醒</h2>
        <span class="sparkles">✦ ·</span>
      </div>
      <dl class="detail-list">
        <div>
          <dt>时间</dt>
          <dd>{{ formatTime(lastEvent?.timestamp) }}</dd>
        </div>
        <div>
          <dt>来源</dt>
          <dd>
            <StatusPill v-if="lastEvent" tone="accent">
              {{ sourceName(lastEvent.source) }}
            </StatusPill>
            <span v-else>—</span>
          </dd>
        </div>
        <div>
          <dt>结果</dt>
          <dd>
            <StatusPill tone="success">{{ lastEvent ? '本轮已停止' : '等待事件' }}</StatusPill>
          </dd>
        </div>
      </dl>
      <p class="panel__hint">提醒只表示 Agent 单轮停止，不代表整体目标完成。</p>
    </article>

    <article class="panel panel--audio">
      <div class="panel__heading">
        <span class="panel__icon panel__icon--pink"><UiIcon name="music" /></span>
        <h2>默认提示音</h2>
      </div>
      <div class="audio-summary">
        <div>
          <span>文件</span><strong>{{ audioName }}</strong>
        </div>
        <div>
          <span>音量</span>
          <div class="volume-track">
            <i :style="{ width: `${config.defaultAudio.volume * 100}%` }" />
          </div>
          <strong>{{ Math.round(config.defaultAudio.volume * 100) }}%</strong>
        </div>
      </div>
      <button class="soft-button" @click="api.previewAudio('default')">
        <UiIcon name="music" />试听提示音
      </button>
    </article>

    <article class="panel panel--activity">
      <div class="panel__heading">
        <span class="panel__icon panel__icon--blue"><UiIcon name="list" /></span>
        <h2>最近活动</h2>
      </div>
      <ul v-if="runtime.recentActivities.length" class="activity-list">
        <li v-for="activity in runtime.recentActivities.slice(0, 4)" :key="activity.id">
          <span class="source-badge" :class="`source-badge--${activity.source}`">
            {{ activity.source === 'claude' ? 'C' : 'X' }}
          </span>
          <strong>{{ sourceName(activity.source) }}</strong>
          <StatusPill :tone="activity.result === 'reminded' ? 'success' : 'muted'">
            {{ activity.result === 'reminded' ? '已提醒' : '已合并' }}
          </StatusPill>
          <time>{{ formatTime(activity.stoppedAt) }}</time>
        </li>
      </ul>
      <div v-else class="empty-activity">第一条 Agent 停止事件将在这里出现</div>
      <button class="text-button" @click="$emit('open-settings')">前往设置 →</button>
    </article>
  </section>
</template>
