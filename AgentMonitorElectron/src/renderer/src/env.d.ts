/// <reference types="vite/client" />

import type { AgentMonitorApi } from '../../shared/types'

declare global {
  const __APP_VERSION__: string

  interface Window {
    agentMonitor: AgentMonitorApi
  }
}

export {}
