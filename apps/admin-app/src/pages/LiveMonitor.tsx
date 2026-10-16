import { useState, useEffect, useCallback } from 'react'
import {
  Monitor, Maximize2, RefreshCw, Wifi, WifiOff, Loader2,
  AlertCircle, UserCheck, Clock, CheckCircle2, XCircle,
  StopCircle, ShieldAlert, AlertTriangle, Shield, Play,
  Zap, Info, FileText, Check, ChevronRight
} from 'lucide-react'
import { dataService } from '../services/dataService'
import StatusBadge from '../components/StatusBadge'
import type {
  Employee,
  Device,
  DeviceRegistrationRecord,
  ScreenViewRequest,
  ScreenViewRequestStatus,
  PreAuthorizationRecord,
} from '@worktrack-pro/shared'
import { CURRENT_PRE_AUTH_POLICY } from '@worktrack-pro/shared'

interface DeviceMonitoringItem {
  device: Device
  employee: Employee | null
  registration: DeviceRegistrationRecord | null
  currentRequest: ScreenViewRequest | null
  preAuth: PreAuthorizationRecord | null
  isEligible: boolean
}

export default function LiveMonitor() {
  const [items, setItems] = useState<DeviceMonitoringItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [now, setNow] = useState(new Date())
  const [showPolicyModal, setShowPolicyModal] = useState(false)
  const [unauthNoticeItem, setUnauthNoticeItem] = useState<DeviceMonitoringItem | null>(null)

  // Ticking clock for countdowns and auto-expiry display
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const loadData = useCallback(async (quiet = false) => {
    if (!quiet) setIsLoading(true)
    else setIsRefreshing(true)
    setErrorMessage(null)

    try {
      const [employees, devices, registrations, requests, preAuths] = await Promise.all([
        dataService.getEmployees(),
        dataService.getDevices(),
        dataService.getDeviceRegistrations(),
        dataService.getScreenViewRequests(),
        dataService.getPreAuthorizations(),
      ])

      const mapped: DeviceMonitoringItem[] = devices.map(device => {
        const employee = employees.find(e => e.id === device.employeeId) || null
        const registration = registrations.find(r => r.deviceId === device.id) || null
        const preAuth = preAuths.find(p => p.deviceId === device.id) || null

        // Find the latest active or relevant request for this device
        const deviceRequests = requests.filter(r => r.deviceId === device.id)
        deviceRequests.sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime())
        const currentRequest = deviceRequests[0] || null

        const isEligible = registration?.status === 'approved'

        return {
          device,
          employee,
          registration,
          currentRequest,
          preAuth,
          isEligible,
        }
      })

      setItems(mapped)
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to load live monitor devices.')
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadData()
    // Poll every 2.5 seconds to pick up employee consent and pre-authorization responses
    const poller = setInterval(() => {
      loadData(true)
    }, 2500)
    return () => clearInterval(poller)
  }, [loadData])

  // One-Click View Screen Workflow
  const handleOneClickView = async (item: DeviceMonitoringItem) => {
    if (!item.isEligible) {
      setErrorMessage(`Cannot view screen: Device "${item.device.name}" is not approved (status: ${item.registration?.status || 'unregistered'}).`)
      return
    }

    // Verify pre-authorization
    if (!item.preAuth || item.preAuth.status !== 'granted') {
      setUnauthNoticeItem(item)
      return
    }

    setActionLoadingId(item.device.id)
    setErrorMessage(null)
    try {
      await dataService.startPreAuthorizedSession(item.device.employeeId, item.device.id, {
        adminName: 'Security Admin',
      })
      await loadData(true)
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to start pre-authorized live view.')
    } finally {
      setActionLoadingId(null)
    }
  }

  // Fallback / Standard On-Demand Request
  const handleRequestLiveView = async (item: DeviceMonitoringItem) => {
    if (!item.isEligible) {
      setErrorMessage(`Cannot request live view: Device "${item.device.name}" is not approved (status: ${item.registration?.status || 'unregistered'}).`)
      return
    }

    setActionLoadingId(item.device.id)
    setErrorMessage(null)
    setUnauthNoticeItem(null)
    try {
      await dataService.requestScreenView(item.device.employeeId, item.device.id, {
        expiresInSeconds: 60,
        adminName: 'Security Admin',
      })
      await loadData(true)
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to request live view.')
    } finally {
      setActionLoadingId(null)
    }
  }

  const handleCancelRequest = async (requestId: string) => {
    setActionLoadingId(requestId)
    setErrorMessage(null)
    try {
      await dataService.cancelScreenViewRequest(requestId)
      await loadData(true)
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to cancel live view request.')
    } finally {
      setActionLoadingId(null)
    }
  }

  const handleStopSharing = async (requestId: string) => {
    setActionLoadingId(requestId)
    setErrorMessage(null)
    try {
      await dataService.stopScreenView(requestId, 'admin')
      if (selectedDeviceId) {
        setFullscreen(false)
      }
      await loadData(true)
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to stop live view.')
    } finally {
      setActionLoadingId(null)
    }
  }

  const selectedItem = items.find(i => i.device.id === selectedDeviceId)

  // Compute overall status for a request taking expiry into account
  const getComputedStatus = (req: ScreenViewRequest | null): ScreenViewRequestStatus | 'none' => {
    if (!req) return 'none'
    if (req.status === 'pending') {
      if (req.expiresAt && now.getTime() >= new Date(req.expiresAt).getTime()) {
        return 'expired'
      }
      return 'pending'
    }
    return req.status
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Notice & Oversight Policy Bar */}
      <div className="flex items-start justify-between gap-4 p-4 rounded-xl bg-brand-500/10 border border-brand-500/20">
        <div className="flex items-start gap-3">
          <UserCheck className="w-5 h-5 text-brand-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-brand-300">
                Pre-authorized Live View & Consent Management
              </span>
              <span className="text-[10px] bg-brand-500/20 text-brand-300 px-2 py-0.5 rounded-full font-mono border border-brand-500/30">
                Policy v1.0 Active
              </span>
            </div>
            <p className="text-xs text-white/60 leading-relaxed max-w-3xl">
              One-Click Live View allows instantaneous oversight for employees who have explicitly authorized the monitoring policy.
              Un-authorized devices require per-session consent.
              <strong className="text-warning-300"> Notice:</strong> Screen streams and sessions are simulated in this mock layer without remote video feeds.
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowPolicyModal(true)}
          className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1.5 whitespace-nowrap flex-shrink-0"
        >
          <FileText className="w-3.5 h-3.5 text-brand-400" />
          Oversight Policy
        </button>
      </div>

      {/* Global Error Banner */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-danger-500/15 border border-danger-500/30 flex items-start gap-3 text-xs text-danger-300 animate-slide-up">
          <AlertCircle className="w-4 h-4 text-danger-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 font-medium">{errorMessage}</div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-danger-400 hover:text-danger-200 font-bold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Fullscreen Modal View */}
      {fullscreen && selectedItem && getComputedStatus(selectedItem.currentRequest) === 'approved' && (
        <div className="fixed inset-0 z-50 bg-surface-950 flex flex-col animate-fade-in">
          <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 bg-surface-900">
            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-success-400 animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.8)]" />
              <div>
                <span className="text-sm font-semibold text-white">
                  Live View: {selectedItem.employee?.name || 'Unknown Employee'}
                </span>
                <span className="text-xs text-white/40 ml-2 font-mono">
                  ({selectedItem.device.name}) • Session: {selectedItem.currentRequest?.id}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => selectedItem.currentRequest && handleStopSharing(selectedItem.currentRequest.id)}
                className="btn-danger text-xs py-1.5 px-3 flex items-center gap-1.5"
              >
                <StopCircle className="w-3.5 h-3.5" />
                Stop Viewing
              </button>
              <button
                onClick={() => setFullscreen(false)}
                className="btn-secondary text-xs py-1.5 px-3"
              >
                Exit Fullscreen
              </button>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center p-8 bg-surface-950">
            <div className="w-full max-w-5xl aspect-video bg-surface-900 rounded-2xl flex flex-col items-center justify-center border border-brand-500/20 shadow-2xl relative overflow-hidden">
              <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1 rounded-full bg-success-500/20 border border-success-500/30 text-success-300 text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-success-400 animate-pulse" />
                {selectedItem.currentRequest?.isPreAuthorized ? 'PRE-AUTHORIZED SESSION' : 'EXPLICIT CONSENT GRANTED'}
              </div>
              <Monitor className="w-16 h-16 text-brand-400 animate-pulse" />
              <p className="text-sm font-semibold text-white mt-4">Simulated Screen Feed Active</p>
              <p className="text-xs text-white/40 mt-1 max-w-md text-center">
                Employee {selectedItem.employee?.name} has authorized screen inspection under {selectedItem.currentRequest?.authorizationPolicyVersion || 'Policy v1.0'}.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main Grid Card */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="section-title">Eligible Device Monitor Grid</h2>
            <p className="text-xs text-white/40 mt-0.5">
              Launch one-click live views for pre-authorized devices or request on-demand consent.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-white/40 font-mono">
              {items.filter(i => i.isEligible).length} approved devices • {items.filter(i => i.preAuth?.status === 'granted').length} pre-authorized
            </span>
            <button
              onClick={() => loadData(false)}
              disabled={isLoading || isRefreshing}
              className="btn-secondary py-1 px-2.5 text-xs flex items-center gap-1.5"
              title="Refresh device statuses"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-brand-400' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Loading State */}
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center space-y-3">
            <Loader2 className="w-8 h-8 text-brand-400 animate-spin" />
            <p className="text-xs text-white/50">Loading devices and authorization records...</p>
          </div>
        ) : items.length === 0 ? (
          /* Empty State */
          <div className="py-20 text-center space-y-3">
            <WifiOff className="w-10 h-10 text-white/20 mx-auto" />
            <p className="text-sm font-semibold text-white/60">No devices registered</p>
            <p className="text-xs text-white/30 max-w-sm mx-auto">
              No employee devices found in the system. New devices must register through the Employee App.
            </p>
          </div>
        ) : (
          /* Device Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {items.map(item => {
              const status = getComputedStatus(item.currentRequest)
              const isActionLoading = Boolean(actionLoadingId === item.device.id || (item.currentRequest && actionLoadingId === item.currentRequest.id))
              const isPreAuthGranted = item.preAuth?.status === 'granted'
              const isPreAuthRevoked = item.preAuth?.status === 'revoked'

              // Remaining seconds for pending request
              let remainingSeconds: number | null = null
              if (status === 'pending' && item.currentRequest?.expiresAt) {
                const diff = Math.ceil((new Date(item.currentRequest.expiresAt).getTime() - now.getTime()) / 1000)
                remainingSeconds = Math.max(0, diff)
              }

              return (
                <div
                  key={item.device.id}
                  className={`rounded-xl overflow-hidden border transition-all duration-300 flex flex-col ${
                    status === 'approved'
                      ? 'border-success-500/50 shadow-[0_0_20px_rgba(34,197,94,0.15)] bg-surface-900/90'
                      : status === 'pending'
                      ? 'border-warning-500/40 bg-surface-900/80 shadow-[0_0_15px_rgba(250,204,21,0.1)]'
                      : !item.isEligible
                      ? 'border-white/5 bg-surface-900/40 opacity-75'
                      : 'border-white/10 bg-surface-900/60'
                  }`}
                >
                  {/* Screen Representation Area */}
                  <div className="aspect-video bg-surface-950 relative flex items-center justify-center p-4 border-b border-white/5">
                    {/* Live indicator tag */}
                    {status === 'approved' && (
                      <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 px-2 py-0.5 rounded bg-success-500/20 border border-success-500/30 text-[10px] font-bold text-success-300">
                        <span className="w-1.5 h-1.5 rounded-full bg-success-400 animate-pulse" />
                        {item.currentRequest?.isPreAuthorized ? 'ONE-CLICK ACTIVE' : 'LIVE SHARING ACTIVE'}
                      </div>
                    )}

                    {/* Pending approval tag */}
                    {status === 'pending' && (
                      <div className="absolute top-2.5 left-2.5 flex items-center gap-1 px-2 py-0.5 rounded bg-warning-500/20 border border-warning-500/30 text-[10px] font-bold text-warning-300 font-mono">
                        <Clock className="w-3 h-3 animate-spin" />
                        AWAITING CONSENT {remainingSeconds !== null ? `(${remainingSeconds}s)` : ''}
                      </div>
                    )}

                    {/* Pre-auth status badge top-right */}
                    <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                          isPreAuthGranted
                            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                            : isPreAuthRevoked
                            ? 'bg-danger-500/15 border-danger-500/30 text-danger-400'
                            : 'bg-surface-800 border-white/10 text-white/40'
                        }`}
                        title={
                          isPreAuthGranted
                            ? `Pre-authorized under ${item.preAuth?.policyVersion}`
                            : isPreAuthRevoked
                            ? `Authorization revoked by ${item.preAuth?.revokedBy || 'user'}`
                            : 'No pre-authorization policy configured'
                        }
                      >
                        {isPreAuthGranted ? '⚡ Pre-authorized' : isPreAuthRevoked ? 'Auth Revoked' : 'No Pre-auth'}
                      </span>
                    </div>

                    {/* Center Display based on State */}
                    {status === 'approved' ? (
                      <div className="text-center space-y-2">
                        <Monitor className="w-10 h-10 text-success-400 mx-auto animate-pulse" />
                        <p className="text-xs font-semibold text-white">
                          {item.currentRequest?.isPreAuthorized ? 'One-Click Live Session' : 'Consent-Approved Session'}
                        </p>
                        <p className="text-[10px] text-white/40">
                          Started at {item.currentRequest?.respondedAt ? new Date(item.currentRequest.respondedAt).toLocaleTimeString() : 'Recently'}
                        </p>
                        <button
                          onClick={() => {
                            setSelectedDeviceId(item.device.id)
                            setFullscreen(true)
                          }}
                          className="mt-1 text-[11px] text-brand-400 hover:text-brand-300 flex items-center gap-1 mx-auto underline font-medium"
                        >
                          <Maximize2 className="w-3 h-3" />
                          Expand View
                        </button>
                      </div>
                    ) : status === 'pending' ? (
                      <div className="text-center space-y-2">
                        <Loader2 className="w-8 h-8 text-warning-400 mx-auto animate-spin" />
                        <p className="text-xs font-medium text-warning-300">Awaiting Employee Response</p>
                        <p className="text-[10px] text-white/40">
                          Expires in {remainingSeconds}s
                        </p>
                      </div>
                    ) : status === 'rejected' ? (
                      <div className="text-center space-y-1.5 p-2">
                        <XCircle className="w-8 h-8 text-danger-400 mx-auto" />
                        <p className="text-xs font-semibold text-danger-300">Permission Denied</p>
                        <p className="text-[10px] text-white/50 max-w-xs line-clamp-2">
                          Reason: {item.currentRequest?.rejectionReason || 'No reason provided by employee.'}
                        </p>
                      </div>
                    ) : status === 'cancelled' ? (
                      <div className="text-center space-y-1.5">
                        <AlertTriangle className="w-8 h-8 text-white/30 mx-auto" />
                        <p className="text-xs font-semibold text-white/60">Request Cancelled</p>
                        <p className="text-[10px] text-white/30">Cancelled by administrator</p>
                      </div>
                    ) : status === 'expired' ? (
                      <div className="text-center space-y-1.5">
                        <Clock className="w-8 h-8 text-white/30 mx-auto" />
                        <p className="text-xs font-semibold text-white/60">Request Expired</p>
                        <p className="text-[10px] text-white/30">Employee did not respond within timeout</p>
                      </div>
                    ) : status === 'stopped' ? (
                      <div className="text-center space-y-1.5">
                        <StopCircle className="w-8 h-8 text-white/30 mx-auto" />
                        <p className="text-xs font-semibold text-white/60">Session Stopped</p>
                        <p className="text-[10px] text-white/30">
                          Stopped by {item.currentRequest?.stoppedBy || 'user'} at {item.currentRequest?.stoppedAt ? new Date(item.currentRequest.stoppedAt).toLocaleTimeString() : 'earlier'}
                        </p>
                      </div>
                    ) : !item.isEligible ? (
                      <div className="text-center space-y-2">
                        <ShieldAlert className="w-8 h-8 text-warning-400/50 mx-auto" />
                        <p className="text-xs font-semibold text-white/50">Unapproved Device</p>
                        <p className="text-[10px] text-white/30 max-w-[200px]">
                          Device must be approved in Device Registrations before monitoring can be initiated.
                        </p>
                      </div>
                    ) : (
                      <div className="text-center space-y-1.5 opacity-60 hover:opacity-100 transition-opacity">
                        <Monitor className="w-8 h-8 text-white/40 mx-auto" />
                        <p className="text-xs text-white/60 font-medium">
                          {isPreAuthGranted ? 'One-Click Live View Ready' : 'Ready to Request Consent'}
                        </p>
                        <p className="text-[10px] text-white/30">
                          {isPreAuthGranted ? 'Click "View Screen" for instant oversight' : 'Click below to initiate view'}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Device & Employee Meta Footer */}
                  <div className="p-3 bg-surface-900 flex-1 flex flex-col justify-between space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate">
                          {item.employee?.name || 'Unassigned Device'}
                        </p>
                        <p className="text-[11px] text-white/40 truncate font-mono">
                          {item.device.name} • {item.device.hostname}
                        </p>
                      </div>
                      <StatusBadge status={item.device.status} />
                    </div>

                    {/* Operational Action Controls */}
                    <div className="pt-2 border-t border-white/5 flex items-center justify-between gap-2">
                      <span className="text-[10px] text-white/30 font-mono">
                        {status === 'approved' ? (
                          <span className="text-success-400 font-semibold">● Active Session</span>
                        ) : status === 'pending' ? (
                          <span className="text-warning-400 font-semibold">● Awaiting Response</span>
                        ) : (
                          `Status: ${status}`
                        )}
                      </span>

                      {/* Dynamic Action Buttons */}
                      <div className="flex items-center gap-1.5">
                        {status === 'pending' && item.currentRequest && (
                          <button
                            onClick={() => handleCancelRequest(item.currentRequest!.id)}
                            disabled={isActionLoading}
                            className="btn-danger py-1 px-2.5 text-[11px] flex items-center gap-1 font-semibold"
                          >
                            {isActionLoading ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <XCircle className="w-3 h-3" />
                            )}
                            Cancel Request
                          </button>
                        )}

                        {status === 'approved' && item.currentRequest && (
                          <button
                            onClick={() => handleStopSharing(item.currentRequest!.id)}
                            disabled={isActionLoading}
                            className="btn-danger py-1 px-2.5 text-[11px] flex items-center gap-1 font-semibold"
                          >
                            {isActionLoading ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <StopCircle className="w-3 h-3" />
                            )}
                            Stop Viewing
                          </button>
                        )}

                        {(status === 'none' || status === 'rejected' || status === 'cancelled' || status === 'expired' || status === 'stopped') && (
                          <>
                            {isPreAuthGranted ? (
                              /* One-Click Action */
                              <button
                                onClick={() => handleOneClickView(item)}
                                disabled={!item.isEligible || isActionLoading}
                                className={`py-1 px-2.5 text-[11px] font-semibold rounded-lg flex items-center gap-1.5 transition-all ${
                                  item.isEligible
                                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-glow-green/30'
                                    : 'bg-surface-800 text-white/30 cursor-not-allowed border border-white/5'
                                }`}
                                title="Instantly start pre-authorized live screen view"
                              >
                                {isActionLoading ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Zap className="w-3 h-3 fill-emerald-300" />
                                )}
                                View Screen
                              </button>
                            ) : (
                              /* Standard Consent Request */
                              <button
                                onClick={() => handleOneClickView(item)}
                                disabled={!item.isEligible || isActionLoading}
                                className={`py-1 px-2.5 text-[11px] font-semibold rounded-lg flex items-center gap-1.5 transition-all ${
                                  item.isEligible
                                    ? 'bg-brand-600 hover:bg-brand-500 text-white'
                                    : 'bg-surface-800 text-white/30 cursor-not-allowed border border-white/5'
                                }`}
                                title={
                                  !item.isEligible
                                    ? `Device registration is "${item.registration?.status || 'unregistered'}". Live view cannot be requested.`
                                    : 'View screen or request live view authorization'
                                }
                              >
                                {isActionLoading ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Wifi className="w-3 h-3" />
                                )}
                                View Screen
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── MODAL: Pre-Authorization Required Notice ─────────── */}
      {unauthNoticeItem && (
        <div className="fixed inset-0 z-50 bg-surface-950/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md glass-card p-6 space-y-4 animate-slide-up border-warning-500/30">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-warning-500/20 border border-warning-500/30 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-warning-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Pre-Authorization Policy Required</h3>
                <p className="text-[11px] text-white/50">One-click live viewing is not authorized</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-surface-900 border border-white/5 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-white/40">Target Employee:</span>
                <span className="font-semibold text-white">{unauthNoticeItem.employee?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/40">Device:</span>
                <span className="font-mono text-white/80">{unauthNoticeItem.device.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/40">Pre-Auth Status:</span>
                <span className="font-semibold text-warning-400 uppercase">
                  {unauthNoticeItem.preAuth?.status || 'NOT CONFIGURED'}
                </span>
              </div>
            </div>

            <p className="text-xs text-white/70 leading-relaxed">
              This employee has not authorized persistent one-click oversight under <strong>Policy v1.0</strong> (or authorization was revoked).
              To inspect this device, you may send a per-session manual consent request that requires individual employee approval.
            </p>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setUnauthNoticeItem(null)}
                className="btn-secondary flex-1 py-2 text-xs"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => handleRequestLiveView(unauthNoticeItem)}
                className="btn-primary flex-1 py-2 text-xs font-semibold shadow-glow-green flex items-center justify-center gap-1.5"
              >
                <Wifi className="w-3.5 h-3.5" />
                Request Per-Session Consent
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Oversight Policy Scope Details ────────────── */}
      {showPolicyModal && (
        <div className="fixed inset-0 z-50 bg-surface-950/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg glass-card p-6 space-y-4 animate-slide-up border-brand-500/30">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-brand-500/20 border border-brand-500/30 flex items-center justify-center">
                  <Shield className="w-4 h-4 text-brand-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">{CURRENT_PRE_AUTH_POLICY.name}</h3>
                  <p className="text-[11px] text-brand-400 font-mono">Policy Version: {CURRENT_PRE_AUTH_POLICY.version}</p>
                </div>
              </div>
              <button onClick={() => setShowPolicyModal(false)} className="text-white/40 hover:text-white">
                <XCircle className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-white/70 leading-relaxed">
              {CURRENT_PRE_AUTH_POLICY.description}
            </p>

            <div className="p-3.5 rounded-xl bg-surface-900 border border-white/5 space-y-2 text-xs">
              <p className="text-[11px] font-bold uppercase tracking-wider text-white/60">Policy Scope & Safeguards:</p>
              <ul className="space-y-1.5 text-white/80">
                {CURRENT_PRE_AUTH_POLICY.scope.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-[11px]">
                    <Check className="w-3.5 h-3.5 text-success-400 flex-shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-3 rounded-xl bg-brand-500/10 border border-brand-500/20 text-[11px] text-brand-200">
              💡 Employees can grant or revoke pre-authorization directly inside their Employee Agent at any time.
            </div>

            <button
              type="button"
              onClick={() => setShowPolicyModal(false)}
              className="btn-primary w-full py-2 text-xs font-semibold"
            >
              Close Policy Overview
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
