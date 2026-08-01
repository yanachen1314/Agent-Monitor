<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import type { AudioLibraryItem } from '../../../shared/types'
import BaseModalDialog from '../components/BaseModalDialog.vue'
import UiIcon from '../components/UiIcon.vue'

const emit = defineEmits<{ back: [] }>()
const api = window.agentMonitor
const items = ref<AudioLibraryItem[]>([])
const loading = ref(true)
const busy = reactive(new Set<string>())
const message = ref('')
const pendingDelete = ref<AudioLibraryItem | null>(null)

const builtinItems = computed(() => items.value.filter((item) => item.source === 'builtin'))
const uploadedItems = computed(() => items.value.filter((item) => item.source === 'uploaded'))

onMounted(() => loadLibrary(true))

async function loadLibrary(showLoading = false): Promise<void> {
  if (showLoading) loading.value = true
  try {
    items.value = await api.getAudioLibrary()
  } catch (error) {
    message.value = error instanceof Error ? error.message : '提示音列表加载失败'
  } finally {
    if (showLoading) loading.value = false
  }
}

async function run(key: string, action: () => Promise<unknown>): Promise<void> {
  if (busy.has(key)) return
  busy.add(key)
  message.value = ''
  try {
    await action()
  } catch (error) {
    message.value = error instanceof Error ? error.message : '操作失败'
  } finally {
    busy.delete(key)
  }
}

function isBusy(key: string): boolean {
  return busy.has(key)
}

function selectAudio(item: AudioLibraryItem): void {
  if (item.selected) return
  void run(`select-${item.id}`, async () => {
    const previousItems = items.value
    items.value = items.value.map((candidate) => ({
      ...candidate,
      selected: candidate.id === item.id
    }))
    try {
      await api.selectDefaultAudio(item.id)
      await loadLibrary()
    } catch (error) {
      items.value = previousItems
      throw error
    }
  })
}

function previewAudio(item: AudioLibraryItem): void {
  void run(`preview-${item.id}`, () => api.previewLibraryAudio(item.id))
}

function formatUploadTime(timestamp: number | null): string {
  if (!timestamp) return '上传时间未知'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date(timestamp))
}

function uploadAudio(): void {
  void run('upload', async () => {
    const result = await api.importAudio('default')
    if (result) await loadLibrary()
  })
}

function confirmDelete(): void {
  const item = pendingDelete.value
  if (!item) return
  void run(`delete-${item.id}`, async () => {
    await api.deleteUploadedAudio(item.id)
    pendingDelete.value = null
    await loadLibrary()
  })
}
</script>

