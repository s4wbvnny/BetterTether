import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } from 'electron'
import { execFile, spawn } from 'child_process'
import { join, dirname, resolve } from 'path'
import { createWriteStream, readFileSync, writeFileSync, existsSync } from 'fs'
import { mkdir, readdir, rm, truncate } from 'fs/promises'
import { promisify } from 'util'
import { IPC } from '../shared/channels'
import type { DaemonStatus, AppSettings, UpdateInfo, UpdateProgress } from '../shared/types'

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
const UNINSTALL_PATH = '/usr/local/bin/bettertether-uninstall'
const SETTINGS_PATH = join(app.getPath('userData'), 'settings.json')
const GITHUB_REPO = 's4wbvnny/BetterTether'

function getCurrentVersion(): string {
  try {
    return app.getVersion()
  } catch {
    return '0.0.0'
  }
}

function parseSemver(v: string): [number, number, number] {
  const match = v.replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!match) return [0, 0, 0]
  return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)]
}

function isNewerVersion(latest: string, current: string): boolean {
  const [lMaj, lMin, lPat] = parseSemver(latest)
  const [cMaj, cMin, cPat] = parseSemver(current)
  if (lMaj !== cMaj) return lMaj > cMaj
  if (lMin !== cMin) return lMin > cMin
  return lPat > cPat
}

let lastUpdateInfo: UpdateInfo | null = null
let activeDownload: { controller: AbortController; dest: string } | null = null

function updateArch(): 'arm64' | 'x64' {
  return process.arch === 'arm64' ? 'arm64' : 'x64'
}

function sendUpdateProgress(p: UpdateProgress) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC.ON_UPDATE_PROGRESS, p)
  }
}

async function checkForUpdates(): Promise<UpdateInfo> {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { 'Accept': 'application/vnd.github.v3+json' },
    })
    if (!res.ok) return { available: false, version: '', url: '', body: '', error: 'http', downloadUrl: '', downloadSize: 0 }

    const data = await res.json()
    const tag: string = data.tag_name ?? ''
    const body: string = data.body ?? ''
    const htmlUrl: string = data.html_url ?? ''

    if (!tag) return { available: false, version: '', url: '', body: '', error: 'none', downloadUrl: '', downloadSize: 0 }

    const arch = updateArch()
    const assets: Array<{ name?: string; size?: number; browser_download_url?: string }> = data.assets ?? []
    const asset = assets.find((a) => a.name?.endsWith(`-${arch}.dmg`))
    const downloadUrl = asset?.browser_download_url ?? ''
    const downloadSize = asset?.size ?? 0

    const current = getCurrentVersion()
    const available = isNewerVersion(tag, current)
    console.log(`[update] check complete: latest=${tag} current=${current} available=${available} asset=${asset?.name ?? 'none'}`)

    lastUpdateInfo = { available, version: tag, url: htmlUrl, body, error: 'none', downloadUrl, downloadSize }
    return lastUpdateInfo
  } catch (e) {
    console.error('[update] check failed:', e)
    return { available: false, version: '', url: '', body: '', error: 'network', downloadUrl: '', downloadSize: 0 }
  }
}

async function downloadUpdate(): Promise<void> {
  if (activeDownload) return
  if (!app.isPackaged) {
    sendUpdateProgress({ phase: 'error', percent: 0, message: 'Updates are only available in the packaged app.' })
    return
  }
  const info = lastUpdateInfo
  if (!info || !info.available || !info.downloadUrl) {
    sendUpdateProgress({ phase: 'error', percent: 0, message: 'No update download available.' })
    return
  }

  const controller = new AbortController()
  const dest = join(app.getPath('temp'), `BetterTether-${info.version}-${updateArch()}.dmg`)
  activeDownload = { controller, dest }

  try {
    const res = await fetch(info.downloadUrl, { signal: controller.signal, redirect: 'follow' })
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)

    const total = info.downloadSize || Number(res.headers.get('content-length')) || 0
    const reader = res.body.getReader()
    const file = createWriteStream(dest)
    let received = 0
    let prevPercent = -1

    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.byteLength
      file.write(Buffer.from(value))
      const percent = total > 0 ? Math.min(99, Math.round((received / total) * 100)) : 0
      if (percent !== prevPercent) {
        prevPercent = percent
        sendUpdateProgress({ phase: 'download', percent, receivedBytes: received, totalBytes: total })
      }
    }
    await new Promise<void>((resolveWrite, rejectWrite) => {
      file.on('error', rejectWrite)
      file.end(() => resolveWrite())
    })
    activeDownload = null

    await stageUpdate(dest, info)
  } catch (e) {
    activeDownload = null
    await rm(dest, { force: true }).catch(() => {})
    if ((e as Error)?.name === 'AbortError') {
      sendUpdateProgress({ phase: 'error', percent: 0, message: 'Update cancelled.' })
    } else {
      console.error('[update] download failed:', e)
      sendUpdateProgress({ phase: 'error', percent: 0, message: 'Update download failed.' })
    }
  }
}

