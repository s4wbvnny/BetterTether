import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import type { RelayStats } from '../../../shared/types'

interface Props {
  relay: RelayStats | null
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const val = bytes / Math.pow(1024, i)
  return `${val < 10 ? val.toFixed(2) : val.toFixed(1)} ${units[i]}`
}

export function TrafficStats({ relay }: Props) {
  const sent = relay?.sentBytes ?? 0
  const recv = relay?.recvBytes ?? 0

  return (
    <div className="w-full max-w-xs">
      {/* Upload row */}
      <motion.div
        className="flex items-center justify-between py-2 px-4 rounded-lg bg-white/[0.03] border border-white/[0.06] mb-2"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-400" />
          <span className="text-xs text-zinc-400 uppercase tracking-wider">Uploaded</span>
        </div>
        <div className="text-right">
          <AnimatedNumber value={sent} formatter={formatBytes} className="text-sm font-mono text-zinc-200" />
        </div>
      </motion.div>

      {/* Download row */}
      <motion.div
        className="flex items-center justify-between py-2 px-4 rounded-lg bg-white/[0.03] border border-white/[0.06]"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="text-xs text-zinc-400 uppercase tracking-wider">Downloaded</span>
        </div>
        <div className="text-right">
          <AnimatedNumber value={recv} formatter={formatBytes} className="text-sm font-mono text-zinc-200" />
        </div>
      </motion.div>
    </div>
  )
}

function AnimatedNumber({ value, formatter, className }: { value: number; formatter: (n: number) => string; className?: string }) {
  const [display, setDisplay] = useState(formatter(value))

  useEffect(() => {
    setDisplay(formatter(value))
  }, [value, formatter])

  return (
    <motion.span
      className={className}
      key={display}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      {display}
    </motion.span>
  )
}
