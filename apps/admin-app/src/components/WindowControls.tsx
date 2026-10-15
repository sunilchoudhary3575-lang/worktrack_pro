import { useState, useEffect } from 'react'
import { Minus, Square, Copy, X } from 'lucide-react'

export default function WindowControls() {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.invoke('window:isMaximized').then((res: any) => {
        if (res?.success) setIsMaximized(!!res.isMaximized)
      }).catch(() => {})
    }
  }, [])

  const handleMinimize = () => {
    if (window.electronAPI) {
      window.electronAPI.invoke('window:minimize')
    }
  }

  const handleMaximize = async () => {
    if (window.electronAPI) {
      const res: any = await window.electronAPI.invoke('window:maximize')
      if (res?.success && typeof res.isMaximized === 'boolean') {
        setIsMaximized(res.isMaximized)
      } else {
        setIsMaximized(prev => !prev)
      }
    } else {
      setIsMaximized(prev => !prev)
    }
  }

  const handleClose = () => {
    if (window.electronAPI) {
      window.electronAPI.invoke('window:close')
    }
  }

  return (
    <div className="flex items-center titlebar-no-drag select-none -mr-2">
      <button
        onClick={handleMinimize}
        className="w-10 h-8 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors"
        title="Minimize"
        aria-label="Minimize"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={handleMaximize}
        className="w-10 h-8 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors"
        title={isMaximized ? 'Restore Down' : 'Maximize'}
        aria-label={isMaximized ? 'Restore' : 'Maximize'}
      >
        {isMaximized ? <Copy className="w-3 h-3 rotate-180" /> : <Square className="w-3 h-3" />}
      </button>
      <button
        onClick={handleClose}
        className="w-10 h-8 flex items-center justify-center text-white/50 hover:text-white hover:bg-red-600 transition-colors"
        title="Close"
        aria-label="Close"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