function execFileAsyncCmd(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolveExec, rejectExec) => {
    execFile(cmd, args, { timeout: 180_000 }, (err) => (err ? rejectExec(err) : resolveExec()))
  })
}

async function stageUpdate(dmgPath: string, info: UpdateInfo): Promise<void> {
  sendUpdateProgress({ phase: 'stage', percent: 5, message: 'Preparing update…' })
  const mountPoint = join(app.getPath('temp'), `bt-mount-${Date.now()}`)
  const stagedDir = join(app.getPath('userData'), 'update-stage')

  try {
    await mkdir(mountPoint, { recursive: true })
    await mkdir(stagedDir, { recursive: true })
    sendUpdateProgress({ phase: 'stage', percent: 15, message: 'Mounting installer image…' })
    await execFileAsyncCmd('hdiutil', ['attach', dmgPath, '-nobrowse', '-readonly', '-mountpoint', mountPoint])

    const entries = await readdir(mountPoint)
    const appEntry = entries.find((e) => e.endsWith('.app'))
    if (!appEntry) throw new Error('No app bundle found in installer image')

    const stagedApp = join(stagedDir, appEntry)
    sendUpdateProgress({ phase: 'stage', percent: 35, message: 'Copying app bundle…' })
    await rm(stagedApp, { recursive: true, force: true })
    await execFileAsyncCmd('ditto', [join(mountPoint, appEntry), stagedApp])

    if (!existsSync(join(stagedApp, 'Contents', 'MacOS'))) {
      throw new Error('Staged app bundle is missing its executable')
    }
    sendUpdateProgress({ phase: 'stage', percent: 95, message: 'Finalizing…' })
  } catch (e) {
    console.error('[update] staging failed:', e)
    sendUpdateProgress({ phase: 'error', percent: 0, message: 'Update configuration failed.' })
    throw e
  } finally {
    try { await execFileAsyncCmd('hdiutil', ['detach', mountPoint]) } catch { /* ignore */ }
    await rm(mountPoint, { recursive: true, force: true }).catch(() => {})
    await rm(dmgPath, { force: true }).catch(() => {})
  }
  console.log(`[update] staged ${appEntry} (${info.version})`)
  sendUpdateProgress({ phase: 'ready', percent: 100, message: 'Update ready. Restart BetterTether to apply.' })
}

async function restartForUpdate(): Promise<{ ok: boolean; error?: string }> {
  const stagedDir = join(app.getPath('userData'), 'update-stage')
  let appEntry = ''
  try {
    const entries = await readdir(stagedDir)
    appEntry = entries.find((e) => e.endsWith('.app')) ?? ''
  } catch {
    return { ok: false, error: 'No staged update found.' }
  }
  if (!appEntry) return { ok: false, error: 'No staged update found.' }

  const stagedApp = join(stagedDir, appEntry)
  const currentApp = resolve(dirname(process.execPath), '..', '..')
  const scriptPath = join(app.getPath('temp'), 'bt-update-install.sh')
  const script = `#!/bin/bash
APP="$1"
STAGED="$2"
PID="$3"
while kill -0 "$PID" 2>/dev/null; do sleep 0.5; done
rm -rf "$APP"
ditto "$STAGED" "$APP"
rm -rf "$(dirname "$STAGED")"
open "$APP"
`
  writeFileSync(scriptPath, script, { mode: 0o755 })
  const child = spawn('/bin/sh', [scriptPath, currentApp, stagedApp, String(process.pid)], {
    detached: true,
    stdio: 'ignore',
  })
  child.unref()
  forceQuit = true
  setTimeout(() => app.quit(), 300)
  return { ok: true }
}

function cancelUpdate(): void {
  if (activeDownload) {
    activeDownload.controller.abort()
    activeDownload = null
  }
}

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

function resourcePath(name: string): string {
  return app.isPackaged
    ? join(process.resourcesPath, name)
    : join(__dirname, '../../resources', name)
}

