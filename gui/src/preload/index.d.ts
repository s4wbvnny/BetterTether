import type { DaemonStatus, AppSettings, UpdateInfo, UpdateProgress } from '../shared/types'

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
      checkForUpdates: () => Promise<UpdateInfo>
      downloadUpdate: () => Promise<void>
      cancelUpdate: () => Promise<void>
      restartForUpdate: () => Promise<{ ok: boolean; error?: string }>
      onUpdateProgress: (cb: (p: UpdateProgress) => void) => () => void
    }
  }
}
