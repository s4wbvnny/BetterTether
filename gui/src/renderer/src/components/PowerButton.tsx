import { motion } from 'framer-motion'
import clsx from 'clsx'

interface Props {
  connected: boolean
  loading: boolean
  stopped: boolean
}

export function PowerButton({ connected, loading, stopped }: Props) {
  const iconPath = 'M18.364 4.636a9 9 0 1 1-12.728 0M12 2v8'

  return (
    <motion.button
      className={clsx(
        'relative w-32 h-32 rounded-full flex items-center justify-center cursor-pointer no-drag',
        'bg-zinc-900/80 backdrop-blur-xl border-2',
        stopped
          ? 'border-zinc-700/50 animate-glow-off'
          : 'border-emerald-500/50 animate-glow-on'
      )}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={() => {
        if (connected || loading) {
          window.bettertether.stopDaemon()
        } else {
          window.bettertether.startDaemon()
        }
      }}
    >
      {loading && (
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-transparent border-t-emerald-400"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
        />
      )}

      <motion.svg
        viewBox="0 0 24 24"
        className={clsx('w-14 h-14', connected ? 'text-emerald-400' : 'text-zinc-500')}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        animate={{ scale: connected ? [1, 1.1, 1] : 1 }}
        transition={{ duration: 2, repeat: connected ? Infinity : 0, ease: 'easeInOut' }}
      >
        <path d={iconPath} />
      </motion.svg>
    </motion.button>
  )
}
