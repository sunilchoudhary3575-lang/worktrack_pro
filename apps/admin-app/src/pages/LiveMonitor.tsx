import { Link } from 'react-router-dom'
import { Radio, Sparkles, ArrowRight, Camera } from 'lucide-react'

export default function LiveMonitor() {
  return (
    <div className="relative min-h-[calc(100vh-8rem)] flex items-center justify-center p-4 sm:p-8 overflow-hidden select-none animate-fade-in">
      {/* ─── Ambient Glow Blobs in Background ─── */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] h-[480px] bg-brand-500/10 dark:bg-brand-500/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 left-1/3 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-accent-500/10 rounded-full blur-2xl pointer-events-none" />

      {/* ─── Central Creative Card ─── */}
      <div className="relative z-10 max-w-xl w-full text-center space-y-6">
        {/* Radar & Broadcast Beacon Icon with concentric ripple rings */}
        <div className="relative inline-flex items-center justify-center mb-2">
          {/* Animated concentric rings */}
          <span className="absolute w-28 h-28 rounded-full border border-brand-500/20 animate-ping opacity-30" />
          <span className="absolute w-24 h-24 rounded-full border border-accent-400/30 animate-pulse" />

          <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-tr from-brand-600/30 via-brand-500/20 to-purple-500/20 border border-brand-500/40 backdrop-blur-md flex items-center justify-center shadow-glow-brand">
            <Radio className="w-10 h-10 text-brand-400 dark:text-brand-300" />
            <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-red-500 shadow-sm" />
            </span>
          </div>
        </div>

        {/* Live Frequency / Signal Wave Graphic */}
        <div className="flex items-center justify-center gap-1.5 h-6">
          <span className="w-1 h-3 bg-brand-400/60 rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
          <span className="w-1 h-5 bg-brand-400 rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
          <span className="w-1 h-6 bg-accent-400 rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
          <span className="w-1 h-4 bg-brand-300 rounded-full animate-pulse" style={{ animationDelay: '450ms' }} />
          <span className="w-1 h-5 bg-purple-400 rounded-full animate-pulse" style={{ animationDelay: '200ms' }} />
          <span className="w-1 h-2 bg-brand-400/60 rounded-full animate-pulse" style={{ animationDelay: '350ms' }} />
        </div>

        {/* Creative Headline */}
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-brand-500/10 border border-brand-500/20 text-[11px] font-mono font-semibold text-brand-400 uppercase tracking-widest">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Tuning In • Live Broadcasting</span>
          </div>

          <h1 className="text-5xl sm:text-7xl font-black tracking-tight uppercase">
            <span className="bg-gradient-to-r from-brand-600 via-indigo-600 to-purple-600 dark:from-white dark:via-brand-200 dark:to-accent-400 bg-clip-text text-transparent drop-shadow-sm">
              Coming Soon
            </span>
          </h1>

          <p className="text-sm sm:text-base text-surface-900/70 dark:text-white/60 font-medium max-w-md mx-auto leading-relaxed">
            Real-time live workstation streaming engine is being tuned. Zero-latency desktop monitoring will be on air shortly.
          </p>
        </div>

        {/* Quick Shortcut button */}
        <div className="pt-2">
          <Link
            to="/screenshots"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-surface-800/80 hover:bg-surface-700/80 border border-white/10 text-xs font-semibold text-white/90 shadow-md hover:border-brand-500/40 transition-all active:scale-95 group"
          >
            <Camera className="w-3.5 h-3.5 text-brand-400" />
            <span>View Periodic Screenshots</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform text-white/50" />
          </Link>
        </div>
      </div>
    </div>
  )
}
