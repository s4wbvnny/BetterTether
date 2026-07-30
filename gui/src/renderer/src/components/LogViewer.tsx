import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface Props {
  visible: boolean
}

export function LogViewer({ visible }: Props) {
  const [logs, setLogs] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const autoScrollRef = useRef(true)

  useEffect(() => {
    if (!visible) return
    window.bettertether.getLogs().then(setLogs)
    const unsub = window.bettertether.onPollLogs((lines) => {
      setLogs(lines)
      if (autoScrollRef.current && scrollRef.current) {
        requestAnimationFrame(() => {
          scrollRef.current!.scrollTop = scrollRef.current!.scrollHeight
        })
      }
    })
    return unsub
  }, [visible])

  const handleScroll = () => {
    if (!scrollRef.current) return
    const el = scrollRef.current
    autoScrollRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 40
  }

  const handleClear = async () => {
    await window.bettertether.clearLogs()
    setLogs('')
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="absolute inset-x-0 bottom-0 h-64 rounded-t-xl bg-black/60 backdrop-blur-xl border-t border-white/[0.08] flex flex-col z-10"
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 35 }}
        >
          {/* header */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.06] shrink-0">
            <span className="text-[11px] font-medium tracking-wider text-zinc-400 uppercase">
              Daemon Log
            </span>
            <button
              className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer uppercase tracking-wider"
              onClick={handleClear}
            >
              Clear
            </button>
          </div>

          {/* log lines */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto px-4 py-2 font-mono text-[11px] leading-relaxed text-zinc-400 select-text whitespace-pre"
          >
            {logs || <span className="text-zinc-600 italic">No log output</span>}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
