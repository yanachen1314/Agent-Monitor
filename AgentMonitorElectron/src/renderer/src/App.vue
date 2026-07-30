<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { AppConfig, RuntimeState } from '../../shared/types'
import UiIcon from './components/UiIcon.vue'
import HomeView from './views/HomeView.vue'
import SettingsView from './views/SettingsView.vue'

const activeView = ref<'home' | 'settings'>('home')
const desktop = window.agentMonitor
const config = ref<AppConfig | null>(null)
const runtime = ref<RuntimeState | null>(null)
const loading = ref(true)
const errorMessage = ref('')
const cleanups: Array<() => void> = []

const subtitle = computed(() =>
  config.value?.globalPaused ? '提醒已暂停' : 'Claude / Codex 单轮停止提醒'
)

onMounted(async () => {
  try {
    ;[config.value, runtime.value] = await Promise.all([
      desktop.getConfig(),
      desktop.getRuntimeState()
    ])
    cleanups.push(
      desktop.onConfigChanged((next) => (config.value = next)),
      desktop.onRuntimeChanged((next) => (runtime.value = next))
    )
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '应用初始化失败'
  } finally {
    loading.value = false
  }
})

onBeforeUnmount(() => cleanups.splice(0).forEach((cleanup) => cleanup()))

async function refreshRuntime(): Promise<void> {
  runtime.value = await desktop.getRuntimeState()
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
        <button aria-label="最小化" @click="desktop.minimizeWindow()">—</button>
        <button aria-label="最大化" @click="desktop.toggleMaximizeWindow()">□</button>
        <button aria-label="关闭" @click="desktop.closeWindow()">×</button>
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
      <button class="icon-button" title="刷新状态" @click="refreshRuntime">
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
