import type {
  WorkSession,
  WorkSessionState,
  SessionStatus,
  EmployeeBreak,
  BreakReason,
  SerializedWorkSession,
  SerializedEmployeeBreak,
} from '@worktrack-pro/shared'
import {
  calcSessionElapsedDuration,
  calcBreakDuration,
  calcTotalBreakDuration,
  calcWorkDuration,
  calculateSessionDurations,
  parseDate,
} from '@worktrack-pro/shared'
import { deviceService } from './deviceService'
import { getFirebaseInstance, employeeAuthService } from './firebaseAuth'
import { doc, setDoc } from 'firebase/firestore'

const LOCAL_STORAGE_ACTIVE_SESSION = 'worktrack_active_session'
const LOCAL_STORAGE_SESSION_HISTORY = 'worktrack_session_history'

export interface StartWorkOptions {
  deviceId?: string
  employeeId?: string
  timestamp?: Date
  notes?: string
}

export interface StartBreakOptions {
  customReason?: string
  timestamp?: Date
}

export interface TransitionOptions {
  timestamp?: Date
  notes?: string
}

export class SessionService {
  private isProcessing = false
  private cachedActiveSession: WorkSession | null = null

  /**
   * Safe helper to serialize WorkSession with ISO strings for storage.
   */
  private serializeSession(session: WorkSession): SerializedWorkSession {
    return {
      id: session.id,
      employeeId: session.employeeId,
      deviceId: session.deviceId,
      status: session.status,
      startedAt: session.startedAt instanceof Date ? session.startedAt.toISOString() : new Date(session.startedAt).toISOString(),
      endedAt: session.endedAt ? (session.endedAt instanceof Date ? session.endedAt.toISOString() : new Date(session.endedAt).toISOString()) : undefined,
      pausedAt: session.pausedAt ? (session.pausedAt instanceof Date ? session.pausedAt.toISOString() : new Date(session.pausedAt).toISOString()) : undefined,
      durationSeconds: session.durationSeconds,
      workDurationSeconds: session.workDurationSeconds,
      breakDurationSeconds: session.breakDurationSeconds,
      notes: session.notes,
      breaks: session.breaks?.map(b => ({
        id: b.id,
        reason: b.reason,
        customReason: b.customReason,
        startedAt: b.startedAt instanceof Date ? b.startedAt.toISOString() : new Date(b.startedAt).toISOString(),
        endedAt: b.endedAt ? (b.endedAt instanceof Date ? b.endedAt.toISOString() : new Date(b.endedAt).toISOString()) : undefined,
        durationSeconds: b.durationSeconds,
      })),
    }
  }

  /**
   * Safe helper to deserialize storage data into typed WorkSession with Date instances.
   */
  private deserializeSession(data: any): WorkSession | null {
    if (!data || typeof data !== 'object' || !data.id || !data.startedAt) {
      return null
    }

    const startedAt = parseDate(data.startedAt)
    if (!startedAt) return null

    const breaks: EmployeeBreak[] = Array.isArray(data.breaks)
      ? data.breaks.map((b: any) => {
          const bStart = parseDate(b.startedAt) || new Date()
          const bEnd = parseDate(b.endedAt)
          return {
            id: b.id || `brk_${Date.now()}`,
            reason: b.reason || 'other',
            customReason: b.customReason,
            startedAt: bStart,
            endedAt: bEnd,
            durationSeconds: b.durationSeconds ?? (bEnd ? Math.max(0, Math.floor((bEnd.getTime() - bStart.getTime()) / 1000)) : undefined),
          }
        })
      : []

    const session: WorkSession = {
      id: data.id,
      employeeId: data.employeeId || '',
      deviceId: data.deviceId || '',
      status: data.status as SessionStatus,
      startedAt,
      endedAt: parseDate(data.endedAt),
      pausedAt: parseDate(data.pausedAt),
      breaks,
      notes: data.notes,
    }

    const durations = calculateSessionDurations(session)
    session.durationSeconds = durations.elapsedSeconds
    session.workDurationSeconds = durations.workSeconds
    session.breakDurationSeconds = durations.breakSeconds

    return session
  }

