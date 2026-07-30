export interface TrafficStats {
  sentBytes: number
  recvBytes: number
  sentRate: number
  recvRate: number
}

export interface RelayStats {
  connected: boolean
  phoneMAC: string
  clientIP: string
  connectedAt: string
  sentBytes: number
  recvBytes: number
  sentRate: number
  recvRate: number
}

export interface DaemonStatus {
  running: boolean
  active: boolean
  relay: RelayStats | null
  uptime: string
}

export interface AppSettings {
  quitFromDockQuitsApp: boolean
}
