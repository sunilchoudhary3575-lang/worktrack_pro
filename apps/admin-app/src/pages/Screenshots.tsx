import { useState, useEffect, useMemo } from 'react'
import {
  Search,
  Filter,
  Calendar,
  Eye,
  RefreshCw,
  Trash2,
  X,
  Camera,
  Layers,
  Clock,
  Laptop,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  ShieldCheck,
  Maximize2,
  Loader2,
} from 'lucide-react'
import { dataService } from '../services/dataService'
import { SkeletonCard } from '../components/Skeleton'
import type { Screenshot, Employee } from '@worktrack-pro/shared'

function ScreenshotThumbnail({
  screenshot,
  displayName,
}: {
  screenshot: Screenshot
  displayName: string
}) {
  const [url, setUrl] = useState<string>(screenshot.imageUrl || '')
  const [loading, setLoading] = useState(!screenshot.imageUrl)

  useEffect(() => {
    if (screenshot.imageUrl && (screenshot.imageUrl.startsWith('http') || screenshot.imageUrl.startsWith('data:'))) {
      setUrl(screenshot.imageUrl)
      setLoading(false)
      return
    }

    let isMounted = true
    dataService
      .getScreenshotImageUrl(screenshot)
      .then(resolved => {
        if (isMounted && resolved) {
          setUrl(resolved)
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [screenshot])

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-surface-950">
        <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" />
      </div>
    )
  }

  if (!url) {
    return (
      <div className="flex flex-col items-center justify-center gap-1.5 text-white/30 h-full">
        <Camera className="w-6 h-6" />
        <span className="text-[10px]">Cloud Uploaded</span>
      </div>
    )
  }

  return (
    <img
      src={url}
      alt={`Screenshot — ${displayName}`}
      loading="lazy"
      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
      onError={e => {
        ;(e.target as HTMLImageElement).src =
          'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180" fill="%231e293b"><rect width="320" height="180"/><text x="50%" y="50%" fill="%2394a3b8" font-size="12" text-anchor="middle" font-family="sans-serif">Capture Ready</text></svg>'
      }}
    />
  )
}

export default function Screenshots() {
  const [loading, setLoading] = useState(true)
  const [screenshots, setScreenshots] = useState<Screenshot[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [filterEmployee, setFilterEmployee] = useState('')
  const [filterDate, setFilterDate] = useState('')
  const [filterSession, setFilterSession] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selected, setSelected] = useState<Screenshot | null>(null)
  const [selectedImageUrl, setSelectedImageUrl] = useState<string>('')
  const [imageLoading, setImageLoading] = useState(false)
  const [modalImageError, setModalImageError] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // 1. Load Employees for Dropdown
  useEffect(() => {
    dataService.getEmployees().then(setEmployees).catch(() => {})
  }, [])

  // 2. Real-time Subscription to Screenshots
  useEffect(() => {
    setLoading(true)
    const unsubscribe = dataService.subscribeToScreenshots(
      list => {
        setScreenshots(list)
        setLoading(false)
        setIsRefreshing(false)
      },
      filterEmployee ? { employeeId: filterEmployee } : undefined
    )

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe()
      }
    }
  }, [filterEmployee])

  // 3. Resolve Image URL when a Screenshot is selected in Lightbox
  useEffect(() => {
    setModalImageError(false)
    if (!selected) {
      setSelectedImageUrl('')
      setImageLoading(false)
      return
    }

    if (selected.imageUrl && (selected.imageUrl.startsWith('http') || selected.imageUrl.startsWith('data:'))) {
      setSelectedImageUrl(selected.imageUrl)
      setImageLoading(false)
      return
    }

    setImageLoading(true)
    dataService
      .getScreenshotImageUrl(selected)
      .then(url => {
        setSelectedImageUrl(url)
      })
      .catch(() => {
        setSelectedImageUrl(selected.imageUrl || '')
      })
      .finally(() => {
        setImageLoading(false)
      })
  }, [selected])

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3000)
  }

  const handleManualRefresh = async () => {
    setIsRefreshing(true)
    try {
      const list = await dataService.getScreenshots(filterEmployee ? { employeeId: filterEmployee } : undefined)
      setScreenshots(list)
      showToast('✓ Screenshots refreshed from cloud')
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleDeleteScreenshot = async (scr: Screenshot) => {
    setDeleting(true)
    try {
      await dataService.deleteScreenshot(scr.id, scr.storagePath)
      setScreenshots(prev => prev.filter(s => s.id !== scr.id))
      if (selected?.id === scr.id) {
        setSelected(null)
      }
      setDeleteConfirmId(null)
      showToast('🗑️ Screenshot permanently deleted')
    } catch (err: any) {
      showToast('Failed to delete screenshot: ' + (err?.message || 'Error'))
    } finally {
      setDeleting(false)
    }
  }

  // 4. Client-side Filters
  const filteredScreenshots = useMemo(() => {
    return screenshots.filter(scr => {
      // Employee filter
      if (filterEmployee && scr.employeeId !== filterEmployee) return false

      // Session filter
      if (filterSession.trim() && !scr.sessionId.toLowerCase().includes(filterSession.trim().toLowerCase())) {
        return false
      }

      // Date filter (ISO date "YYYY-MM-DD")
      if (filterDate) {
        const scrDateStr = scr.takenAt.toISOString().split('T')[0]
        if (scrDateStr !== filterDate) return false
      }

      // Text Search
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase()
        const empName = employees.find(e => e.id === scr.employeeId)?.name || scr.employeeName || ''
        const matchesName = empName.toLowerCase().includes(q)
        const matchesId = scr.employeeId.toLowerCase().includes(q)
        const matchesDevice = scr.deviceId.toLowerCase().includes(q)
        const matchesSession = scr.sessionId.toLowerCase().includes(q)
        if (!matchesName && !matchesId && !matchesDevice && !matchesSession) return false
      }

      return true
    })
  }, [screenshots, filterEmployee, filterDate, filterSession, searchQuery, employees])

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '120 KB'
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
    return Math.round(bytes / 1024) + ' KB'
  }

  const getEmployeeDisplayName = (empId: string, fallbackName?: string) => {
    const found = employees.find(e => e.id === empId)
    if (found?.name) return found.name
    if (fallbackName && fallbackName !== 'Employee') return fallbackName
    return empId
  }

  // Lightbox Navigation (Next / Previous)
  const currentIndex = selected ? filteredScreenshots.findIndex(s => s.id === selected.id) : -1
  const hasPrev = currentIndex > 0
  const hasNext = currentIndex >= 0 && currentIndex < filteredScreenshots.length - 1

  const handlePrevScreenshot = () => {
    if (hasPrev) {
      setSelected(filteredScreenshots[currentIndex - 1])
    }
  }

  const handleNextScreenshot = () => {
    if (hasNext) {
      setSelected(filteredScreenshots[currentIndex + 1])
    }
  }

  useEffect(() => {
    if (!selected) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        if (currentIndex > 0) setSelected(filteredScreenshots[currentIndex - 1])
      } else if (e.key === 'ArrowRight') {
        if (currentIndex >= 0 && currentIndex < filteredScreenshots.length - 1) {
          setSelected(filteredScreenshots[currentIndex + 1])
        }
      } else if (e.key === 'Escape') {
        setSelected(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selected, currentIndex, filteredScreenshots])

  return (
    <div className="space-y-5 animate-fade-in select-none">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-16 right-6 z-50 animate-slide-up">
          <div className="bg-surface-800/95 border border-brand-500/40 shadow-glow-green/30 backdrop-blur-md rounded-xl p-3 flex items-center gap-2.5 text-xs text-white">
            <CheckCircle2 className="w-4 h-4 text-brand-400" />
            <span className="font-medium">{toastMessage}</span>
          </div>
        </div>
      )}

      {/* Header & Status Bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Camera className="w-5 h-5 text-brand-400" />
            <span>Screenshot Monitoring</span>
          </h1>
          <p className="text-xs text-white/50 pt-0.5">
            Automated visual audit captures delivered securely to Firebase Storage.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Live Sync Badge */}
          <div className="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2 shadow-[0_0_12px_rgba(16,185,129,0.1)]">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-medium">Real-Time Cloud Delivery Active</span>
          </div>

          <button
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1.5"
            title="Refresh screenshots from cloud"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-brand-400' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="glass-card p-4 space-y-3 border-white/5">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input
              id="screenshot-search-input"
              type="text"
              placeholder="Search by employee, device, or session..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="input-field pl-9 py-2 text-xs w-full"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Employee Dropdown */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-900 border border-white/10 text-xs text-white/70">
            <Filter className="w-3.5 h-3.5 text-white/30" />
            <select
              id="screenshot-employee-filter"
              value={filterEmployee}
              onChange={e => setFilterEmployee(e.target.value)}
              className="bg-transparent text-xs text-white/80 outline-none cursor-pointer"
            >
              <option value="">All Employees ({employees.length})</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} ({emp.id})
                </option>
              ))}
            </select>
          </div>

          {/* Date Picker */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-900 border border-white/10 text-xs text-white/70">
            <Calendar className="w-3.5 h-3.5 text-white/30" />
            <input
              id="screenshot-date-filter"
              type="date"
              value={filterDate}
              onChange={e => setFilterDate(e.target.value)}
              className="bg-transparent text-xs text-white/80 outline-none cursor-pointer"
            />
            {filterDate && (
              <button
                onClick={() => setFilterDate('')}
                className="text-white/30 hover:text-white text-[10px]"
                title="Clear date filter"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Reset Filters */}
          {(filterEmployee || filterDate || filterSession || searchQuery) && (
            <button
              onClick={() => {
                setFilterEmployee('')
                setFilterDate('')
                setFilterSession('')
                setSearchQuery('')
              }}
              className="btn-secondary py-2 px-3 text-xs text-white/60 hover:text-white"
            >
              Reset Filters
            </button>
          )}

          {/* Count Badge */}
          <div className="ml-auto text-xs text-white/40 font-mono">
            {filteredScreenshots.length} capture{filteredScreenshots.length === 1 ? '' : 's'} displayed
          </div>
        </div>
      </div>

      {/* Gallery Section */}
      <div className="glass-card p-5 border-white/5 space-y-4">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : filteredScreenshots.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-surface-800 border border-white/10 flex items-center justify-center mx-auto text-white/30">
              <Camera className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-white">No Screenshots Found</h3>
              <p className="text-xs text-white/40 max-w-sm mx-auto">
                {screenshots.length === 0
                  ? 'No automated screenshot captures have been uploaded yet. When an authorized employee session is active, screenshots will appear here automatically.'
                  : 'No screenshots match your current filter criteria. Try resetting your search or date filters.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredScreenshots.map(scr => {
              const displayName = getEmployeeDisplayName(scr.employeeId, scr.employeeName)
              return (
                <div
                  key={scr.id}
                  id={`screenshot-card-${scr.id}`}
                  onClick={() => setSelected(scr)}
                  className="group relative rounded-xl overflow-hidden bg-surface-900 border border-white/10 hover:border-emerald-500/40 transition-all duration-200 cursor-pointer shadow-lg hover:shadow-glow-green/10 flex flex-col"
                >
                  {/* Thumbnail / Image Container */}
                  <div className="relative aspect-video bg-surface-950 overflow-hidden flex items-center justify-center">
                    <ScreenshotThumbnail screenshot={scr} displayName={displayName} />

                    {/* Format / Size Overlay */}
                    <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-surface-950/80 backdrop-blur-sm border border-white/10 text-[9px] font-mono text-white/70">
                      {scr.format ? scr.format.toUpperCase() : 'JPG'} • {formatFileSize(scr.fileSizeBytes)}
                    </div>

                    {/* Hover Inspect Icon */}
                    <div className="absolute inset-0 bg-surface-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-[2px]">
                      <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                        <Maximize2 className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-semibold text-white">Inspect Capture</span>
                    </div>
                  </div>

                  {/* Metadata Footer */}
                  <div className="p-3 space-y-1.5 bg-surface-900 border-t border-white/5 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-1">
                        <h4 className="text-xs font-bold text-white truncate">{displayName}</h4>
                        <span className="text-[10px] text-emerald-400 font-mono bg-emerald-500/10 px-1 rounded">
                          {scr.employeeId}
                        </span>
                      </div>
                      <p className="text-[10px] text-white/40 font-mono truncate">
                        Session: {scr.sessionId}
                      </p>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-white/40 pt-1 border-t border-white/5 font-mono">
                      <span>{scr.takenAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                      <span>{scr.takenAt.toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Lightbox Preview Modal (Full-width clean view with Direct Prev / Next Navigation) ── */}
      {selected && (
        <div
          id="screenshot-lightbox-modal"
          className="fixed inset-0 z-50 bg-surface-950/95 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 select-none"
          onClick={() => setSelected(null)}
        >
          <div
            className="w-full max-w-6xl glass-card border-white/10 overflow-hidden space-y-3 animate-scale-up shadow-2xl flex flex-col max-h-[94vh]"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-3 sm:p-4 border-b border-white/10 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 flex-shrink-0">
                  <Camera className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    {getEmployeeDisplayName(selected.employeeId, selected.employeeName)}
                  </h3>
                  <p className="text-[11px] text-white/50 font-mono">
                    Captured on {selected.takenAt.toLocaleString()} • {selected.employeeId}
                  </p>
                </div>
              </div>

              {/* Direct Next & Previous Navigation Bar */}
              <div className="flex items-center gap-1.5 bg-surface-900 border border-white/10 rounded-xl p-1 shadow-sm">
                <button
                  onClick={handlePrevScreenshot}
                  disabled={!hasPrev}
                  className="px-2.5 py-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition-all flex items-center gap-1 text-xs font-medium"
                  title="Previous Screenshot (Left Arrow)"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span className="hidden sm:inline">Prev</span>
                </button>

                <span className="text-xs text-white/60 font-mono px-2.5 border-x border-white/10">
                  {currentIndex + 1} / {filteredScreenshots.length}
                </span>

                <button
                  onClick={handleNextScreenshot}
                  disabled={!hasNext}
                  className="px-2.5 py-1.5 rounded-lg text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-30 disabled:pointer-events-none transition-all flex items-center gap-1 text-xs font-semibold"
                  title="Next Screenshot (Right Arrow)"
                >
                  <span>Next</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Header Action Buttons */}
              <div className="flex items-center gap-2">
                {selectedImageUrl && (
                  <button
                    onClick={() => window.open(selectedImageUrl, '_blank')}
                    className="btn-secondary py-1.5 px-2.5 text-xs text-white/80 hover:text-white flex items-center gap-1"
                    title="Open full resolution capture in new window"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open Full</span>
                  </button>
                )}

                {deleteConfirmId === selected.id ? (
                  <div className="flex items-center gap-1.5 bg-red-500/15 border border-red-500/30 px-2 py-1 rounded-lg">
                    <span className="text-[11px] text-red-300 font-medium">Delete permanently?</span>
                    <button
                      onClick={() => handleDeleteScreenshot(selected)}
                      disabled={deleting}
                      className="btn-danger py-0.5 px-2 text-[10px]"
                    >
                      {deleting ? 'Deleting...' : 'Yes, Delete'}
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(null)}
                      className="text-white/40 hover:text-white text-[10px] px-1"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirmId(selected.id)}
                    className="btn-secondary py-1.5 px-2.5 text-xs text-red-400 hover:text-red-300 border-red-500/20 hover:border-red-500/40 flex items-center gap-1"
                    title="Delete screenshot from Firestore and Firebase Storage"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                )}

                <button
                  onClick={() => setSelected(null)}
                  className="btn-secondary p-1.5 rounded-lg text-white/50 hover:text-white"
                  title="Close preview (Esc)"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body: Full Width Clean Image Preview with Floating Navigation Arrows */}
            <div className="p-3 sm:p-4 pt-0">
              <div className="relative bg-surface-950 rounded-xl overflow-hidden border border-white/10 flex items-center justify-center min-h-[380px] max-h-[76vh] w-full group">
                {/* Floating Left Arrow */}
                {hasPrev && (
                  <button
                    onClick={handlePrevScreenshot}
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-surface-900/80 hover:bg-surface-800 text-white flex items-center justify-center border border-white/20 shadow-2xl backdrop-blur-md transition-all hover:scale-110 active:scale-95 z-20 group"
                    title="Previous Screenshot (Left Arrow)"
                  >
                    <ChevronLeft className="w-6 h-6 text-white/90 group-hover:text-white" />
                  </button>
                )}

                {/* Floating Right Arrow (Direct Next) */}
                {hasNext && (
                  <button
                    onClick={handleNextScreenshot}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-surface-900/80 hover:bg-surface-800 text-white flex items-center justify-center border border-white/20 shadow-2xl backdrop-blur-md transition-all hover:scale-110 active:scale-95 z-20 group"
                    title="Next Screenshot (Right Arrow)"
                  >
                    <ChevronRight className="w-6 h-6 text-emerald-400 group-hover:text-emerald-300" />
                  </button>
                )}

                {imageLoading ? (
                  <div className="flex flex-col items-center gap-2 text-white/40 py-24">
                    <RefreshCw className="w-7 h-7 animate-spin text-emerald-400" />
                    <span className="text-xs font-mono">Loading capture...</span>
                  </div>
                ) : selectedImageUrl && !modalImageError ? (
                  <img
                    src={selectedImageUrl}
                    alt="Desktop Screen Capture"
                    className="w-full max-h-[76vh] object-contain select-none"
                    onError={() => setModalImageError(true)}
                  />
                ) : (
                  <div className="text-center space-y-3 text-white/40 p-8">
                    <AlertCircle className="w-8 h-8 mx-auto text-amber-400" />
                    <p className="text-xs text-white/70 font-semibold">
                      {modalImageError ? 'Unable to display inline image' : 'Cloud Image Stored'}
                    </p>
                    <p className="text-[10px] text-white/40 font-mono break-all">{selected.storagePath}</p>
                    <div className="flex items-center justify-center gap-2 pt-2">
                      <button
                        onClick={() => {
                          setModalImageError(false)
                          setImageLoading(true)
                          dataService
                            .getScreenshotImageUrl(selected)
                            .then(u => {
                              if (u) setSelectedImageUrl(u)
                            })
                            .finally(() => setImageLoading(false))
                        }}
                        className="btn-secondary text-[11px] py-1.5 px-3 flex items-center gap-1.5"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Retry</span>
                      </button>
                      {selectedImageUrl && (
                        <button
                          onClick={() => window.open(selectedImageUrl, '_blank')}
                          className="btn-primary text-[11px] py-1.5 px-3 flex items-center gap-1.5"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Open in New Tab</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
