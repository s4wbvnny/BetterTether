import { useEffect, useState } from 'react'
import { PowerButton } from './components/PowerButton'
import { TrafficStats } from './components/TrafficStats'
import { LogViewer } from './components/LogViewer'
import { SettingsPanel } from './components/SettingsPanel'
import type { DaemonStatus } from '../../shared/types'

export function App() {
  const [status, setStatus] = useState<DaemonStatus>({ running: false, active: false, relay: null, uptime: '' })
  const [showLogs, setShowLogs] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    const unsub = window.bettertether.onPollStatus(setStatus)
    return unsub
  }, [])

  const connected = status.active

  return (
    <div className="relative h-full flex flex-col">
      {/* Title bar — native traffic lights on left, centered title, toggles on right */}
      <div className="drag-region flex items-center px-4 pt-3 pb-2" style={{ paddingTop: '38px' }}>
        <div className="no-drag absolute right-4 top-3 flex items-center gap-1">
          <button
            className="w-5 h-5 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.06] transition-colors cursor-pointer"
            title="Settings"
            onClick={() => { setShowSettings(v => !v); setShowLogs(false) }}
          >
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          <button
            className="w-5 h-5 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.06] transition-colors cursor-pointer"
            title="Toggle logs"
            onClick={() => { setShowLogs(v => !v); setShowSettings(false) }}
          >
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 17 10 11 4 5" />
              <line x1="12" y1="19" x2="20" y2="19" />
            </svg>
          </button>
        </div>
        <span className="w-full text-center text-xs font-medium tracking-wider text-zinc-400 uppercase">
          BetterTether
        </span>
      </div>

      {/* Power button area */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6">
        <PowerButton connected={connected} loading={status.running && !status.active} stopped={!status.running} />

        <TrafficStats relay={status.relay} />

        {connected && status.relay?.clientIP && (
          <div className="flex items-center gap-2 mt-1">
            <svg viewBox="0 0 24 24" className="w-3 h-3 text-zinc-500" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            <span className="text-[11px] font-mono text-zinc-400 tracking-wider">
              {status.relay.clientIP}
            </span>
          </div>
        )}

      </div>

      <LogViewer visible={showLogs} />
      <SettingsPanel visible={showSettings} />
    </div>
  )
}
