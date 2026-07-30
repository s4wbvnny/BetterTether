import { motion } from 'framer-motion'
import type { RelayStats } from '../../../shared/types'

interface Props {
  relay: RelayStats | null
  uptime: string
}

export function StatusCard({ relay, uptime }: Props) {
  return (
    <motion.div
      className="w-full max-w-xs rounded-xl bg-white/[0.04] border border-white/[0.08] p-3 space-y-1.5"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
    >
      {/* Uptime row */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-zinc-500 uppercase tracking-wider">Uptime</span>
        <span className="text-[11px] font-mono text-zinc-300">
          {uptime || '—'}
        </span>
      </div>

      {/* Client IP row */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-zinc-500 uppercase tracking-wider">IP</span>
        <span className="text-[11px] font-mono text-zinc-300">
          {relay?.clientIP || '—'}
        </span>
      </div>
    </motion.div>
  )
}
