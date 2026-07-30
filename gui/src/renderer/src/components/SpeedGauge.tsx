import { motion } from 'framer-motion'

interface Props {
  sentRate: number
  recvRate: number
}

const RADIUS = 80
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

function rateToOffset(rate: number): number {
  // Map 0..100 Mbps to 0..circumference
  const bps = rate * 8
  const fraction = Math.min(bps / 100_000_000, 1) // 100 Mbps = full
  return CIRCUMFERENCE * (1 - fraction)
}

function formatSpeed(bps: number): string {
  if (bps < 1) return '0 Mbps'
  const mbps = (bps * 8) / 1_000_000
  return `${mbps.toFixed(mbps < 10 ? 1 : 0)} Mbps`
}

export function SpeedGauge({ sentRate, recvRate }: Props) {
  const recvOffset = rateToOffset(recvRate)
  const sentOffset = rateToOffset(sentRate)
  const maxRate = Math.max(sentRate, recvRate)

  return (
    <div className="flex items-center gap-6 py-2">
      {/* Receive gauge */}
      <div className="flex flex-col items-center gap-1">
        <svg width="60" height="60" viewBox="0 0 200 200" className="-rotate-90">
          <circle cx="100" cy="100" r={RADIUS} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="12" />
          <motion.circle
            cx="100" cy="100" r={RADIUS} fill="none"
            stroke="rgb(34,197,94)" strokeWidth="12" strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            animate={{ strokeDashoffset: recvOffset }}
            transition={{ type: 'spring', stiffness: 60, damping: 12 }}
          />
        </svg>
        <span className="text-[9px] text-zinc-500 font-mono">DL</span>
        <span className="text-[10px] text-zinc-300 font-mono">{formatSpeed(recvRate)}</span>
      </div>

      {/* Upload gauge */}
      <div className="flex flex-col items-center gap-1">
        <svg width="60" height="60" viewBox="0 0 200 200" className="-rotate-90">
          <circle cx="100" cy="100" r={RADIUS} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="12" />
          <motion.circle
            cx="100" cy="100" r={RADIUS} fill="none"
            stroke="rgb(96,165,250)" strokeWidth="12" strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            animate={{ strokeDashoffset: sentOffset }}
            transition={{ type: 'spring', stiffness: 60, damping: 12 }}
          />
        </svg>
        <span className="text-[9px] text-zinc-500 font-mono">UL</span>
        <span className="text-[10px] text-zinc-300 font-mono">{formatSpeed(sentRate)}</span>
      </div>
    </div>
  )
}
