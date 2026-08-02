import type { DaemonStatus, AppSettings, UpdateInfo } from '../shared/types'

declare global {
  interface Window {
    bettertether: {
      getStatus: () => Promise<DaemonStatus>
      startDaemon: () => Promise<void>
      stopDaemon: () => Promise<void>
      hideWindow: () => Promise<void>
      uninstall: () => Promise<void>
      onPollStatus: (cb: (status: DaemonStatus) => void) => () => void
      getLogs: () => Promise<string>
      clearLogs: () => Promise<void>
      onPollLogs: (cb: (logs: string) => void) => () => void
      getSettings: () => Promise<AppSettings>
      setSettings: (s: AppSettings) => Promise<void>
      checkForUpdates: () => Promise<UpdateInfo | null>
      onUpdateInfo: (cb: (info: UpdateInfo) => void) => () => void
    }
  }
}
