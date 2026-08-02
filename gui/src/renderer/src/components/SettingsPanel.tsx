import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { AppSettings, UpdateInfo, UpdateProgress } from '../../../shared/types'

interface Props {
  visible: boolean
}

type CheckState = 'idle' | 'checking'
type UpdateState = 'idle' | 'available' | 'downloading' | 'ready' | 'error'

export function SettingsPanel({ visible }: Props) {
  const [settings, setSettings] = useState<AppSettings>({ quitFromDockQuitsApp: false })
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [checkState, setCheckState] = useState<CheckState>('idle')
  const [updateState, setUpdateState] = useState<UpdateState>('idle')
  const [progress, setProgress] = useState<UpdateProgress | null>(null)
  const cancelledRef = useRef(false)

  useEffect(() => {
    if (visible) {
      window.bettertether.getSettings().then(setSettings)
    }
  }, [visible])

  useEffect(() => {
    const unsub = window.bettertether.onUpdateProgress((p) => {
      if (cancelledRef.current) return
      setProgress(p)
      if (p.phase === 'download' || p.phase === 'stage') {
        setUpdateState('downloading')
      } else if (p.phase === 'ready') {
        setUpdateState('ready')
      } else if (p.phase === 'error') {
        setUpdateState('error')
      }
    })
    return unsub
  }, [])

  const toggle = async () => {
    const next = { ...settings, quitFromDockQuitsApp: !settings.quitFromDockQuitsApp }
    setSettings(next)
    await window.bettertether.setSettings(next)
  }

  const check = async () => {
    setCheckState('checking')
    setUpdateInfo(null)
    setUpdateState('idle')
    setProgress(null)
    const info = await window.bettertether.checkForUpdates()
    setUpdateInfo(info)
    if (info.available) setUpdateState('available')
    setCheckState('idle')
  }

  const updateNow = async () => {
    setUpdateState('downloading')
    setProgress({ phase: 'download', percent: 0, receivedBytes: 0, totalBytes: 0 })
    await window.bettertether.downloadUpdate()
  }

  const dismissUpdate = () => {
    setUpdateInfo(null)
    setUpdateState('idle')
    setProgress(null)
  }

  const cancelDownload = async () => {
    cancelledRef.current = true
    await window.bettertether.cancelUpdate()
    dismissUpdate()
    setTimeout(() => { cancelledRef.current = false }, 1500)
  }

  const restartNow = async () => {
    const res = await window.bettertether.restartForUpdate()
    if (!res.ok) {
      setProgress({ phase: 'error', percent: 0, message: res.error ?? 'Restart failed.' })
      setUpdateState('error')
    }
  }

  const progressLabel = (p: UpdateProgress | null): string => {
    if (!p) return 'Preparing update…'
    if (p.phase === 'stage') return p.message ?? 'Preparing update…'
    if (p.phase === 'download') return `Downloading update… ${p.percent}%`
    return 'Preparing update…'
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="absolute inset-x-0 bottom-0 rounded-t-xl bg-black/60 backdrop-blur-xl border-t border-white/[0.08] flex flex-col z-10"
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 35 }}
        >
          <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.06] shrink-0">
            <span className="text-[11px] font-medium tracking-wider text-zinc-400 uppercase">
              Settings
            </span>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[13px] text-zinc-200">Check for updates</span>
                <span className="text-[11px] text-zinc-500">Manually check for a newer version</span>
              </div>
              <button
                onClick={check}
                disabled={checkState === 'checking'}
                className="text-[12px] font-medium text-emerald-400 hover:text-emerald-300 underline underline-offset-2 cursor-pointer shrink-0 ml-3 disabled:opacity-40 disabled:cursor-default"
              >
                {checkState === 'checking' ? 'Checking…' : 'Check now'}
              </button>
            </div>

            {checkState === 'checking' && (
              <div className="p-2.5 rounded-lg bg-zinc-500/10 border border-zinc-500/20">
                <span className="text-[12px] text-zinc-400">Checking GitHub for updates…</span>
              </div>
            )}

            {updateState === 'available' && updateInfo?.available && (
              <div className="flex flex-col p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 space-y-1.5">
                <span className="text-[13px] text-zinc-200">Update available: {updateInfo.version}</span>
                <span className="text-[11px] text-zinc-400 leading-snug">
                  Download and configure the new version, then restart BetterTether to take effect. Your daemon and settings are preserved.
                </span>
                <div className="flex items-center gap-2 pt-0.5">
                  <button
                    onClick={updateNow}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500 text-[12px] font-semibold text-zinc-950 hover:bg-emerald-400 cursor-pointer"
                  >
                    Update now
                  </button>
                  <button
                    onClick={dismissUpdate}
                    className="px-3 py-1.5 rounded-lg bg-zinc-700/50 text-[12px] font-medium text-zinc-300 hover:bg-zinc-700 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {updateState === 'downloading' && (
              <div className="flex flex-col p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-zinc-200">{progressLabel(progress)}</span>
                  <button
                    onClick={cancelDownload}
                    className="text-[12px] font-medium text-zinc-400 hover:text-zinc-300 underline underline-offset-2 cursor-pointer shrink-0 ml-3"
                  >
                    Cancel
                  </button>
                </div>
                <div className="h-1.5 w-full rounded-full bg-zinc-500/20 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-emerald-400"
                    animate={{ width: `${progress?.percent ?? 0}%` }}
                    transition={{ duration: 0.2 }}
                  />
                </div>
                {progress?.message && progress.phase === 'stage' && (
                  <span className="text-[11px] text-zinc-400">{progress.message}</span>
                )}
              </div>
            )}

            {updateState === 'ready' && (
              <div className="flex flex-col p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 space-y-1.5">
                <span className="text-[13px] text-zinc-200">Update ready to install.</span>
                <span className="text-[11px] text-zinc-400 leading-snug">
                  Restart BetterTether to finish. It will quit, install the update, and relaunch automatically.
                </span>
                <div className="flex items-center gap-2 pt-0.5">
                  <button
                    onClick={restartNow}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500 text-[12px] font-semibold text-zinc-950 hover:bg-emerald-400 cursor-pointer"
                  >
                    Restart now
                  </button>
                  <button
                    onClick={dismissUpdate}
                    className="px-3 py-1.5 rounded-lg bg-zinc-700/50 text-[12px] font-medium text-zinc-300 hover:bg-zinc-700 cursor-pointer"
                  >
                    Later
                  </button>
                </div>
              </div>
            )}

            {updateState === 'error' && (
              <div className="flex flex-col p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 space-y-1.5">
                <span className="text-[12px] text-zinc-300">
                  {progress?.message ?? 'Update failed.'}
                </span>
                <button
                  onClick={dismissUpdate}
                  className="self-start text-[12px] font-medium text-amber-400 hover:text-amber-300 underline underline-offset-2 cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            )}

            {checkState === 'idle' && updateState === 'idle' && updateInfo && !updateInfo.available && updateInfo.error === 'none' && (
              <div className="p-2.5 rounded-lg bg-zinc-500/10 border border-zinc-500/20">
                <span className="text-[12px] text-zinc-300">You're on the latest version ({updateInfo.version})</span>
              </div>
            )}

            {checkState === 'idle' && updateState === 'idle' && updateInfo && updateInfo.error !== 'none' && (
              <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <span className="text-[12px] text-zinc-300">Couldn't check for updates right now. Check your connection and try again.</span>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[13px] text-zinc-200">Keep in system tray</span>
                <span className="text-[11px] text-zinc-500">Dock quit hides the app; only tray Quit fully exits</span>
              </div>
              <button
                onClick={toggle}
                className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer shrink-0 ${
                  !settings.quitFromDockQuitsApp ? 'bg-emerald-500' : 'bg-zinc-500'
                }`}
              >
                <div
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                    !settings.quitFromDockQuitsApp ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
