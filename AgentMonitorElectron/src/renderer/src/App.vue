<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { AppConfig, RuntimeState } from '../../shared/types'
import UiIcon from './components/UiIcon.vue'
import HomeView from './views/HomeView.vue'
import SettingsView from './views/SettingsView.vue'
import closeIcon from './assets/images/app_close.png'
import maximizeIcon from './assets/images/app_maximize-full.png'
import restoreIcon from './assets/images/app_maxmize-nonfull.png'
import minimizeIcon from './assets/images/app_minimize.png'

const activeView = ref<'home' | 'settings'>('home')
const desktop = window.agentMonitor
const config = ref<AppConfig | null>(null)
const runtime = ref<RuntimeState | null>(null)
const loading = ref(true)
const runtimeRefreshing = ref(false)
const windowMaximized = ref(false)
const errorMessage = ref('')
const cleanups: Array<() => void> = []

const subtitle = computed(() =>
  config.value?.globalPaused ? '提醒已暂停' : 'Claude / Codex 单轮停止提醒'
)

onMounted(async () => {
  try {
    const [nextConfig, nextRuntime, maximized] = await Promise.all([
      desktop.getConfig(),
      desktop.getRuntimeState(),
      desktop.isWindowMaximized()
    ])
    config.value = nextConfig
    runtime.value = nextRuntime
    windowMaximized.value = maximized
    cleanups.push(
      desktop.onConfigChanged((next) => (config.value = next)),
      desktop.onRuntimeChanged((next) => (runtime.value = next)),
      desktop.onWindowMaximizedChanged((maximized) => (windowMaximized.value = maximized))
    )
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '应用初始化失败'
  } finally {
    loading.value = false
  }
})

onBeforeUnmount(() => cleanups.splice(0).forEach((cleanup) => cleanup()))

async function refreshRuntime(): Promise<void> {
  if (runtimeRefreshing.value) return
  runtimeRefreshing.value = true
  try {
    const [nextRuntime] = await Promise.all([
      desktop.getRuntimeState(),
      new Promise<void>((resolve) => window.setTimeout(resolve, 600))
    ])
    runtime.value = nextRuntime
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '状态刷新失败'
  } finally {
    runtimeRefreshing.value = false
  }
}
</script>

<template>
  <div class="app-shell">
    <div class="ambient ambient--one" />
    <div class="ambient ambient--two" />

    <header class="titlebar">
      <div class="brand">
        <div class="brand__mark" aria-hidden="true">
          <span class="brand__spark">✦</span>
          <span class="brand__wave">⌁</span>
        </div>
        <div>
          <h1>Agent Monitor</h1>
          <p>{{ subtitle }}</p>
        </div>
      </div>
      <div class="window-actions">
        <button title="最小化" aria-label="最小化" @click="desktop.minimizeWindow()">
          <img :src="minimizeIcon" alt="" draggable="false" />
        </button>
        <button
          :title="windowMaximized ? '还原窗口' : '最大化'"
          :aria-label="windowMaximized ? '还原窗口' : '最大化'"
          @click="desktop.toggleMaximizeWindow()"
        >
          <img :src="windowMaximized ? restoreIcon : maximizeIcon" alt="" draggable="false" />
        </button>
        <button title="关闭" aria-label="关闭" @click="desktop.closeWindow()">
          <img :src="closeIcon" alt="" draggable="false" />
        </button>
      </div>
    </header>

    <nav class="app-nav" aria-label="主导航">
      <div class="app-nav__tabs">
        <button :class="{ active: activeView === 'home' }" @click="activeView = 'home'">
          <UiIcon name="home" />
          首页
        </button>
        <button :class="{ active: activeView === 'settings' }" @click="activeView = 'settings'">
          <UiIcon name="settings" />
          设置
        </button>
      </div>
      <button
        class="icon-button"
        :class="{ 'is-loading': runtimeRefreshing }"
        :disabled="runtimeRefreshing"
        :title="runtimeRefreshing ? '正在刷新状态' : '刷新状态'"
        :aria-label="runtimeRefreshing ? '正在刷新状态' : '刷新状态'"
        @click="refreshRuntime"
      >
        <UiIcon name="refresh" />
      </button>
    </nav>

    <main class="app-content">
      <div v-if="loading" class="loading-state">
        <span class="loading-orbit" />
        正在连接本地提醒服务…
      </div>
      <div v-else-if="errorMessage" class="error-state">{{ errorMessage }}</div>
      <template v-else-if="config && runtime">
        <Transition name="page" mode="out-in">
          <HomeView
            v-if="activeView === 'home'"
            key="home"
            :config="config"
            :runtime="runtime"
            @open-settings="activeView = 'settings'"
          />
          <SettingsView
            v-else
            key="settings"
            :config="config"
            :runtime="runtime"
            @runtime-refresh="refreshRuntime"
            @runtime-update="runtime = $event"
          />
        </Transition>
      </template>
    </main>
  </div>
</template>
