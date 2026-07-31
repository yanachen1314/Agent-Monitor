import { createApp } from 'vue'
import App from './App.vue'
import '@renderer/assets/styles/global.less'
import type { AudioPlayCommand } from '../../shared/types'

let activeAudio: HTMLAudioElement | null = null

window.agentMonitor.onAudioCommand((command: AudioPlayCommand) => {
  activeAudio?.pause()
  const normalized = command.path.replaceAll('\\', '/')
  const url =
    normalized.startsWith('file://') || normalized.startsWith('data:')
      ? normalized
      : encodeURI(`file:///${normalized}`)
  const audio = new Audio(url)
  activeAudio = audio
  audio.volume = Math.min(1, Math.max(0, command.volume))
  audio.addEventListener('playing', () => {
    window.agentMonitor.reportAudioResult({
      requestId: command.requestId,
      status: 'started'
    })
  })
  audio.addEventListener('ended', () => {
    window.agentMonitor.reportAudioResult({
      requestId: command.requestId,
      status: 'ended'
    })
    if (activeAudio === audio) activeAudio = null
  })
  audio.addEventListener('error', () => {
    window.agentMonitor.reportAudioResult({
      requestId: command.requestId,
      status: 'failed',
      message: '音频文件无法解码或输出设备不可用'
    })
    if (activeAudio === audio) activeAudio = null
  })
  void audio.play().catch((error: Error) => {
    window.agentMonitor.reportAudioResult({
      requestId: command.requestId,
      status: 'failed',
      message: error.message
    })
  })
})

createApp(App).mount('#app')
