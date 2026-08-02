import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/channels'
import type { DaemonStatus, AppSettings, UpdateInfo } from '../shared/types'

const api = {
  getStatus: (): Promise<DaemonStatus> => ipcRenderer.invoke(IPC.GET_STATUS),
  startDaemon: (): Promise<void> => ipcRenderer.invoke(IPC.START_DAEMON),
  stopDaemon: (): Promise<void> => ipcRenderer.invoke(IPC.STOP_DAEMON),
  hideWindow: (): Promise<void> => ipcRenderer.invoke(IPC.HIDE_WINDOW),
  uninstall: (): Promise<void> => ipcRenderer.invoke(IPC.UNINSTALL),
  onPollStatus: (cb: (status: DaemonStatus) => void) => {
    const handler = (_: any, status: DaemonStatus) => cb(status)
    ipcRenderer.on(IPC.POLL_STATUS, handler)
    return () => { ipcRenderer.removeListener(IPC.POLL_STATUS, handler) }
  },
  getLogs: (): Promise<string> => ipcRenderer.invoke(IPC.GET_LOGS),
  clearLogs: (): Promise<void> => ipcRenderer.invoke(IPC.CLEAR_LOGS),
  onPollLogs: (cb: (logs: string) => void) => {
    const handler = (_: any, logs: string) => cb(logs)
    ipcRenderer.on(IPC.POLL_LOGS, handler)
    return () => { ipcRenderer.removeListener(IPC.POLL_LOGS, handler) }
  },
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke(IPC.GET_SETTINGS),
  setSettings: (s: AppSettings): Promise<void> => ipcRenderer.invoke(IPC.SET_SETTINGS, s),
  checkForUpdates: (): Promise<UpdateInfo | null> => ipcRenderer.invoke(IPC.CHECK_FOR_UPDATES),
  onUpdateInfo: (cb: (info: UpdateInfo) => void) => {
    const handler = (_: any, info: UpdateInfo) => cb(info)
    ipcRenderer.on(IPC.ON_UPDATE_INFO, handler)
    return () => { ipcRenderer.removeListener(IPC.ON_UPDATE_INFO, handler) }
  },
}

contextBridge.exposeInMainWorld('bettertether', api)
