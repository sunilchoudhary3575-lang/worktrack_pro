import React, { useState } from 'react'
import {
  Shield,
  Clock,
  Camera,
  HardDrive,
  Users,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronRight,
  Monitor,
} from 'lucide-react'
import type { DeviceIdentity } from '../App'
import { scheduleService } from '../services/scheduleService'
import { permissionService } from '../services/permissionService'

interface OnboardingScreenProps {
  identity: DeviceIdentity
  onCompleted: () => void
}

export default function OnboardingScreen({ identity, onCompleted }: OnboardingScreenProps) {
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [acknowledgedHours, setAcknowledgedHours] = useState(false)
  const [acknowledgedLocal, setAcknowledgedLocal] = useState(false)
  const [acknowledgedAccess, setAcknowledgedAccess] = useState(false)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const allChecked = agreedToTerms && acknowledgedHours && acknowledgedLocal && acknowledgedAccess

  const handleComplete = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!allChecked || isSubmitting) return

    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      const now = new Date()
      // 1. Save Onboarding Policy Acknowledgement Record
      await scheduleService.saveOnboardingRecord({
        employeeId: identity.employeeId,
        deviceId: identity.deviceId,
        acknowledgedAt: now.toISOString(),
        policyVersion: 'v1.0-phase8',
        agreedToTerms: true,
        acknowledgedWorkingHours: '09:30 - 18:30',
        acknowledgedStoragePolicy: true,
        acknowledgedWhoHasAccess: true,
      })

      // 2. Grant monitoring pre-authorization under the standard policy
      await permissionService.grantPreAuthorization({
        employeeId: identity.employeeId,
        employeeName: identity.employeeName,
        deviceId: identity.deviceId,
        deviceName: identity.deviceName,
        policyVersion: 'v1.0-phase8',
      })

      // 3. Immediately evaluate schedule
      await scheduleService.evaluateSchedule(now)

      onCompleted()
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to complete onboarding. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="h-full w-full bg-surface-950 text-white flex flex-col justify-between overflow-y-auto select-none p-5">
      <div className="max-w-md mx-auto w-full space-y-4 pt-2 pb-6">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-white/10 pb-4">
          <div className="w-10 h-10 rounded-xl bg-brand-500/20 border border-brand-500/30 flex items-center justify-center flex-shrink-0 shadow-glow-green/20">
            <Shield className="w-5 h-5 text-brand-400" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-wide">
              Monitoring & Schedule Policy
            </h1>
            <p className="text-xs text-white/50">
              One-time setup for {identity.employeeName} ({identity.deviceName})
            </p>
          </div>
        </div>

        {errorMessage && (
          <div className="p-3 rounded-xl bg-danger-500/15 border border-danger-500/30 flex items-start gap-2.5 text-xs text-danger-300">
            <AlertCircle className="w-4 h-4 text-danger-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">{errorMessage}</div>
          </div>
        )}

        {/* 5 Key Transparency Principles */}
        <div className="space-y-2.5 text-xs">
          {/* 1. Working Hours */}
          <div className="p-3 rounded-xl bg-surface-900 border border-white/5 space-y-1">
            <div className="flex items-center gap-2 font-semibold text-brand-300">
              <Clock className="w-3.5 h-3.5 text-brand-400" />
              <span>Standard Working Hours (09:30 AM – 06:30 PM)</span>
            </div>
            <p className="text-[11px] text-white/60 leading-relaxed">
              Sessions automatically start at 9:30 AM (or the exact moment the app opens mid-day) and automatically end at 6:30 PM. Active breaks are safely closed when sessions conclude.
            </p>
          </div>

          {/* 2. Screenshot Capture */}
          <div className="p-3 rounded-xl bg-surface-900 border border-white/5 space-y-1">
            <div className="flex items-center gap-2 font-semibold text-brand-300">
              <Camera className="w-3.5 h-3.5 text-brand-400" />
              <span>Transparent Screen Verification</span>
            </div>
            <p className="text-[11px] text-white/60 leading-relaxed">
              Screen captures occur strictly during active working sessions. Capture is blocked during breaks, after hours, and whenever monitoring authorization is revoked. Keystroke logging is prohibited.
            </p>
          </div>

          {/* 3. Local Storage & Auto-Pruning */}
          <div className="p-3 rounded-xl bg-surface-900 border border-white/5 space-y-1">
            <div className="flex items-center gap-2 font-semibold text-brand-300">
              <HardDrive className="w-3.5 h-3.5 text-brand-400" />
              <span>Local-Only Storage (50-File Retention)</span>
            </div>
            <p className="text-[11px] text-white/60 leading-relaxed">
              Captures are preserved locally in your system application storage and auto-pruned after 50 screenshots or 7 days. Data is never uploaded to remote cloud services in this phase.
            </p>
          </div>

          {/* 4. Access & Accountability */}
          <div className="p-3 rounded-xl bg-surface-900 border border-white/5 space-y-1">
            <div className="flex items-center gap-2 font-semibold text-brand-300">
              <Users className="w-3.5 h-3.5 text-brand-400" />
              <span>Authorized Security Oversight</span>
            </div>
            <p className="text-[11px] text-white/60 leading-relaxed">
              Only verified company administrators can inspect session records. An accessible, prominent status badge remains visible at all times while monitoring is active.
            </p>
          </div>

          {/* 5. Windows Background & Tray */}
          <div className="p-3 rounded-xl bg-surface-900 border border-white/5 space-y-1">
            <div className="flex items-center gap-2 font-semibold text-brand-300">
              <Monitor className="w-3.5 h-3.5 text-brand-400" />
              <span>Windows System Tray Execution</span>
            </div>
            <p className="text-[11px] text-white/60 leading-relaxed">
              You can minimize WorkTrack Pro to the Windows system tray and optionally launch on startup so your scheduled hours are tracked seamlessly without desktop clutter.
            </p>
          </div>
        </div>

        {/* Explicit Mandatory Acknowledgements */}
        <form onSubmit={handleComplete} className="pt-2 space-y-3">
          <div className="p-3.5 rounded-xl bg-surface-900/90 border border-brand-500/30 space-y-2.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-brand-400">
              Mandatory Policy Acknowledgements
            </p>

            <label className="flex items-start gap-2.5 text-xs text-white/80 cursor-pointer">
              <input
                id="chk-agree-terms"
                type="checkbox"
                checked={agreedToTerms}
                onChange={e => setAgreedToTerms(e.target.checked)}
                className="mt-0.5 rounded border-white/20 bg-surface-800 text-brand-500 focus:ring-brand-500"
              />
              <span>I have read and agree to the WorkTrack Pro monitoring oversight policy.</span>
            </label>

            <label className="flex items-start gap-2.5 text-xs text-white/80 cursor-pointer">
              <input
                id="chk-agree-hours"
                type="checkbox"
                checked={acknowledgedHours}
                onChange={e => setAcknowledgedHours(e.target.checked)}
                className="mt-0.5 rounded border-white/20 bg-surface-800 text-brand-500 focus:ring-brand-500"
              />
              <span>I acknowledge that sessions run automatically from 09:30 AM to 06:30 PM and pause during breaks.</span>
            </label>

            <label className="flex items-start gap-2.5 text-xs text-white/80 cursor-pointer">
              <input
                id="chk-agree-storage"
                type="checkbox"
                checked={acknowledgedLocal}
                onChange={e => setAcknowledgedLocal(e.target.checked)}
                className="mt-0.5 rounded border-white/20 bg-surface-800 text-brand-500 focus:ring-brand-500"
              />
              <span>I understand captures are stored locally with strict 50-file retention limits.</span>
            </label>

            <label className="flex items-start gap-2.5 text-xs text-white/80 cursor-pointer">
              <input
                id="chk-agree-access"
                type="checkbox"
                checked={acknowledgedAccess}
                onChange={e => setAcknowledgedAccess(e.target.checked)}
                className="mt-0.5 rounded border-white/20 bg-surface-800 text-brand-500 focus:ring-brand-500"
              />
              <span>I acknowledge that authorized administrators may review activity under policy compliance.</span>
            </label>
          </div>

          <button
            id="btn-complete-onboarding"
            type="submit"
            disabled={!allChecked || isSubmitting}
            className="btn-primary w-full py-3 text-xs font-semibold shadow-glow-green disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Activating Schedule...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Acknowledge Policy & Enable Scheduling</span>
                <ChevronRight className="w-4 h-4 ml-auto" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