  /**
   * Reconciles an active session on retrieval:
   * 1. If started on a previous calendar day (e.g. PC shut down before shift end yesterday),
   *    it is automatically finalized, archived into history, synced to Firestore, and cleared.
   *    Returns null so today (kal) starts clean with a new session.
   * 2. If started today but now is past today's shift end time, it is auto-finalized at shift end.
   * 3. If started today and within working hours (e.g. employee restarted/rebooted PC),
   *    it returns the session so tracking automatically resumes until shift end!
   */
  private async reconcileActiveSession(session: WorkSession): Promise<WorkSession | null> {
    const now = new Date()
    const sessionStart = session.startedAt instanceof Date ? session.startedAt : new Date(session.startedAt)

    const sessionDateStr = `${sessionStart.getFullYear()}-${String(sessionStart.getMonth() + 1).padStart(2, '0')}-${String(sessionStart.getDate()).padStart(2, '0')}`
    const todayDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

    // ── CASE 1: Previous Day Session (PC shut down before shift end yesterday) ──
    if (sessionDateStr !== todayDateStr) {
      console.log(`[SessionService] Found session from previous day (${sessionDateStr}). Auto-submitting to start clean today.`)

      // End timestamp: Previous day's scheduled end boundary (or start + safe duration)
      let endTimestamp = new Date(sessionStart)
      endTimestamp.setHours(18, 30, 0, 0)
      if (typeof localStorage !== 'undefined') {
        try {
          const rawCfg = localStorage.getItem('worktrack_active_schedule_config')
          if (rawCfg) {
            const parsed = JSON.parse(rawCfg)
            if (parsed && typeof parsed.endHour === 'number') {
              endTimestamp.setHours(parsed.endHour, parsed.endMinute || 0, 0, 0)
            }
          }
        } catch {}
      }

      if (endTimestamp.getTime() <= sessionStart.getTime()) {
        endTimestamp = new Date(sessionStart.getTime() + 60 * 1000)
      }

      // Close open breaks
      const updatedBreaks = (session.breaks || []).map(b => {
        if (!b.endedAt) {
          const bStart = b.startedAt instanceof Date ? b.startedAt : new Date(b.startedAt)
          const dur = Math.max(0, Math.floor((endTimestamp.getTime() - bStart.getTime()) / 1000))
          return { ...b, endedAt: endTimestamp, durationSeconds: dur }
        }
        return b
      })

      const finalElapsed = Math.max(0, Math.floor((endTimestamp.getTime() - sessionStart.getTime()) / 1000))
      const finalBreak = updatedBreaks.reduce((acc, b) => acc + (b.durationSeconds ?? 0), 0)
      const finalWork = Math.max(0, finalElapsed - finalBreak)

      const autoEndedSession: WorkSession = {
        ...session,
        status: 'ended',
        endedAt: endTimestamp,
        breaks: updatedBreaks,
        durationSeconds: finalElapsed,
        workDurationSeconds: finalWork,
        breakDurationSeconds: finalBreak,
        notes: (session.notes ? session.notes + ' • ' : '') + 'Auto-submitted: Day completed / System shut down',
      }

      await this.clearActiveSession()
      await this.archiveSession(autoEndedSession)
      this.cachedActiveSession = null
      this.syncSessionToFirestore(autoEndedSession).catch(() => {})
      return null
    }

    // ── CASE 2: Same Day Session, but current time has already passed today's shift end ──
    const boundaryEnd = new Date(now)
    boundaryEnd.setHours(18, 30, 0, 0)
    if (typeof localStorage !== 'undefined') {
      try {
        const rawCfg = localStorage.getItem('worktrack_active_schedule_config')
        if (rawCfg) {
          const parsed = JSON.parse(rawCfg)
          if (parsed && typeof parsed.endHour === 'number') {
            boundaryEnd.setHours(parsed.endHour, parsed.endMinute || 0, 0, 0)
          }
        }
      } catch {}
    }

    if (now.getTime() >= boundaryEnd.getTime()) {
      console.log(`[SessionService] Session started today (${sessionDateStr}) but now past shift end. Auto-ending.`)

      const updatedBreaks = (session.breaks || []).map(b => {
        if (!b.endedAt) {
          const bStart = b.startedAt instanceof Date ? b.startedAt : new Date(b.startedAt)
          const dur = Math.max(0, Math.floor((boundaryEnd.getTime() - bStart.getTime()) / 1000))
          return { ...b, endedAt: boundaryEnd, durationSeconds: dur }
        }
        return b
      })

      const finalElapsed = Math.max(0, Math.floor((boundaryEnd.getTime() - sessionStart.getTime()) / 1000))
      const finalBreak = updatedBreaks.reduce((acc, b) => acc + (b.durationSeconds ?? 0), 0)
      const finalWork = Math.max(0, finalElapsed - finalBreak)

      const autoEndedSession: WorkSession = {
        ...session,
        status: 'ended',
        endedAt: boundaryEnd,
        breaks: updatedBreaks,
        durationSeconds: finalElapsed,
        workDurationSeconds: finalWork,
        breakDurationSeconds: finalBreak,
        notes: (session.notes ? session.notes + ' • ' : '') + `Auto-ended: Shift end time reached (${boundaryEnd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`,
      }

      await this.clearActiveSession()
      await this.archiveSession(autoEndedSession)
      this.cachedActiveSession = null
      this.syncSessionToFirestore(autoEndedSession).catch(() => {})
      return null
    }

    // ── CASE 3: Same Day Session & Within Working Hours! ──
    // Employee restarted / rebooted PC between start time and end time.
    // The session is valid and resumes automatically!
    this.cachedActiveSession = session
    return session
  }