async function installAndBootstrapDaemon(): Promise<void> {
  const binaryRes = resourcePath('bettertether')
  const uninstallRes = resourcePath('bettertether-uninstall')
  const plistRes = resourcePath('com.s4wbvnny.bettertether.plist')
  const configRes = resourcePath('default.toml')

  if (!existsSync(binaryRes)) {
    console.error('[install] bundled binary not found at', binaryRes)
    return
  }
  if (!existsSync(plistRes)) {
    console.error('[install] bundled plist not found at', plistRes)
    return
  }

  let cpConfig = ''
  if (existsSync(configRes)) {
    cpConfig = `mkdir -p /etc/bettertether && cp -f '${configRes}' /etc/bettertether/bettertether.toml &&`
  }

  let cpUninstall = ''
  if (existsSync(uninstallRes)) {
    cpUninstall = `cp -f '${uninstallRes}' ${UNINSTALL_PATH} && chmod +x ${UNINSTALL_PATH} &&`
  }

  const script = `do shell script "
${cpConfig}
${cpUninstall}
mkdir -p /usr/local/bin
cp -f '${binaryRes}' ${DAEMON_PATH}
chmod +x ${DAEMON_PATH}
cp -f '${plistRes}' ${PLIST_PATH}
chmod 644 ${PLIST_PATH}
chown root:wheel ${PLIST_PATH}
/bin/launchctl bootout system/${PLIST_LABEL} 2>/dev/null || true
/bin/launchctl bootstrap system '${PLIST_PATH}'
" with administrator privileges`

  try {
    await execFileAsync('osascript', ['-e', script], { timeout: 30_000 })
    console.log('[install] daemon installed and bootstrapped')
  } catch (e) {
    console.error('[install] installation/bootstrap failed:', e)
    throw e
  }
}

async function isDaemonRunning(): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('launchctl', ['print', `system/${PLIST_LABEL}`])
    return stdout.includes('state = running')
  } catch {
    return false
  }
}

async function toggleDaemon(start: boolean, window: BrowserWindow | null) {
  if (start) {
    try {
      await installAndBootstrapDaemon()
    } catch (e) {
      console.error('[daemon] start failed:', e)
    }
  } else {
    const script = `do shell script "/bin/launchctl bootout system ${PLIST_PATH}" with administrator privileges`
    try {
      await execFileAsync('osascript', ['-e', script], { timeout: 30_000 })
    } catch (e) {
      console.error('[daemon] stop failed:', e)
    }
  }
  await new Promise(r => setTimeout(r, 1500))
  const status = await fetchStatus()
  if (window && !window.isDestroyed()) window.webContents.send(IPC.POLL_STATUS, status)
}

let prevSentBytes = 0
let prevRecvBytes = 0
let prevTimestamp = Date.now()
let cumulativeSentBytes = 0
let cumulativeRecvBytes = 0

