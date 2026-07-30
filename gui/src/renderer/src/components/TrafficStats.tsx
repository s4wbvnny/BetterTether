import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import type { TrafficStats as TrafficStatsType } from '../../../shared/types'

interface Props {
  traffic: TrafficStatsType | null
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const val = bytes / Math.pow(1024, i)
  return `${val < 10 ? val.toFixed(2) : val.toFixed(1)} ${units[i]}`
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1) return '—'
  const bps = bytesPerSec * 8 // convert to bits
  if (bps < 1000) return `${bps.toFixed(0)} bps`
  const kbps = bps / 1000
  if (kbps < 1000) return `${kbps.toFixed(1)} Kbps`
  const mbps = kbps / 1000
  return `${mbps.toFixed(1)} Mbps`
}

export function TrafficStats({ traffic }: Props) {
  const sent = traffic?.sentBytes ?? 0
  const recv = traffic?.recvBytes ?? 0
  const sentRate = traffic?.sentRate ?? 0
  const recvRate = traffic?.recvRate ?? 0

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
          <span className="text-xs text-zinc-400 uppercase tracking-wider">Upload</span>
        </div>
        <div className="text-right">
          <AnimatedNumber value={sent} formatter={formatBytes} className="text-sm font-mono text-zinc-200" />
          <div className="text-[10px] text-zinc-500 font-mono">{formatSpeed(sentRate)}</div>
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
          <span className="text-xs text-zinc-400 uppercase tracking-wider">Download</span>
        </div>
        <div className="text-right">
          <AnimatedNumber value={recv} formatter={formatBytes} className="text-sm font-mono text-zinc-200" />
          <div className="text-[10px] text-zinc-500 font-mono">{formatSpeed(recvRate)}</div>
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