  /**
   * Retrieve active session (working or on_break) from persistence.
   * Returns null if no active session is in progress.
   */
  async getActiveSession(): Promise<WorkSession | null> {
    const api = (window as any).electronAPI

    if (api) {
      try {
        const res = await api.invoke('session:getActive')
        if (res && res.success && res.data) {
          const session = this.deserializeSession(res.data)
          if (session) {
            return await this.reconcileActiveSession(session)
          }
        }
      } catch (err) {
        console.warn('[SessionService] Electron getActive error, falling back to localStorage:', err)
      }
    }

    // Fallback storage
    const raw = localStorage.getItem(LOCAL_STORAGE_ACTIVE_SESSION)
    if (raw) {
      try {
        const parsed = JSON.parse(raw)
        const session = this.deserializeSession(parsed)
        if (session) {
          return await this.reconcileActiveSession(session)
        }
      } catch {
        localStorage.removeItem(LOCAL_STORAGE_ACTIVE_SESSION)
      }
    }

    this.cachedActiveSession = null
    return null
  }

  /**
   * Get current session lifecycle state ('not_started' | 'working' | 'on_break' | 'ended').
   */
  async getSessionState(): Promise<WorkSessionState> {
    const active = await this.getActiveSession()
    if (!active) return 'not_started'
    if (active.status === 'working' || active.status === 'active') return 'working'
    if (active.status === 'on_break' || active.status === 'paused') return 'on_break'
    if (active.status === 'ended') return 'ended'
    return 'not_started'
  }

