import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { AppSettings } from '../../../shared/types'

interface Props {
  visible: boolean
}

export function SettingsPanel({ visible }: Props) {
  const [settings, setSettings] = useState<AppSettings>({ quitFromDockQuitsApp: false })

  useEffect(() => {
    if (visible) {
      window.bettertether.getSettings().then(setSettings)
    }
  }, [visible])

  const toggle = async () => {
    const next = { ...settings, quitFromDockQuitsApp: !settings.quitFromDockQuitsApp }
    setSettings(next)
    await window.bettertether.setSettings(next)
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
