import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } from 'electron'
import { execFile } from 'child_process'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { truncate } from 'fs/promises'
import { promisify } from 'util'
import { IPC } from '../shared/channels'
import type { DaemonStatus, RelayStats, AppSettings } from '../shared/types'

const execFileAsync = promisify(execFile)
const LOG_PATH = '/var/log/bettertether.log'
const LOG_LINES = 500

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let forceQuit = false
let systemQuit = false

const DAEMON_PORT = 9400
const POLL_INTERVAL = 1000
const PLIST_LABEL = 'com.s4wbvnny.bettertether'
const PLIST_PATH = '/Library/LaunchDaemons/com.s4wbvnny.bettertether.plist'
const DAEMON_PATH = '/usr/local/bin/bettertether'
const SETTINGS_PATH = join(app.getPath('userData'), 'settings.json')

function loadSettings(): AppSettings {
  try {
    if (existsSync(SETTINGS_PATH)) {
      return JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8'))
    }
  } catch { /* ignore */ }
  return { quitFromDockQuitsApp: false }
}

function saveSettings(s: AppSettings) {
  try {
    writeFileSync(SETTINGS_PATH, JSON.stringify(s, null, 2), 'utf-8')
  } catch { /* ignore */ }
}

let pollTimer: ReturnType<typeof setInterval> | null = null
let logPollTimer: ReturnType<typeof setInterval> | null = null

async function isDaemonRunning(): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('launchctl', ['print', `system/${PLIST_LABEL}`])
    return stdout.includes('state = running')
  } catch {
    return false
  }
}

async function toggleDaemon(start: boolean, window: BrowserWindow | null) {
  const cmd = start ? 'bootstrap' : 'bootout'
  const script = `do shell script "/bin/launchctl ${cmd} system ${PLIST_PATH}" with administrator privileges`
  try {
    await execFileAsync('osascript', ['-e', script], { timeout: 30_000 })
    await new Promise(r => setTimeout(r, 1500))
  } catch (e) {
    console.error('[daemon] toggle failed:', e)
  }
  const status = await fetchStatus()
  if (window && !window.isDestroyed()) window.webContents.send(IPC.POLL_STATUS, status)
}

async function fetchStatus(): Promise<DaemonStatus> {
  const running = await isDaemonRunning()
  if (!running) return { running: false, relay: null }

  try {
    const res = await fetch(`http://127.0.0.1:${DAEMON_PORT}/api/status`)
    if (!res.ok) return { running: true, relay: null }
    const relay: RelayStats = await res.json()
    return { running: true, relay }
  } catch {
    return { running: true, relay: null }
  }
}

async function fetchLogs(): Promise<string> {
  try {
    const { stdout } = await execFileAsync('tail', ['-n', String(LOG_LINES), LOG_PATH])
    return stdout
  } catch {
    return ''
  }
}

async function clearLogs(): Promise<void> {
  try {
    await truncate(LOG_PATH, 0)
  } catch {
    // ignore
  }
}

async function uninstallEverything(): Promise<void> {
  const script = `
do shell script "
  launchctl bootout system ${PLIST_PATH} 2>/dev/null || true
  sleep 1
  rm -f ${PLIST_PATH}
  rm -f ${DAEMON_PATH}
  rm -f ${LOG_PATH}
  rm -rf ~/Library/Preferences/com.s4wbvnny.bettertether-ui.plist
  rm -rf ~/Library/Caches/com.s4wbvnny.bettertether-ui
  rm -rf ~/Library/Application\\ Support/com.s4wbvnny.bettertether-ui
" with administrator privileges`
  try {
    await execFileAsync('osascript', ['-e', script], { timeout: 30_000 })
  } catch (e) {
    console.error('[uninstall] failed:', e)
  }
}

function startPolling() {
  stopPolling()
  pollTimer = setInterval(async () => {
    const status = await fetchStatus()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC.POLL_STATUS, status)
    }
    if (tray) {
      const connected = status.running && status.relay?.connected
      tray.setToolTip(connected ? 'BetterTether — Connected' : status.running ? 'BetterTether — Running' : 'BetterTether — Stopped')
    }
  }, POLL_INTERVAL)

  logPollTimer = setInterval(async () => {
    const logs = await fetchLogs()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC.POLL_LOGS, logs)
    }
  }, 2000)
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  if (logPollTimer) {
    clearInterval(logPollTimer)
    logPollTimer = null
  }
}

function buildTrayContextMenu() {
  return Menu.buildFromTemplate([
    { label: 'Show Window', click: () => {
      app.dock?.show()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show()
        mainWindow.focus()
      } else {
        createWindow()
      }
    }},
    { type: 'separator' },
    { label: 'Quit', click: () => {
      forceQuit = true
      app.quit()
    }},
  ])
}

function createTrayIcon(): nativeImage.NativeImage {
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'tray-icon.png')
    : join(__dirname, '../../resources/tray-icon.png')
  const icon = nativeImage.createFromPath(iconPath)
  return icon.resize({ width: 22, height: 22 })
}

function createTray() {
  tray = new Tray(createTrayIcon())
  tray.setToolTip('BetterTether')
  tray.setContextMenu(buildTrayContextMenu())
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 440,
    height: 640,
    resizable: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    backgroundColor: '#18181b',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (app.isPackaged) {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  } else {
    mainWindow.loadURL('http://localhost:5173')
  }

  mainWindow.on('close', (e) => {
    e.preventDefault()
    if (forceQuit) {
      mainWindow?.destroy()
      return
    }
    if (systemQuit) {
      const settings = loadSettings()
      if (settings.quitFromDockQuitsApp) {
        mainWindow?.destroy()
        return
      }
    }
    mainWindow?.hide()
    app.dock?.hide()
  })
}

// IPC handlers
ipcMain.handle(IPC.GET_STATUS, async () => fetchStatus())
ipcMain.handle(IPC.START_DAEMON, async () => toggleDaemon(true, mainWindow))
ipcMain.handle(IPC.STOP_DAEMON, async () => toggleDaemon(false, mainWindow))
ipcMain.handle(IPC.GET_LOGS, async () => fetchLogs())
ipcMain.handle(IPC.CLEAR_LOGS, async () => clearLogs())
ipcMain.handle(IPC.HIDE_WINDOW, () => { mainWindow?.hide() })
ipcMain.handle(IPC.UNINSTALL, async () => {
  forceQuit = true
  stopPolling()
  await uninstallEverything()
  app.quit()
})
ipcMain.handle(IPC.GET_SETTINGS, () => loadSettings())
ipcMain.handle(IPC.SET_SETTINGS, (_e, s: AppSettings) => saveSettings(s))

app.on('before-quit', () => {
  systemQuit = !forceQuit
})

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) {
    app.dock.show()
  }

  const appMenu = Menu.buildFromTemplate([
    { role: 'appMenu' },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
  ])
  Menu.setApplicationMenu(appMenu)

  createTray()
  createWindow()
  startPolling()
})

app.on('activate', () => {
  app.dock?.show()
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
    mainWindow.focus()
  } else if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('will-quit', async () => {
  stopPolling()
  const exePath = app.getPath('exe')
  if (!exePath.includes('/Applications/')) {
    await uninstallEverything()
  }
})