  /**
   * Start a new work session.
   * - Requires device registration status to be 'approved'.
   * - Valid state transition: not_started -> working.
   * - Prevents duplicate Start Work or concurrent execution.
   */
  async startWork(options?: StartWorkOptions): Promise<WorkSession> {
    if (this.isProcessing) {
      throw new Error('A session operation is currently in progress. Please wait.')
    }

    this.isProcessing = true
    try {
      // 1. Check registration state
      const reg = await deviceService.getRegistrationRecord()
      if (reg.status !== 'approved') {
        throw new Error(
          `Cannot start work session: Device registration status is "${reg.status}". Device must be approved by an administrator before sessions can begin.`
        )
      }

      // 2. Check existing active session
      const existing = await this.getActiveSession()
      if (existing && (existing.status === 'working' || existing.status === 'on_break' || existing.status === 'active' || existing.status === 'paused')) {
        throw new Error('Duplicate Start Work rejected: A work session is already in progress.')
      }

      // 3. Create new session
      const now = options?.timestamp ? new Date(options.timestamp) : new Date()
      const deviceId = options?.deviceId || reg.deviceId
      const employeeId = options?.employeeId || reg.employeeId

      const cryptoObj = window.crypto || (window as any).msCrypto
      const uuid = cryptoObj && cryptoObj.randomUUID
        ? cryptoObj.randomUUID()
        : `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

      const newSession: WorkSession = {
        id: `sess_${uuid}`,
        employeeId,
        deviceId,
        status: 'working',
        startedAt: now,
        breaks: [],
        durationSeconds: 0,
        workDurationSeconds: 0,
        breakDurationSeconds: 0,
        notes: options?.notes,
      }

      await this.saveActiveSession(newSession)
      this.cachedActiveSession = newSession
      this.syncSessionToFirestore(newSession).catch(() => {})
      return newSession
    } finally {
      this.isProcessing = false
    }
  }

  /**
   * Start a break for an active work session.
   * - Valid state transition: working -> on_break.
   * - Requires a valid, non-empty break reason.
   * - Records break start timestamp.
   */
  async startBreak(reason: BreakReason, options?: StartBreakOptions): Promise<WorkSession> {
    if (this.isProcessing) {
      throw new Error('A session operation is currently in progress. Please wait.')
    }

    this.isProcessing = true
    try {
      const trimmedReason = typeof reason === 'string' ? reason.trim() : ''
      if (!trimmedReason) {
        throw new Error('Break requires a valid reason.')
      }

      const session = await this.getActiveSession()
      if (!session) {
        throw new Error('Cannot start break: No active work session found (state: not_started).')
      }

      if (session.status !== 'working' && session.status !== 'active') {
        throw new Error(`Invalid state transition: Cannot take break when session is "${session.status}". Must be "working".`)
      }

      // Check if there is already an open break interval
      const hasOpenBreak = session.breaks?.some(b => !b.endedAt)
      if (hasOpenBreak) {
        throw new Error('Cannot start break: A break interval is already active.')
      }

      const breakStart = options?.timestamp ? new Date(options.timestamp) : new Date()

      const cryptoObj = window.crypto || (window as any).msCrypto
      const brkUuid = cryptoObj && cryptoObj.randomUUID
        ? cryptoObj.randomUUID()
        : `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

      const newBreak: EmployeeBreak = {
        id: `brk_${brkUuid}`,
        reason: trimmedReason as BreakReason,
        customReason: options?.customReason?.trim() || undefined,
        startedAt: breakStart,
      }

      const updatedBreaks = [...(session.breaks || []), newBreak]
      const updatedSession: WorkSession = {
        ...session,
        status: 'on_break',
        pausedAt: breakStart,
        breaks: updatedBreaks,
      }

      const durations = calculateSessionDurations(updatedSession, breakStart)
      updatedSession.durationSeconds = durations.elapsedSeconds
      updatedSession.workDurationSeconds = durations.workSeconds
      updatedSession.breakDurationSeconds = durations.breakSeconds

      await this.saveActiveSession(updatedSession)
      this.cachedActiveSession = updatedSession
      this.syncSessionToFirestore(updatedSession).catch(() => {})
      return updatedSession
    } finally {
      this.isProcessing = false
    }
  }

  /**
   * Resume working from a break.
   * - Valid state transition: on_break -> working.
   * - Records break end timestamp and calculates break duration.
   */
  async resumeWork(options?: TransitionOptions): Promise<WorkSession> {
    if (this.isProcessing) {
      throw new Error('A session operation is currently in progress. Please wait.')
    }

    this.isProcessing = true
    try {
      const session = await this.getActiveSession()
      if (!session) {
        throw new Error('Cannot resume work: No active session found (state: not_started).')
      }

      if (session.status !== 'on_break' && session.status !== 'paused') {
        throw new Error(`Invalid state transition: Cannot resume work when session is "${session.status}". Must be "on_break".`)
      }

      const resumeTime = options?.timestamp ? new Date(options.timestamp) : new Date()

      // Close the open break interval
      let breakClosed = false
      const updatedBreaks = (session.breaks || []).map(b => {
        if (!b.endedAt && !breakClosed) {
          breakClosed = true
          const dur = Math.max(0, Math.floor((resumeTime.getTime() - b.startedAt.getTime()) / 1000))
          return {
            ...b,
            endedAt: resumeTime,
            durationSeconds: dur,
          }
        }
        return b
      })

      const updatedSession: WorkSession = {
        ...session,
        status: 'working',
        pausedAt: undefined,
        breaks: updatedBreaks,
      }

      const durations = calculateSessionDurations(updatedSession, resumeTime)
      updatedSession.durationSeconds = durations.elapsedSeconds
      updatedSession.workDurationSeconds = durations.workSeconds
      updatedSession.breakDurationSeconds = durations.breakSeconds

      await this.saveActiveSession(updatedSession)
      this.cachedActiveSession = updatedSession
      this.syncSessionToFirestore(updatedSession).catch(() => {})
      return updatedSession
    } finally {
      this.isProcessing = false
    }
  }