<template>
  <section class="audio-manager">
    <div class="audio-manager__toolbar">
      <button class="audio-manager__back" @click="emit('back')">
        <UiIcon name="arrow-left" />
        返回设置
      </button>
      <div class="audio-manager__intro">
        <span>提示音设置</span>
        <strong>挑一个让等待结束更有仪式感的声音</strong>
      </div>
      <button class="audio-manager__upload" :disabled="isBusy('upload')" @click="uploadAudio">
        <UiIcon name="upload" />
        {{ isBusy('upload') ? '正在导入…' : '上传提示音' }}
      </button>
    </div>

    <p v-if="message" class="inline-message">{{ message }}</p>

    <div v-if="loading" class="audio-library-loading">
      <span class="loading-orbit" />
      正在整理提示音库…
    </div>

    <template v-else>
      <article class="audio-collection audio-collection--builtin">
        <header class="audio-collection__header">
          <div class="audio-collection__icon"><UiIcon name="music" /></div>
          <div>
            <h2>内置提示音</h2>
            <p>随应用提供，可自由试听和选择，不会被误删。</p>
          </div>
          <span>{{ builtinItems.length }} 个声音</span>
        </header>
        <div class="audio-card-grid">
          <article
            v-for="item in builtinItems"
            :key="item.id"
            class="audio-card"
            :class="{ 'is-selected': item.selected }"
          >
            <span class="audio-card__glyph"><UiIcon name="music" /></span>
            <span class="audio-card__copy">
              <strong>{{ item.name }}</strong>
              <small>{{ item.format }} · 内置音频</small>
            </span>
            <span v-if="item.selected" class="audio-card__selected">
              <UiIcon name="check" /> 当前使用
            </span>
            <button
              v-else
              class="audio-card__choose"
              :disabled="isBusy(`select-${item.id}`)"
              @click="selectAudio(item)"
            >
              选择
            </button>
            <button
              class="audio-card__action"
              :class="{ 'is-playing': isBusy(`preview-${item.id}`) }"
              :disabled="isBusy(`preview-${item.id}`)"
              :title="isBusy(`preview-${item.id}`) ? '正在播放' : '试听'"
              :aria-label="
                isBusy(`preview-${item.id}`) ? `正在播放 ${item.name}` : `试听 ${item.name}`
              "
              @click="previewAudio(item)"
            >
              <UiIcon name="speaker" />
            </button>
          </article>
        </div>
      </article>

      <article class="audio-collection audio-collection--uploaded">
        <header class="audio-collection__header">
          <div class="audio-collection__icon"><UiIcon name="upload" /></div>
          <div>
            <h2>我上传的提示音</h2>
            <p>支持 WAV、MP3、OGG，单个文件不超过 20 MB。</p>
          </div>
          <span>{{ uploadedItems.length }} 个声音</span>
        </header>

        <div v-if="uploadedItems.length" class="audio-card-grid">
          <article
            v-for="item in uploadedItems"
            :key="item.id"
            class="audio-card audio-card--uploaded"
            :class="{ 'is-selected': item.selected }"
          >
            <span class="audio-card__glyph"><UiIcon name="music" /></span>
            <span class="audio-card__copy">
              <strong>{{ item.name }}</strong>
              <small>{{ item.format }} · 上传于 {{ formatUploadTime(item.uploadedAt) }}</small>
            </span>
            <span v-if="item.selected" class="audio-card__selected">
              <UiIcon name="check" /> 当前使用
            </span>
            <button
              v-else
              class="audio-card__choose"
              :disabled="isBusy(`select-${item.id}`)"
              @click="selectAudio(item)"
            >
              选择
            </button>
            <button
              class="audio-card__action"
              :class="{ 'is-playing': isBusy(`preview-${item.id}`) }"
              :disabled="isBusy(`preview-${item.id}`)"
              :title="isBusy(`preview-${item.id}`) ? '正在播放' : '试听'"
              :aria-label="
                isBusy(`preview-${item.id}`) ? `正在播放 ${item.name}` : `试听 ${item.name}`
              "
              @click="previewAudio(item)"
            >
              <UiIcon name="speaker" />
            </button>
            <button
              class="audio-card__action audio-card__action--danger"
              title="删除"
              @click="pendingDelete = item"
            >
              <UiIcon name="trash" />
            </button>
          </article>
        </div>
        <button v-else class="audio-empty-state" :disabled="isBusy('upload')" @click="uploadAudio">
          <span><UiIcon name="upload" /></span>
          <strong>这里还很安静</strong>
          <small>上传一个你喜欢的提示音</small>
        </button>
      </article>
    </template>

    <BaseModalDialog
      :open="Boolean(pendingDelete)"
      title="删除提示音"
      @close="pendingDelete = null"
    >
      <p class="delete-audio-copy">
        确定删除“{{ pendingDelete?.name }}”吗？此操作无法撤销。
        <template v-if="pendingDelete?.selected">删除后将自动切换回内置默认提示音。</template>
      </p>
      <template #footer>
        <button class="outline-button modal-action-button" @click="pendingDelete = null">
          取消
        </button>
        <button
          class="danger-button modal-action-button"
          :disabled="pendingDelete ? isBusy(`delete-${pendingDelete.id}`) : false"
          @click="confirmDelete"
        >
          {{ pendingDelete && isBusy(`delete-${pendingDelete.id}`) ? '删除中…' : '确认删除' }}
        </button>
      </template>
    </BaseModalDialog>
  </section>
</template>