async function fetchStatus(): Promise<DaemonStatus> {
  const running = await isDaemonRunning()
  if (!running) {
    prevSentBytes = 0
    prevRecvBytes = 0
    cumulativeSentBytes = 0
    cumulativeRecvBytes = 0
    return { running: false, active: false, relay: null, uptime: '' }
  }

  try {
    const res = await fetch(`http://127.0.0.1:${DAEMON_PORT}/api/status`)
    if (!res.ok) return { running: true, active: false, relay: null, uptime: '' }

    const data = await res.json()
    console.log('[fetchStatus] raw response:', JSON.stringify(data))

    const now = Date.now()
    const elapsed = (now - prevTimestamp) / 1000

    let sentRate = 0
    let recvRate = 0

    const relayData = data.relay
    if (elapsed > 0 && relayData) {
      const sb = relayData.sentBytes ?? relayData.sent_bytes ?? 0
      const rb = relayData.recvBytes ?? relayData.recv_bytes ?? 0
      sentRate = prevSentBytes > 0 ? Math.max(0, (sb - prevSentBytes) / elapsed) : 0
      recvRate = prevRecvBytes > 0 ? Math.max(0, (rb - prevRecvBytes) / elapsed) : 0
      prevSentBytes = sb
      prevRecvBytes = rb
      cumulativeSentBytes = Math.max(cumulativeSentBytes, sb)
      cumulativeRecvBytes = Math.max(cumulativeRecvBytes, rb)
    } else {
      prevSentBytes = 0
      prevRecvBytes = 0
    }
    prevTimestamp = now

    const relay = relayData
      ? {
          connected: relayData.connected ?? relayData.connected ?? false,
          sentBytes: relayData.sentBytes ?? relayData.sent_bytes ?? 0,
          recvBytes: relayData.recvBytes ?? relayData.recv_bytes ?? 0,
          sentRate,
          recvRate,
          phoneMAC: relayData.phoneMAC ?? relayData.phone_mac ?? '',
          clientIP: relayData.clientIP ?? relayData.client_ip ?? '',
          connectedAt: relayData.connectedAt ?? relayData.connected_at ?? '',
        }
      : null

    let out: DaemonStatus = {
      running: data.running ?? false,
      active: data.active ?? false,
      relay,
      uptime: data.uptime ?? '',
    }

    // Fallback: if no API relay data but daemon is running, try log file for traffic stats
    if (!out.relay && out.running) {
      const logStats = await parseLogTraffic()
      if (logStats) {
        cumulativeSentBytes = Math.max(cumulativeSentBytes, logStats.sentBytes)
        cumulativeRecvBytes = Math.max(cumulativeRecvBytes, logStats.recvBytes)
        out = {
          ...out,
          relay: {
            connected: false,
            sentBytes: cumulativeSentBytes,
            recvBytes: cumulativeRecvBytes,
            sentRate: 0,
            recvRate: 0,
            phoneMAC: '',
            clientIP: '',
            connectedAt: '',
          },
        }
      } else if (cumulativeSentBytes > 0 || cumulativeRecvBytes > 0) {
        out = {
          ...out,
          relay: {
            connected: false,
            sentBytes: cumulativeSentBytes,
            recvBytes: cumulativeRecvBytes,
            sentRate: 0,
            recvRate: 0,
            phoneMAC: '',
            clientIP: '',
            connectedAt: '',
          },
        }
      }
    }

    console.log('[fetchStatus] parsed:', JSON.stringify(out))
    return out
  } catch (e) {
    console.error('[fetchStatus] error:', e)
    // API unreachable — try log file fallback
    const logStats = await parseLogTraffic()
    if (logStats) {
      cumulativeSentBytes = Math.max(cumulativeSentBytes, logStats.sentBytes)
      cumulativeRecvBytes = Math.max(cumulativeRecvBytes, logStats.recvBytes)
      return {
        running: true,
        active: false,
        relay: {
          connected: false,
          sentBytes: cumulativeSentBytes,
          recvBytes: cumulativeRecvBytes,
          sentRate: 0,
          recvRate: 0,
          phoneMAC: '',
          clientIP: '',
          connectedAt: '',
        },
        uptime: '',
      }
    }
    if (cumulativeSentBytes > 0 || cumulativeRecvBytes > 0) {
      return {
        running: true,
        active: false,
        relay: {
          connected: false,
          sentBytes: cumulativeSentBytes,
          recvBytes: cumulativeRecvBytes,
          sentRate: 0,
          recvRate: 0,
          phoneMAC: '',
          clientIP: '',
          connectedAt: '',
        },
        uptime: '',
      }
    }
    return { running: true, active: false, relay: null, uptime: '' }
  }
}

async function parseLogTraffic(): Promise<{ sentBytes: number; recvBytes: number } | null> {
  try {
    const { stdout } = await execFileAsync('tail', ['-n', '500', LOG_PATH])
    const lines = stdout.split('\n').reverse()
    for (const line of lines) {
      if (!line.includes('Traffic Monitor')) continue
      const clean = line.replace(/\x1b\[\d+(?:;\d+)*m/g, '')
      const sentMatch = clean.match(/sent[=:]["']?\s*([\d.]+)\s*KB/i)
      const recvMatch = clean.match(/received[=:]["']?\s*([\d.]+)\s*KB/i)
      if (sentMatch && recvMatch) {
        return {
          sentBytes: Math.round(parseFloat(sentMatch[1]) * 1024),
          recvBytes: Math.round(parseFloat(recvMatch[1]) * 1024),
        }
      }
    }
  } catch { /* ignore */ }
  return null
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
  rm -f ${UNINSTALL_PATH}
  rm -f ${LOG_PATH}
  rm -rf /etc/bettertether
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
      const connected = status.active
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
    { label: 'Quit', click: async () => {
      forceQuit = true
      await toggleDaemon(false, null)
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
ipcMain.handle(IPC.CHECK_FOR_UPDATES, async () => {
  return checkForUpdates()
})
ipcMain.handle(IPC.DOWNLOAD_UPDATE, async () => {
  await downloadUpdate()
})
ipcMain.handle(IPC.CANCEL_UPDATE, () => {
  cancelUpdate()
})
ipcMain.handle(IPC.RESTART_FOR_UPDATE, async () => {
  return restartForUpdate()
})

app.on('before-quit', () => {
  systemQuit = !forceQuit
  // Stop daemon if still running on system quit (logout/shutdown)
  if (!forceQuit) {
    toggleDaemon(false, null)
  }
})

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) {
    app.dock.show()
  }

  const appMenu = Menu.buildFromTemplate([
    { role: 'appMenu' },
    {
      label: 'File',
      submenu: [
        {
          label: 'Quit',
          accelerator: 'CmdOrCtrl+Q',
          click: async () => {
            forceQuit = true
            await toggleDaemon(false, null)
            app.quit()
          },
        },
      ],
    },
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

app.on('will-quit', () => {
  stopPolling()
})