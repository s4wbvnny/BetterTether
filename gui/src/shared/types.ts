export interface TrafficStats {
  sentBytes: number
  recvBytes: number
  sentRate: number   // bytes/sec
  recvRate: number   // bytes/sec
}

export interface SpeedTestResult {
  latencyMs: number
  downloadBps: number
  uploadBps: number
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface RelayStats {
  connected: boolean
  state: ConnectionState
  phoneMAC: string
  clientIP: string
  connectedAt: string
  traffic: TrafficStats
  speedTest: SpeedTestResult | null
}

export interface DaemonStatus {
  running: boolean
  relay: RelayStats | null
}

export interface AppSettings {
  quitFromDockQuitsApp: boolean
}
