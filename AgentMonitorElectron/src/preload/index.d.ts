import type { AgentMonitorApi } from '../shared/types'

declare global {
  interface Window {
    agentMonitor: AgentMonitorApi
  }
}

export {}
