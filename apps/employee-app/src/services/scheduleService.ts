import type {
  ScheduleConfig,
  ScheduleState,
  ScheduleStatusInfo,
  OnboardingPolicyRecord,
  BackgroundSettings,
  ScheduleReconcileResult,
  WorkSession,
  EmployeeBreak,
} from '@worktrack-pro/shared'
import {
  DEFAULT_SCHEDULE_CONFIG,
  DEFAULT_BACKGROUND_SETTINGS,
} from '@worktrack-pro/shared'
import { deviceService } from './deviceService'
import { sessionService } from './sessionService'
import { permissionService } from './permissionService'
import { getFirebaseInstance } from './firebaseAuth'
import { doc, getDoc, onSnapshot } from 'firebase/firestore'

export interface IClock {
  now(): Date
  setTimeout(fn: () => void, ms: number): any
  clearTimeout(id: any): void
  setInterval(fn: () => void, ms: number): any
  clearInterval(id: any): void
}

export const systemClock: IClock = {
  now: () => new Date(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (id) => clearInterval(id),
}

export interface ScheduleStateData {
  lastEvaluatedDateStr?: string
  scheduledSessionStartedDateStr?: string
  manualStopDateStr?: string
  lastHeartbeatIso?: string
}

export const STORAGE_KEYS = {
  ONBOARDING: 'worktrack_onboarding_record',
  BACKGROUND_SETTINGS: 'worktrack_background_settings',
  SCHEDULE_STATE: 'worktrack_schedule_state',
  ACTIVE_SCHEDULE_CONFIG: 'worktrack_active_schedule_config',
  CUSTOM_SHIFT_END: 'worktrack_custom_shift_end',
}

export class ScheduleService {
  private clock: IClock
  private config: ScheduleConfig
  private backgroundLoopTimer: any = null
  private isEvaluating = false
  private cloudUnsub: (() => void) | null = null
  private listeners: Set<(config: ScheduleConfig) => void> = new Set()

  constructor(clock: IClock = systemClock, config: ScheduleConfig = DEFAULT_SCHEDULE_CONFIG) {
    this.clock = clock
    let initialConfig = { ...config }

    if (typeof localStorage !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_KEYS.ACTIVE_SCHEDULE_CONFIG)
        if (saved) {
          const parsed = JSON.parse(saved)
          if (parsed && typeof parsed.endHour === 'number') {
            initialConfig = { ...initialConfig, ...parsed }
          }
        }
      } catch {}
    }

    this.config = initialConfig
  }

  /**
   * Set custom clock (useful for fake timer testing)
   */
  setClock(clock: IClock): void {
    this.clock = clock
  }

  /**
   * Set schedule configuration
   */
  setConfig(config: Partial<ScheduleConfig>): void {
    this.config = { ...this.config, ...config }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_SCHEDULE_CONFIG, JSON.stringify(this.config))
    }
    this.notifyListeners()
    this.syncToElectron()
  }

  getConfig(): ScheduleConfig {
    return { ...this.config }
  }

  /**
   * Subscribe to schedule config updates
   */
  onScheduleChanged(cb: (config: ScheduleConfig) => void): () => void {
    this.listeners.add(cb)
    return () => {
      this.listeners.delete(cb)
    }
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.getConfig())
      } catch {}
    }
  }

  private async syncToElectron(): Promise<void> {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.invoke) {
      try {
        await (window as any).electronAPI.invoke('schedule:setConfig', this.config)
      } catch {}
    }
  }

  /**
   * Parse schedule object from Firestore or settings (e.g. { startTime: "09:30", endTime: "18:30" })
   */
  applyScheduleFromData(data: { startTime?: string; endTime?: string; timezone?: string }): void {
    let changed = false
    if (data.startTime && typeof data.startTime === 'string') {
      const [sh, sm] = data.startTime.split(':').map(Number)
      if (!isNaN(sh) && !isNaN(sm)) {
        if (this.config.startHour !== sh || this.config.startMinute !== sm) {
          this.config.startHour = sh
          this.config.startMinute = sm
          changed = true
        }
      }
    }

    if (data.endTime && typeof data.endTime === 'string') {
      const [eh, em] = data.endTime.split(':').map(Number)
      if (!isNaN(eh) && !isNaN(em)) {
        if (this.config.endHour !== eh || this.config.endMinute !== em) {
          this.config.endHour = eh
          this.config.endMinute = em
          changed = true
        }
      }
    }

    if (data.timezone && this.config.timezone !== data.timezone) {
      this.config.timezone = data.timezone
      changed = true
    }

    if (changed) {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEYS.ACTIVE_SCHEDULE_CONFIG, JSON.stringify(this.config))
      }
      this.notifyListeners()
      this.syncToElectron()
    }
  }

  /**
   * One-time fetch of schedule config from Firestore (/settings/global).
   */
  async fetchCloudSchedule(): Promise<ScheduleConfig> {
    try {
      const { db } = getFirebaseInstance()
      if (db) {
        const snap = await getDoc(doc(db, 'settings', 'global'))
        if (snap.exists()) {
          const data = snap.data()
          if (data?.schedule) {
            this.applyScheduleFromData(data.schedule)
          }
        }
      }
    } catch (err) {
      console.warn('[ScheduleService] Could not fetch cloud schedule:', err)
    }
    return this.getConfig()
  }

  /**
   * Realtime subscription to schedule changes from Firestore (/settings/global).
   */
  subscribeToCloudSchedule(): () => void {
    if (this.cloudUnsub) {
      this.cloudUnsub()
      this.cloudUnsub = null
    }

    try {
      const { db } = getFirebaseInstance()
      if (!db) return () => {}

      this.cloudUnsub = onSnapshot(
        doc(db, 'settings', 'global'),
        snap => {
          if (snap.exists()) {
            const data = snap.data()
            if (data?.schedule) {
              this.applyScheduleFromData(data.schedule)
            }
          }
        },
        err => {
          console.warn('[ScheduleService] Realtime schedule subscription warning:', err)
        }
      )

      return () => {
        if (this.cloudUnsub) {
          this.cloudUnsub()
          this.cloudUnsub = null
        }
      }
    } catch (err) {
      console.warn('[ScheduleService] Failed to establish schedule subscription:', err)
      return () => {}
    }
  }

  // ─── Date & Time Helpers ────────────────────────────────────

  /**
   * Format Date to local "YYYY-MM-DD"
   */
  formatDateStr(date: Date): string {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  /**
   * Format Date to local 12-hour or 24-hour time
   */
  formatTimeStr(date: Date): string {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  /**
   * Format configured Start Time as human-readable string (e.g. "09:30 AM")
   */
  getFormattedStartTime(): string {
    const d = new Date()
    d.setHours(this.config.startHour, this.config.startMinute, 0, 0)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  /**
   * Format configured End Time as human-readable string (e.g. "06:30 PM")
   */
  getFormattedEndTime(): string {
    const d = new Date()
    d.setHours(this.config.endHour, this.config.endMinute, 0, 0)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  /**
   * Format entire configured Shift Range (e.g. "09:30 AM – 06:30 PM")
   */
  getFormattedShiftTime(): string {
    return `${this.getFormattedStartTime()} – ${this.getFormattedEndTime()}`
  }

  /**
   * Determine whether given date is within configured working hours
   */
  isWithinWorkingHours(date?: Date): boolean {
    const d = date || this.clock.now()
    const currentMins = d.getHours() * 60 + d.getMinutes()
    const startMins = this.config.startHour * 60 + this.config.startMinute
    const endMins = this.config.endHour * 60 + this.config.endMinute

    return currentMins >= startMins && currentMins < endMins
  }

  /**
   * Determine whether the given time has reached or passed today's scheduled end boundary
   */
  isPastScheduledEnd(date?: Date): boolean {
    const now = date || this.clock.now()
    const boundary = this.getScheduledEndBoundary(now)
    return now.getTime() >= boundary.getTime()
  }

  /**
   * Calculate scheduled start date for the given date
   */
  getScheduledStartBoundary(date?: Date): Date {
    const d = new Date(date || this.clock.now())
    d.setHours(this.config.startHour, this.config.startMinute, 0, 0)
    return d
  }

  /**
   * Calculate scheduled end date for the given date
   */
  getScheduledEndBoundary(date?: Date): Date {
    const d = new Date(date || this.clock.now())
    d.setHours(this.config.endHour, this.config.endMinute, 0, 0)
    return d
  }

  // ─── Storage Accessors ──────────────────────────────────────

  async getOnboardingRecord(deviceId?: string): Promise<OnboardingPolicyRecord | null> {
    if (typeof localStorage === 'undefined') return null
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.ONBOARDING)
      if (!raw) return null
      const parsed = JSON.parse(raw) as OnboardingPolicyRecord
      if (deviceId && parsed.deviceId !== deviceId) return null
      return parsed
    } catch {
      return null
    }
  }

  async saveOnboardingRecord(record: OnboardingPolicyRecord): Promise<void> {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.ONBOARDING, JSON.stringify(record))
    }
    // Sync with Electron IPC if available
    if (typeof window !== 'undefined' && (window as any).electronAPI?.invoke) {
      try {
        await (window as any).electronAPI.invoke('onboarding:saveRecord', record)
      } catch {
        // quiet fallback
      }
    }
  }

  async getBackgroundSettings(): Promise<BackgroundSettings> {
    if (typeof localStorage === 'undefined') return { ...DEFAULT_BACKGROUND_SETTINGS }
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.BACKGROUND_SETTINGS)
      if (!raw) return { ...DEFAULT_BACKGROUND_SETTINGS }
      const parsed = JSON.parse(raw)
      return {
        minimizeToTrayOnClose: Boolean(parsed.minimizeToTrayOnClose),
        launchOnStartup: Boolean(parsed.launchOnStartup),
      }
    } catch {
      return { ...DEFAULT_BACKGROUND_SETTINGS }
    }
  }

  async saveBackgroundSettings(settings: Partial<BackgroundSettings>): Promise<BackgroundSettings> {
    const current = await this.getBackgroundSettings()
    const updated: BackgroundSettings = {
      minimizeToTrayOnClose: settings.minimizeToTrayOnClose !== undefined ? settings.minimizeToTrayOnClose : current.minimizeToTrayOnClose,
      launchOnStartup: settings.launchOnStartup !== undefined ? settings.launchOnStartup : current.launchOnStartup,
    }

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.BACKGROUND_SETTINGS, JSON.stringify(updated))
    }

    // Sync with Electron IPC if available (handles app.setLoginItemSettings)
    if (typeof window !== 'undefined' && (window as any).electronAPI?.invoke) {
      try {
        await (window as any).electronAPI.invoke('settings:setBackgroundSettings', updated)
      } catch {
        // quiet fallback
      }
    }

    return updated
  }

  async getScheduleState(): Promise<ScheduleStateData> {
    if (typeof localStorage === 'undefined') return {}
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.SCHEDULE_STATE)
      if (!raw) return {}
      return JSON.parse(raw)
    } catch {
      return {}
    }
  }

  async saveScheduleState(state: Partial<ScheduleStateData>): Promise<void> {
    const current = await this.getScheduleState()
    const merged = { ...current, ...state }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.SCHEDULE_STATE, JSON.stringify(merged))
    }
  }

  async resetAll(): Promise<void> {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEYS.ONBOARDING)
      localStorage.removeItem(STORAGE_KEYS.BACKGROUND_SETTINGS)
      localStorage.removeItem(STORAGE_KEYS.SCHEDULE_STATE)
    }
    this.stopBackgroundLoop()
  }

  // ─── Manual Controls Integration ───────────────────────────

  /**
   * Called when an employee explicitly stops a session via the UI.
   * Records today's date to prevent same-day automated re-trigger.
   */
  async recordManualStop(now?: Date): Promise<void> {
    const d = now || this.clock.now()
    const dateStr = this.formatDateStr(d)
    await this.saveScheduleState({
      manualStopDateStr: dateStr,
      lastHeartbeatIso: d.toISOString(),
    })
  }

  /**
   * Called when an employee explicitly starts a session manually.
   * Clears any manual stop lock for today and permits active work.
   */
  async recordManualStart(now?: Date): Promise<void> {
    const d = now || this.clock.now()
    await this.saveScheduleState({
      manualStopDateStr: undefined,
      lastHeartbeatIso: d.toISOString(),
    })
  }

  // ─── Reconciliation & Background Evaluation ────────────────

  /**
   * Evaluates the current schedule and reconciles any session transitions.
   * Handles:
   *  - Auto-start at 9:30 AM (or actual time if started mid-day)
   *  - Auto-end at 6:30 PM (closes active breaks safely)
   *  - Blocking when device is unapproved, onboarding unacknowledged, or authorization revoked
   *  - Suppressing auto-start after manual stop on same calendar day
   *  - Reconciling missed schedule boundaries without fabricating offline activity
   */
  async evaluateSchedule(currentDate?: Date): Promise<ScheduleReconcileResult> {
    if (this.isEvaluating) {
      return {
        action: 'none',
        reason: 'Evaluation already in progress',
        timestamp: currentDate || this.clock.now(),
      }
    }

    this.isEvaluating = true
    try {
      const now = currentDate || this.clock.now()
      const todayDateStr = this.formatDateStr(now)
      const scheduleState = await this.getScheduleState()

      // 1. Check Device Registration
      const reg = await deviceService.getRegistrationRecord()
      if (!reg || reg.status !== 'approved') {
        return {
          action: 'blocked',
          reason: `Device registration status is "${reg?.status || 'unregistered'}". Device must be approved before scheduling can operate.`,
          timestamp: now,
        }
      }

      // 2. Check Onboarding & Policy Acknowledgement (auto-grant for approved devices)
      let onboarding = await this.getOnboardingRecord(reg.deviceId)
      if (!onboarding || !onboarding.agreedToTerms) {
        const seededOnboarding: OnboardingPolicyRecord = {
          deviceId: reg.deviceId,
          employeeId: reg.employeeId,
          acknowledgedAt: now.toISOString(),
          policyVersion: '1.0',
          agreedToTerms: true,
          acknowledgedWorkingHours: `${this.getFormattedStartTime()} - ${this.getFormattedEndTime()}`,
          acknowledgedStoragePolicy: true,
          acknowledgedWhoHasAccess: true,
        }
        await this.saveOnboardingRecord(seededOnboarding).catch(() => {})
      }

      // 3. Check Monitoring Pre-Authorization
      let preAuth = await permissionService.getPreAuthorization(reg.deviceId)
      const activeApproved = await permissionService.getActiveApprovedRequest(reg.deviceId)
      let isAuthorized =
        (preAuth && preAuth.status === 'granted') ||
        Boolean(activeApproved && (activeApproved.status === 'approved' || activeApproved.status === 'active'))

      if (!isAuthorized) {
        try {
          preAuth = await permissionService.grantPreAuthorization({
            employeeId: reg.employeeId,
            employeeName: reg.employeeName,
            deviceId: reg.deviceId,
            deviceName: reg.deviceName,
          })
          isAuthorized = preAuth && preAuth.status === 'granted'
        } catch {}
      }

      if (!isAuthorized) {
        // If an active session exists while authorization is revoked/missing:
        // Do not auto-start, and if running, stop it
        const active = await sessionService.getActiveSession()
        if (active && (active.status === 'working' || active.status === 'on_break')) {
          const ended = await sessionService.endWork({ timestamp: now, notes: 'Monitoring authorization revoked' })
          await this.saveScheduleState({ lastHeartbeatIso: now.toISOString() })
          return {
            action: 'ended',
            reason: 'Monitoring authorization was revoked. Active session terminated immediately.',
            session: ended,
            timestamp: now,
          }
        }
        return {
          action: 'blocked',
          reason: 'Valid monitoring authorization is required for work scheduling.',
          timestamp: now,
        }
      }

      // 4. Fetch Active Session
      const activeSession = await sessionService.getActiveSession()
      const isWithinHours = this.isWithinWorkingHours(now)

      // ── Scenario A: Time is at or after 6:30 PM (or before 9:30 AM) ──
      if (!isWithinHours) {
        if (activeSession && (activeSession.status === 'working' || activeSession.status === 'on_break')) {
          // Reconcile: End session safely at scheduled end boundary (or current time if earlier/appropriate)
          const sessionStartDate = new Date(activeSession.startedAt)
          const sessionStartDayStr = this.formatDateStr(sessionStartDate)

          // If session was started today, set scheduled end to today's 18:30
          let endTimestamp = now
          if (sessionStartDayStr === todayDateStr) {
            const boundaryEnd = this.getScheduledEndBoundary(now)
            // Use boundaryEnd if current time passed it, otherwise now
            endTimestamp = now.getTime() >= boundaryEnd.getTime() ? boundaryEnd : now
          }

          // Close active break safely if open
          const ended = await sessionService.endWork({
            timestamp: endTimestamp,
            notes: `Scheduled end of day (${this.getFormattedEndTime()})`,
          })

          await this.saveScheduleState({
            lastHeartbeatIso: endTimestamp.toISOString(),
            lastEvaluatedDateStr: todayDateStr,
          })

          return {
            action: 'ended',
            reason: `Automatic end of work session at scheduled boundary (${this.getFormattedEndTime()}).`,
            session: ended,
            timestamp: endTimestamp,
          }
        }

        // Outside hours and no active session
        await this.saveScheduleState({
          lastHeartbeatIso: now.toISOString(),
          lastEvaluatedDateStr: todayDateStr,
        })

        return {
          action: 'none',
          reason: `Outside scheduled working hours (${this.config.startHour}:${String(this.config.startMinute).padStart(2, '0')} - ${this.config.endHour}:${String(this.config.endMinute).padStart(2, '0')}).`,
          timestamp: now,
        }
      }

      // ── Scenario B: Time is within working hours (09:30 - 18:30) ──

      // Case B.1: A session is already active (working or on_break)
      if (activeSession && (activeSession.status === 'working' || activeSession.status === 'on_break')) {
        // Update heartbeat
        await this.saveScheduleState({
          lastHeartbeatIso: now.toISOString(),
          lastEvaluatedDateStr: todayDateStr,
        })
        return {
          action: 'none',
          reason: `Session already in progress (${activeSession.status}).`,
          session: activeSession,
          timestamp: now,
        }
      }

      // Case B.2: No active session. Check if manual stop was recorded for TODAY.
      if (scheduleState.manualStopDateStr === todayDateStr) {
        return {
          action: 'none',
          reason: 'Session was manually stopped by employee today. Automated restart is suppressed.',
          timestamp: now,
        }
      }

      // Case B.3: Check if scheduled session already completed earlier today
      if (scheduleState.scheduledSessionStartedDateStr === todayDateStr) {
        return {
          action: 'none',
          reason: 'Scheduled session was already initiated earlier today.',
          timestamp: now,
        }
      }

      // Case B.4: Eligible for automatic session start!
      // Requirement: "If the app starts after 9:30 AM but before 6:30 PM, start at the actual time
      // the app becomes eligible and record the actual start timestamp. Do not fabricate a 9:30 AM start."
      const started = await sessionService.startWork({
        deviceId: reg.deviceId,
        employeeId: reg.employeeId,
        timestamp: now, // Real actual timestamp!
        notes: `Automated scheduled start (${this.formatTimeStr(now)})`,
      })

      await this.saveScheduleState({
        scheduledSessionStartedDateStr: todayDateStr,
        lastHeartbeatIso: now.toISOString(),
        lastEvaluatedDateStr: todayDateStr,
      })

      return {
        action: 'started',
        reason: `Automated work session started at ${this.formatTimeStr(now)}.`,
        session: started,
        timestamp: now,
      }
    } finally {
      this.isEvaluating = false
    }
  }

  // ─── Background Loop ───────────────────────────────────────

  startBackgroundLoop(intervalMs = 15000): void {
    this.stopBackgroundLoop()
    this.backgroundLoopTimer = this.clock.setInterval(() => {
      this.evaluateSchedule().catch(err => {
        console.warn('[ScheduleService] Periodic schedule evaluation failed:', err)
      })
    }, intervalMs)
  }

  stopBackgroundLoop(): void {
    if (this.backgroundLoopTimer !== null) {
      this.clock.clearInterval(this.backgroundLoopTimer)
      this.backgroundLoopTimer = null
    }
  }

  // ─── Status Inspection ─────────────────────────────────────

  async getScheduleStatus(now?: Date): Promise<ScheduleStatusInfo> {
    const d = now || this.clock.now()
    const todayDateStr = this.formatDateStr(d)
    const isWithinHours = this.isWithinWorkingHours(d)
    const scheduleState = await this.getScheduleState()
    const reg = await deviceService.getRegistrationRecord()
    const onboarding = await this.getOnboardingRecord(reg?.deviceId)
    const preAuth = reg ? await permissionService.getPreAuthorization(reg.deviceId) : null
    const active = await sessionService.getActiveSession()

    const deviceApproved = reg?.status === 'approved'
    const onboardingCompleted = Boolean(onboarding?.agreedToTerms)
    const monitoringAuthorized = preAuth?.status === 'granted'
    const manualStopRecordedForToday = scheduleState.manualStopDateStr === todayDateStr

    let state: ScheduleState = 'outside_hours'
    let statusText = 'Outside Working Hours (09:30 - 18:30)'

    if (!deviceApproved) {
      state = 'unapproved'
      statusText = 'Device Approval Required'
    } else if (!onboardingCompleted) {
      state = 'onboarding_required'
      statusText = 'Policy Onboarding Required'
    } else if (!monitoringAuthorized) {
      state = 'unauthorized'
      statusText = 'Monitoring Authorization Revoked'
    } else if (active) {
      if (active.status === 'working' || active.status === 'active') {
        state = isWithinHours ? 'scheduled_active' : 'manual_active'
        statusText = isWithinHours
          ? '🟢 Monitoring Active: Scheduled Working Hours'
          : '🟢 Monitored: Active Session (Outside Standard Hours)'
      } else if (active.status === 'on_break' || active.status === 'paused') {
        state = 'on_break'
        statusText = '🟡 Session Paused: On Break (Capture Blocked)'
      }
    } else if (manualStopRecordedForToday) {
      state = 'manually_stopped'
      statusText = '🛑 Session Manually Ended for Today'
    } else if (!isWithinHours) {
      const currentMins = d.getHours() * 60 + d.getMinutes()
      const endMins = this.config.endHour * 60 + this.config.endMinute
      if (currentMins >= endMins) {
        state = 'ended_for_day'
        statusText = '⚪ Working Day Completed (18:30 Reached)'
      } else {
        state = 'outside_hours'
        statusText = '⚪ Outside Working Hours (Starts at 09:30)'
      }
    }

    const nextScheduledEvent = isWithinHours
      ? { type: 'end' as const, time: this.getScheduledEndBoundary(d).toISOString() }
      : { type: 'start' as const, time: this.getScheduledStartBoundary(d).toISOString() }

    return {
      state,
      isWithinHours,
      activeSessionId: active?.id,
      nextScheduledEvent,
      manualStopRecordedForToday,
      onboardingCompleted,
      monitoringAuthorized,
      deviceApproved,
      statusText,
    }
  }
}

export const scheduleService = new ScheduleService()
