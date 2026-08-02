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

export interface UpdateInfo {
  available: boolean
  version: string
  url: string
  body: string
  error: 'none' | 'http' | 'network'
  downloadUrl: string
  downloadSize: number
}

export interface UpdateProgress {
  phase: 'download' | 'stage' | 'ready' | 'error'
  percent: number
  receivedBytes?: number
  totalBytes?: number
  message?: string
}