  /**
   * End the current work session.
   * - Valid state transitions: working -> ended, on_break -> ended.
   * - If ending during a break, closes the open break interval.
   * - Records session end timestamp.
   * - Calculates final work duration and break duration.
   * - Moves completed session to local history and clears active session.
   */
  async endWork(options?: TransitionOptions): Promise<WorkSession> {
    if (this.isProcessing) {
      throw new Error('A session operation is currently in progress. Please wait.')
    }

    this.isProcessing = true
    try {
      const session = await this.getActiveSession()
      if (!session) {
        throw new Error('Cannot end session: No active session found.')
      }

      if (session.status === 'ended') {
        throw new Error('Duplicate End Work rejected: Session has already ended.')
      }

      const endTime = options?.timestamp ? new Date(options.timestamp) : new Date()

      // If session was on break, close open break interval with the end timestamp
      const updatedBreaks = (session.breaks || []).map(b => {
        if (!b.endedAt) {
          const dur = Math.max(0, Math.floor((endTime.getTime() - b.startedAt.getTime()) / 1000))
          return {
            ...b,
            endedAt: endTime,
            durationSeconds: dur,
          }
        }
        return b
      })

      const finalElapsed = Math.max(0, Math.floor((endTime.getTime() - session.startedAt.getTime()) / 1000))
      const finalBreak = updatedBreaks.reduce((acc, b) => acc + (b.durationSeconds ?? 0), 0)
      const finalWork = Math.max(0, finalElapsed - finalBreak)

      const endedSession: WorkSession = {
        ...session,
        status: 'ended',
        endedAt: endTime,
        breaks: updatedBreaks,
        durationSeconds: finalElapsed,
        workDurationSeconds: finalWork,
        breakDurationSeconds: finalBreak,
        notes: options?.notes || session.notes,
      }

      // 1. Remove active session from persistence
      await this.clearActiveSession()

      // 2. Append to completed session history
      await this.archiveSession(endedSession)

      this.cachedActiveSession = null
      this.syncSessionToFirestore(endedSession).catch(() => {})
      return endedSession
    } finally {
      this.isProcessing = false
    }
  }

  /**
   * Retrieve list of completed sessions from local history.
   */
  async getHistory(): Promise<WorkSession[]> {
    const api = (window as any).electronAPI

    if (api) {
      try {
        const res = await api.invoke('session:getHistory')
        if (res && res.success && Array.isArray(res.data)) {
          return res.data
            .map((item: any) => this.deserializeSession(item))
            .filter((s: WorkSession | null): s is WorkSession => s !== null)
        }
      } catch (err) {
        console.warn('[SessionService] Electron getHistory error, falling back:', err)
      }
    }

    const raw = localStorage.getItem(LOCAL_STORAGE_SESSION_HISTORY)
    if (raw) {
      try {
        const arr = JSON.parse(raw)
        if (Array.isArray(arr)) {
          return arr
            .map((item: any) => this.deserializeSession(item))
            .filter((s: WorkSession | null): s is WorkSession => s !== null)
        }
      } catch {
        localStorage.removeItem(LOCAL_STORAGE_SESSION_HISTORY)
      }
    }

    return []
  }

  /**
   * Clear session history (for testing or device reset).
   */
  async clearHistory(): Promise<void> {
    const api = (window as any).electronAPI
    if (api) {
      try {
        await api.invoke('session:saveHistory', [])
      } catch (err) {
        console.warn('[SessionService] Electron clearHistory error:', err)
      }
    }
    localStorage.removeItem(LOCAL_STORAGE_SESSION_HISTORY)
  }

  /**
   * Reset active session and memory cache (useful in tests).
   */
  async resetAll(): Promise<void> {
    await this.clearActiveSession()
    await this.clearHistory()
    this.cachedActiveSession = null
    this.isProcessing = false
  }

