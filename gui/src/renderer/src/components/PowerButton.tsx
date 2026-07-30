import { motion } from 'framer-motion'
import clsx from 'clsx'

interface Props {
  connected: boolean
  loading: boolean
}

export function PowerButton({ connected, loading }: Props) {
  const iconPath = connected
    ? 'M13 10V3L4 14h7v7l9-11h-7z'
    : 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z'

  return (
    <motion.button
      className={clsx(
        'relative w-32 h-32 rounded-full flex items-center justify-center cursor-pointer no-drag',
        'bg-zinc-900/80 backdrop-blur-xl border-2',
        connected
          ? 'border-emerald-500/50 animate-glow-on'
          : 'border-zinc-700/50 animate-glow-off'
      )}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={() => {
        if (connected) {
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
        fill="currentColor"
        animate={{ scale: connected ? [1, 1.1, 1] : 1 }}
        transition={{ duration: 2, repeat: connected ? Infinity : 0, ease: 'easeInOut' }}
      >
        <path d={iconPath} />
      </motion.svg>
    </motion.button>
  )
}