  /**
   * Calculate live durations for a session at a specific point in time.
   */
  calculateDurations(session: WorkSession, now: Date = new Date()) {
    return calculateSessionDurations(session, now)
  }

  /**
   * Synchronizes a work session to Cloud Firestore /work_sessions/{id}.
   * Gracefully handles offline mode by succeeding locally.
   */
  async syncSessionToFirestore(session: WorkSession, overrideAuthUid?: string): Promise<boolean> {
    const { db } = getFirebaseInstance()
    const authUid = overrideAuthUid || employeeAuthService.getAuthUid()
    const isOnline = typeof navigator === 'undefined' || navigator.onLine !== false

    if (!db || !authUid || !isOnline) {
      return false
    }

    try {
      const firestoreStatus =
        session.status === 'ended' ? 'completed' :
        session.status === 'on_break' ? 'paused' :
        'working'

      const sessionDocRef = doc(db, 'work_sessions', session.id)
      const nowIso = new Date().toISOString()

      const payload: any = {
        id: session.id,
        sessionId: session.id,
        userId: authUid,
        employeeId: session.employeeId,
        deviceId: session.deviceId,
        status: firestoreStatus,
        startedAt: session.startedAt instanceof Date ? session.startedAt.toISOString() : new Date(session.startedAt).toISOString(),
        durationSeconds: session.durationSeconds || 0,
        workDurationSeconds: session.workDurationSeconds || 0,
        breakDurationSeconds: session.breakDurationSeconds || 0,
        breaks: (session.breaks || []).map(b => ({
          id: b.id,
          reason: b.reason,
          customReason: b.customReason || null,
          startedAt: b.startedAt instanceof Date ? b.startedAt.toISOString() : new Date(b.startedAt).toISOString(),
          endedAt: b.endedAt ? (b.endedAt instanceof Date ? b.endedAt.toISOString() : new Date(b.endedAt).toISOString()) : null,
          durationSeconds: b.durationSeconds || 0,
        })),
        notes: session.notes || null,
      }

      if (session.endedAt) {
        payload.endedAt = session.endedAt instanceof Date ? session.endedAt.toISOString() : new Date(session.endedAt).toISOString()
      } else if (firestoreStatus === 'completed') {
        payload.endedAt = nowIso
      }

      if (session.pausedAt) {
        payload.pausedAt = session.pausedAt instanceof Date ? session.pausedAt.toISOString() : new Date(session.pausedAt).toISOString()
      }

      await setDoc(sessionDocRef, payload, { merge: true })
      return true
    } catch (err) {
      console.error('[SessionService] Could not sync session to Firestore:', err)
      return false
    }
  }

  // ─── Internal Persistence Helpers ──────────────────────────

  private async saveActiveSession(session: WorkSession): Promise<void> {
    const serialized = this.serializeSession(session)
    const api = (window as any).electronAPI

    if (api) {
      try {
        await api.invoke('session:saveActive', serialized)
        return
      } catch (err) {
        console.warn('[SessionService] Electron saveActive error, falling back:', err)
      }
    }

    localStorage.setItem(LOCAL_STORAGE_ACTIVE_SESSION, JSON.stringify(serialized))
  }

  private async clearActiveSession(): Promise<void> {
    const api = (window as any).electronAPI

    if (api) {
      try {
        await api.invoke('session:clearActive')
      } catch (err) {
        console.warn('[SessionService] Electron clearActive error, falling back:', err)
      }
    }

    localStorage.removeItem(LOCAL_STORAGE_ACTIVE_SESSION)
    this.cachedActiveSession = null
  }

  private async archiveSession(session: WorkSession): Promise<void> {
    const history = await this.getHistory()
    const serializedHistory = [
      this.serializeSession(session),
      ...history.map(s => this.serializeSession(s)),
    ]

    const api = (window as any).electronAPI
    if (api) {
      try {
        await api.invoke('session:saveHistory', serializedHistory)
        return
      } catch (err) {
        console.warn('[SessionService] Electron archiveSession error, falling back:', err)
      }
    }

    localStorage.setItem(LOCAL_STORAGE_SESSION_HISTORY, JSON.stringify(serializedHistory))
  }
}

export const sessionService = new SessionService()
