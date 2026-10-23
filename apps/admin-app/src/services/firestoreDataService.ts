import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  Timestamp,
  Firestore,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { ref, getDownloadURL, deleteObject } from 'firebase/storage'
import { getFirebaseInstance } from './firebaseAuth'
import type {
  Employee,
  EmployeeRole,
  Device,
  DeviceRegistrationRecord,
  WorkSession,
  Screenshot,
  ScreenshotFilters,
  MonitoringSettings,
  ApprovalRequest,
  ProvisionEmployeePayload,
  ProvisionEmployeeResult,
  ResetEmployeePasswordPayload,
  ResetEmployeePasswordResult,
  UserAccount,
  DeviceStatus,
  DailySummary,
  AppUsage,
  WebUsage,
  ActivityMetric,
} from '@worktrack-pro/shared'
import { derivePresenceStatus } from '@worktrack-pro/shared'

// ─── Helper to parse Firestore dates safely ───────────────────
function toDate(val: any): Date {
  if (!val) return new Date()
  if (val instanceof Date) return isNaN(val.getTime()) ? new Date() : val
  if (typeof val.toDate === 'function') {
    try {
      const d = val.toDate()
      if (d instanceof Date && !isNaN(d.getTime())) return d
    } catch {}
  }
  if (typeof val === 'object' && typeof val?.seconds === 'number') {
    const ms = val.seconds * 1000 + (val.nanoseconds ? Math.floor(val.nanoseconds / 1e6) : 0)
    const d = new Date(ms)
    if (!isNaN(d.getTime())) return d
  }
  if (typeof val === 'string' || typeof val === 'number') {
    const d = new Date(val)
    if (!isNaN(d.getTime())) return d
  }
  return new Date()
}

export interface FormattedCallableError extends Error {
  code?: string
  rawMessage?: string
}

export function formatCallableError(err: any, fallbackMessage: string): FormattedCallableError {
  const rawCode = err?.code || (err?.name === 'FirebaseError' ? 'functions/unknown' : undefined)
  let rawMessage = typeof err?.message === 'string' ? err.message : ''
  const correlationId = err?.details?.correlationId || err?.customData?.correlationId

  // Never expose passwords, tokens, auth headers, or raw stack traces to the user
  let sanitized = rawMessage
    .replace(/(password|secret|key|token)["':=\s]+([^\s,;]+)/gi, '$1: [REDACTED]')
    .replace(/bearer\s+[a-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .trim()

  let prefix = rawCode ? `[${rawCode}] ` : ''
  let finalMessage = sanitized || fallbackMessage

  // If the error message is just "internal" or code is functions/internal
  if (rawCode === 'functions/internal' || sanitized.toLowerCase() === 'internal') {
    finalMessage = 'The server encountered an internal error while processing the request. Please verify backend permissions or try again later.'
  } else if (rawCode === 'functions/unauthenticated') {
    finalMessage = 'Authentication required. Your administrative session may have expired; please re-login.'
  } else if (rawCode === 'functions/permission-denied') {
    finalMessage = sanitized || 'Access denied: Only active administrators have permission to perform this operation.'
  } else if (rawCode === 'functions/unavailable') {
    finalMessage = 'The provisioning service is temporarily unavailable. Please verify network connectivity.'
  }

  if (correlationId) {
    finalMessage += ` (Ref: ${correlationId})`
  }

  // Avoid duplicate bracketed prefix if message already starts with it
  if (rawCode && finalMessage.startsWith(`[${rawCode}]`)) {
    prefix = ''
  }

  const formatted: FormattedCallableError = new Error(`${prefix}${finalMessage}`)
  formatted.code = rawCode
  formatted.rawMessage = sanitized
  return formatted
}

export class FirestoreDataService {
  private urlCache = new Map<string, string>()

  private getDb(): Firestore {
    const { db } = getFirebaseInstance()
    if (!db) {
      throw new Error('Firestore is not initialized. Verify .env Firebase configuration.')
    }
    return db
  }

  private mapScreenshotDoc(d: any): Screenshot {
    const data = d.data()
    return {
      id: data.id || data.screenshotId || d.id,
      sessionId: data.sessionId || '',
      employeeId: data.employeeId || '',
      employeeName: data.employeeName || '',
      userId: data.userId || '',
      deviceId: data.deviceId || '',
      takenAt: toDate(data.takenAt),
      createdAt: toDate(data.createdAt || data.takenAt),
      imageUrl: data.imageUrl || data.downloadUrl || '',
      storagePath: data.storagePath || '',
      thumbnailUrl: data.thumbnailUrl,
      fileSizeBytes: Number(data.fileSizeBytes || 0),
      width: Number(data.width || 1920),
      height: Number(data.height || 1080),
      format: data.format || 'jpg',
      status: data.status || 'uploaded',
    }
  }

  // ─── 1. Employees Collection (/employees) ────────────────────
  async getEmployees(): Promise<Employee[]> {
    const db = this.getDb()
    const colRef = collection(db, 'employees')
    const snap = await getDocs(colRef)
    
    return snap.docs.map(d => {
      const data = d.data()
      return {
        id: data.employeeId || d.id,
        name: data.name || 'Unnamed Employee',
        email: data.email || '',
        role: (data.role as EmployeeRole) || 'employee',
        department: data.department || 'General',
        avatarUrl: data.avatarUrl || undefined,
        createdAt: toDate(data.createdAt),
        updatedAt: toDate(data.updatedAt),
        userId: data.userId || undefined,
        status: data.status || 'active',
      }
    })
  }

  async getEmployee(id: string): Promise<Employee | null> {
    const db = this.getDb()
    const docRef = doc(db, 'employees', id)
    const snap = await getDoc(docRef)
    if (!snap.exists()) return null

    const data = snap.data()
    return {
      id: data.employeeId || snap.id,
      name: data.name || '',
      email: data.email || '',
      role: (data.role as EmployeeRole) || 'employee',
      department: data.department || 'General',
      avatarUrl: data.avatarUrl || undefined,
      createdAt: toDate(data.createdAt),
      updatedAt: toDate(data.updatedAt),
      userId: data.userId || undefined,
    }
  }

  async createEmployee(data: {
    id: string
    name: string
    email: string
    role?: EmployeeRole
    department?: string
  }): Promise<Employee> {
    const db = this.getDb()
    const now = new Date()
    const newEmp: Employee = {
      id: data.id.trim(),
      name: data.name.trim(),
      email: data.email.trim(),
      role: data.role || 'employee',
      department: data.department || 'General',
      createdAt: now,
      updatedAt: now,
    }

    const docRef = doc(db, 'employees', newEmp.id)
    await setDoc(docRef, {
      employeeId: newEmp.id,
      name: newEmp.name,
      email: newEmp.email,
      role: newEmp.role,
      department: newEmp.department,
      status: 'active',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    })

    return newEmp
  }

  async provisionEmployee(payload: ProvisionEmployeePayload): Promise<ProvisionEmployeeResult> {
    const { functions } = getFirebaseInstance()
    if (!functions) {
      throw new Error('Firebase Functions service is not initialized. Please check your configuration.')
    }

    try {
      const callable = httpsCallable<ProvisionEmployeePayload, ProvisionEmployeeResult>(
        functions,
        'provisionEmployeeAccount'
      )
      const res = await callable(payload)
      return res.data
    } catch (err: any) {
      console.error('[FirestoreDataService] Provisioning error:', err)
      throw formatCallableError(err, 'Failed to provision employee account.')
    }
  }

  async resetEmployeePassword(payload: ResetEmployeePasswordPayload): Promise<ResetEmployeePasswordResult> {
    const { functions } = getFirebaseInstance()
    if (!functions) {
      throw new Error('Firebase Functions service is not initialized. Please check your configuration.')
    }

    try {
      const callable = httpsCallable<ResetEmployeePasswordPayload, ResetEmployeePasswordResult>(
        functions,
        'resetEmployeePassword'
      )
      const res = await callable(payload)
      return res.data
    } catch (err: any) {
      console.error('[FirestoreDataService] Password reset error:', err)
      throw formatCallableError(err, 'Failed to reset employee password.')
    }
  }

  async updateEmployee(
    id: string,
    updates: Partial<Pick<Employee, 'name' | 'email' | 'role' | 'department'>>
  ): Promise<Employee | null> {
    const db = this.getDb()
    const docRef = doc(db, 'employees', id)
    const snap = await getDoc(docRef)
    if (!snap.exists()) return null

    const now = new Date()
    await updateDoc(docRef, {
      ...updates,
      updatedAt: now.toISOString(),
    })

    return this.getEmployee(id)
  }

  // ─── 2. Devices Collection (/devices) ────────────────────────
  async getDevices(): Promise<Device[]> {
    const db = this.getDb()
    const snap = await getDocs(collection(db, 'devices'))

    return snap.docs.map(d => {
      const data = d.data()
      const lastHb = data.lastHeartbeat ? toDate(data.lastHeartbeat) : (data.lastSeen ? toDate(data.lastSeen) : undefined)
      const isOnline = data.approvalStatus === 'approved' && data.status !== 'offline' && derivePresenceStatus(lastHb) === 'online'
      return {
        id: data.deviceId || d.id,
        employeeId: data.employeeId || '',
        name: data.hostname || data.deviceName || 'Device',
        hostname: data.hostname || data.deviceName || 'Device',
        os: (data.platform || 'windows') as any,
        osVersion: data.osVersion || 'Windows',
        appVersion: data.agentVersion || data.appVersion || '1.0.0',
        status: (isOnline ? 'online' : 'offline') as DeviceStatus,
        approvalStatus: data.approvalStatus || 'pending_approval',
        lastSeen: toDate(data.lastSeen || data.lastHeartbeat || data.registeredAt),
        lastHeartbeat: lastHb,
        registeredAt: toDate(data.registeredAt || data.lastSeen),
        ipAddress: data.ipAddress || '127.0.0.1',
      }
    })
  }

  async getDeviceRegistrations(): Promise<DeviceRegistrationRecord[]> {
    const db = this.getDb()
    const snap = await getDocs(collection(db, 'devices'))

    return snap.docs.map(d => {
      const data = d.data()
      return {
        deviceId: data.deviceId || d.id,
        deviceName: data.deviceName || data.hostname || 'Device',
        hostname: data.hostname || '',
        employeeId: data.employeeId || '',
        employeeName: data.employeeName || '',
        department: data.department || '',
        status: data.approvalStatus || 'pending_approval',
        requestedAt: toDate(data.registeredAt || data.requestedAt),
        reviewedAt: data.reviewedAt ? toDate(data.reviewedAt) : undefined,
        reviewedBy: data.reviewedBy,
        rejectionReason: data.rejectionReason,
      }
    })
  }

  async approveDeviceRegistration(deviceId: string, reviewedBy: string): Promise<DeviceRegistrationRecord | null> {
    const db = this.getDb()
    const docRef = doc(db, 'devices', deviceId)
    const snap = await getDoc(docRef)
    if (!snap.exists()) return null

    const now = new Date().toISOString()
    await updateDoc(docRef, {
      approvalStatus: 'approved',
      status: 'offline',
      reviewedAt: now,
      reviewedBy,
    })

    // Audit log in device_approvals
    await setDoc(doc(db, 'device_approvals', `appr_${deviceId}_${Date.now()}`), {
      deviceId,
      action: 'approved',
      reviewedBy,
      timestamp: now,
    })

    const updated = await getDoc(docRef)
    const data = updated.data()!
    return {
      deviceId: data.deviceId || updated.id,
      deviceName: data.deviceName || data.hostname || 'Device',
      hostname: data.hostname || '',
      employeeId: data.employeeId || '',
      employeeName: data.employeeName || '',
      department: data.department || '',
      status: 'approved',
      requestedAt: toDate(data.registeredAt),
      reviewedAt: toDate(now),
      reviewedBy,
    }
  }

  async rejectDeviceRegistration(deviceId: string, reason: string, reviewedBy: string): Promise<DeviceRegistrationRecord | null> {
    const db = this.getDb()
    const docRef = doc(db, 'devices', deviceId)
    const snap = await getDoc(docRef)
    if (!snap.exists()) return null

    const now = new Date().toISOString()
    await updateDoc(docRef, {
      approvalStatus: 'rejected',
      status: 'offline',
      reviewedAt: now,
      reviewedBy,
      rejectionReason: reason,
    })

    // Audit log in device_approvals
    await setDoc(doc(db, 'device_approvals', `appr_${deviceId}_${Date.now()}`), {
      deviceId,
      action: 'rejected',
      reason,
      reviewedBy,
      timestamp: now,
    })

    const updated = await getDoc(docRef)
    const data = updated.data()!
    return {
      deviceId: data.deviceId || updated.id,
      deviceName: data.deviceName || data.hostname || 'Device',
      hostname: data.hostname || '',
      employeeId: data.employeeId || '',
      employeeName: data.employeeName || '',
      department: data.department || '',
      status: 'rejected',
      requestedAt: toDate(data.registeredAt || data.requestedAt),
      reviewedAt: toDate(now),
      reviewedBy,
      rejectionReason: reason,
    }
  }

  // ─── 3. Work Sessions Collection (/work_sessions) ─────────────
  async getSessions(): Promise<WorkSession[]> {
    const db = this.getDb()
    try {
      const snap = await getDocs(collection(db, 'work_sessions'))
      const sessions = snap.docs.map(d => {
        const data = d.data()
        return {
          id: data.id || data.sessionId || d.id,
          employeeId: data.employeeId || '',
          deviceId: data.deviceId || '',
          status: data.status || 'completed',
          startedAt: toDate(data.startedAt || data.startTime),
          endedAt: data.endedAt ? toDate(data.endedAt) : undefined,
          pausedAt: data.pausedAt ? toDate(data.pausedAt) : undefined,
          durationSeconds: Number(data.durationSeconds || 0),
          workDurationSeconds: Number(data.workDurationSeconds || data.activeSeconds || 0),
          breakDurationSeconds: Number(data.breakDurationSeconds || data.idleSeconds || 0),
          breaks: data.breaks || [],
          notes: data.notes,
        }
      })
      sessions.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      return sessions
    } catch (e) {
      console.warn('[FirestoreDataService] Could not read work_sessions:', e)
      return []
    }
  }

  async getActiveSessions(): Promise<WorkSession[]> {
    const all = await this.getSessions()
    const todayStr = new Date().toDateString()
    return all.filter(s => {
      if (s.status !== 'working' && s.status !== 'on_break' && s.status !== 'active' && s.status !== 'paused') {
        return false
      }
      if (s.endedAt) return false
      const sDate = s.startedAt instanceof Date ? s.startedAt : new Date(s.startedAt)
      return sDate.toDateString() === todayStr
    })
  }

  // ─── 4. Screenshots Collection (/screenshots) ─────────────────
  async getScreenshots(filters?: ScreenshotFilters): Promise<Screenshot[]> {
    const db = this.getDb()
    try {
      const snap = await getDocs(collection(db, 'screenshots'))
      let list = snap.docs.map(d => this.mapScreenshotDoc(d))
      if (filters?.employeeId) {
        list = list.filter(s => s.employeeId === filters.employeeId)
      }
      if (filters?.dateStr) {
        list = list.filter(s => {
          const sDate = s.takenAt.toISOString().split('T')[0]
          return sDate === filters.dateStr
        })
      }
      if (filters?.sessionId) {
        list = list.filter(s => s.sessionId === filters.sessionId)
      }
      list.sort((a, b) => b.takenAt.getTime() - a.takenAt.getTime())
      if (filters?.limit && filters.limit > 0) {
        list = list.slice(0, filters.limit)
      }
      return list
    } catch (e) {
      console.warn('[FirestoreDataService] Could not read screenshots:', e)
      return []
    }
  }

  subscribeToScreenshots(callback: (screenshots: Screenshot[]) => void, filters?: ScreenshotFilters): () => void {
    const db = this.getDb()
    return onSnapshot(
      collection(db, 'screenshots'),
      snap => {
        let list = snap.docs.map(d => this.mapScreenshotDoc(d))
        if (filters?.employeeId) {
          list = list.filter(s => s.employeeId === filters.employeeId)
        }
        if (filters?.dateStr) {
          list = list.filter(s => {
            const sDate = s.takenAt.toISOString().split('T')[0]
            return sDate === filters.dateStr
          })
        }
        if (filters?.sessionId) {
          list = list.filter(s => s.sessionId === filters.sessionId)
        }
        list.sort((a, b) => b.takenAt.getTime() - a.takenAt.getTime())
        if (filters?.limit && filters.limit > 0) {
          list = list.slice(0, filters.limit)
        }
        callback(list)
      },
      err => {
        console.warn('[FirestoreDataService] Error in screenshots subscription:', err)
      }
    )
  }

  async getScreenshotImageUrl(screenshot: Screenshot): Promise<string> {
    if (screenshot.imageUrl && (screenshot.imageUrl.startsWith('http') || screenshot.imageUrl.startsWith('data:'))) {
      return screenshot.imageUrl
    }

    if (screenshot.storagePath) {
      if (this.urlCache.has(screenshot.storagePath)) {
        return this.urlCache.get(screenshot.storagePath)!
      }

      const { storage, auth } = getFirebaseInstance()
      if (storage) {
        try {
          const storageRef = ref(storage, screenshot.storagePath)
          const url = await getDownloadURL(storageRef)
          this.urlCache.set(screenshot.storagePath, url)
          return url
        } catch (err) {
          console.warn('[FirestoreDataService] Failed to resolve storage download URL via SDK:', err)
        }
      }

      // Robust fallback: resolve via Firebase Storage REST API using ID token if available
      try {
        const idToken = auth?.currentUser ? await auth.currentUser.getIdToken() : null
        if (idToken) {
          const { getFirebaseConfig } = await import('./firebaseAuth')
          const bucket = getFirebaseConfig().storageBucket
          const encodedPath = encodeURIComponent(screenshot.storagePath)
          const res = await fetch(`https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}`, {
            headers: { Authorization: `Bearer ${idToken}` },
          })
          if (res.ok) {
            const data = await res.json()
            if (data.downloadTokens) {
              const token = data.downloadTokens.split(',')[0]
              const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}?alt=media&token=${token}`
              this.urlCache.set(screenshot.storagePath, publicUrl)
              return publicUrl
            }
          }
        }
      } catch (restErr) {
        console.warn('[FirestoreDataService] REST API resolution error:', restErr)
      }
    }

    return screenshot.imageUrl || ''
  }

  async deleteScreenshot(screenshotId: string, storagePath?: string): Promise<boolean> {
    const db = this.getDb()
    const { storage } = getFirebaseInstance()

    try {
      await deleteDoc(doc(db, 'screenshots', screenshotId))

      if (storage && storagePath) {
        try {
          const storageRef = ref(storage, storagePath)
          await deleteObject(storageRef)
          this.urlCache.delete(storagePath)
        } catch (storageErr) {
          console.warn('[FirestoreDataService] Storage deletion warning:', storageErr)
        }
      }
      return true
    } catch (err) {
      console.error('[FirestoreDataService] Failed to delete screenshot:', err)
      throw err
    }
  }

  // ─── 5. Approvals Collection (/device_approvals) ──────────────
  async getApprovalRequests(): Promise<ApprovalRequest[]> {
    const db = this.getDb()
    try {
      const snap = await getDocs(collection(db, 'device_approvals'))
      return snap.docs.map(d => {
        const data = d.data()
        return {
          id: d.id,
          employeeId: data.employeeId || 'unknown',
          employeeName: data.employeeName || 'Unknown',
          department: data.department || 'General',
          type: data.type || 'access',
          title: data.title || `Approval for ${data.deviceId || 'Device'}`,
          description: data.description || '',
          requestedAt: toDate(data.timestamp || data.requestedAt),
          status: data.status || 'pending',
          urgency: data.urgency || 'medium',
        }
      })
    } catch (e) {
      console.warn('[FirestoreDataService] Could not read device_approvals:', e)
      return []
    }
  }

  // ─── Real-Time Subscriptions ─────────────────────────────────
  subscribeToEmployees(
    callback: (employees: Employee[]) => void,
    onError?: (err: Error) => void
  ): () => void {
    const db = this.getDb()
    return onSnapshot(
      collection(db, 'employees'),
      snap => {
        const emps: Employee[] = snap.docs.map(d => {
          const data = d.data()
          return {
            id: data.employeeId || d.id,
            name: data.name || 'Unnamed Employee',
            email: data.email || '',
            role: (data.role as EmployeeRole) || 'employee',
            department: data.department || 'General',
            avatarUrl: data.avatarUrl || undefined,
            createdAt: toDate(data.createdAt),
            updatedAt: toDate(data.updatedAt),
            userId: data.userId || undefined,
            status: data.status || 'active',
          }
        })
        callback(emps)
      },
      err => {
        console.error('[FirestoreDataService] Error in employee subscription:', err)
        if (onError) onError(err)
      }
    )
  }

  subscribeToUsers(
    callback: (users: UserAccount[]) => void,
    onError?: (err: Error) => void
  ): () => void {
    const db = this.getDb()
    return onSnapshot(
      collection(db, 'users'),
      snap => {
        const users: UserAccount[] = snap.docs.map(d => {
          const data = d.data()
          return {
            uid: data.uid || d.id,
            email: data.email || '',
            contactEmail: data.contactEmail,
            displayName: data.displayName || 'Employee',
            role: (data.role as EmployeeRole) || 'employee',
            employeeId: data.employeeId,
            status: data.status || 'active',
            createdAt: data.createdAt || new Date().toISOString(),
            lastLoginAt: data.lastLoginAt,
          }
        })
        callback(users)
      },
      err => {
        console.error('[FirestoreDataService] Error in user subscription:', err)
        if (onError) onError(err)
      }
    )
  }

  subscribeToDevices(
    callback: (devices: Device[]) => void,
    onError?: (err: Error) => void
  ): () => void {
    const db = this.getDb()
    return onSnapshot(
      collection(db, 'devices'),
      snap => {
        const devs: Device[] = snap.docs.map(d => {
          const data = d.data()
          const lastHb = data.lastHeartbeat ? toDate(data.lastHeartbeat) : (data.lastSeen ? toDate(data.lastSeen) : undefined)
          const isOnline = data.approvalStatus === 'approved' && data.status !== 'offline' && derivePresenceStatus(lastHb) === 'online'
          return {
            id: data.deviceId || d.id,
            employeeId: data.employeeId || '',
            name: data.hostname || data.deviceName || 'Device',
            hostname: data.hostname || data.deviceName || 'Device',
            os: (data.platform || 'windows') as any,
            osVersion: data.osVersion || 'Windows',
            appVersion: data.agentVersion || data.appVersion || '1.0.0',
            status: (isOnline ? 'online' : 'offline') as DeviceStatus,
            approvalStatus: data.approvalStatus || 'pending_approval',
            lastSeen: toDate(data.lastSeen || data.lastHeartbeat || data.registeredAt),
            lastHeartbeat: lastHb,
            registeredAt: toDate(data.registeredAt || data.lastSeen),
            ipAddress: data.ipAddress || '127.0.0.1',
          }
        })
        callback(devs)
      },
      err => {
        console.error('[FirestoreDataService] Error in device subscription:', err)
        if (onError) onError(err)
      }
    )
  }

  subscribeToDeviceRegistrations(
    callback: (registrations: DeviceRegistrationRecord[]) => void,
    onError?: (err: Error) => void
  ): () => void {
    const db = this.getDb()
    return onSnapshot(
      collection(db, 'devices'),
      snap => {
        const records: DeviceRegistrationRecord[] = snap.docs.map(d => {
          const data = d.data()
          return {
            deviceId: data.deviceId || d.id,
            deviceName: data.deviceName || data.hostname || 'Device',
            hostname: data.hostname || '',
            employeeId: data.employeeId || '',
            employeeName: data.employeeName || '',
            department: data.department || '',
            status: data.approvalStatus || 'pending_approval',
            requestedAt: toDate(data.registeredAt || data.requestedAt),
            reviewedAt: data.reviewedAt ? toDate(data.reviewedAt) : undefined,
            reviewedBy: data.reviewedBy,
            rejectionReason: data.rejectionReason,
          }
        })
        callback(records)
      },
      err => {
        console.error('[FirestoreDataService] Error in device registrations subscription:', err)
        if (onError) onError(err)
      }
    )
  }

  subscribeToSessions(
    callback: (sessions: WorkSession[]) => void,
    onError?: (err: Error) => void
  ): () => void {
    const db = this.getDb()
    return onSnapshot(
      collection(db, 'work_sessions'),
      snap => {
        const sessions: WorkSession[] = snap.docs.map(d => {
          const data = d.data()
          return {
            id: data.id || data.sessionId || d.id,
            employeeId: data.employeeId || '',
            deviceId: data.deviceId || '',
            status: data.status || 'completed',
            startedAt: toDate(data.startedAt || data.startTime),
            endedAt: data.endedAt ? toDate(data.endedAt) : undefined,
            pausedAt: data.pausedAt ? toDate(data.pausedAt) : undefined,
            durationSeconds: Number(data.durationSeconds || 0),
            workDurationSeconds: Number(data.workDurationSeconds || data.activeSeconds || 0),
            breakDurationSeconds: Number(data.breakDurationSeconds || data.idleSeconds || 0),
            breaks: data.breaks || [],
            notes: data.notes,
          }
        })
        sessions.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
        callback(sessions)
      },
      err => {
        console.error('[FirestoreDataService] Error in session subscription:', err)
        if (onError) onError(err)
      }
    )
  }

  // ─── 8. Settings Collection (/settings/global) ───────────────
  async getSettings(): Promise<MonitoringSettings> {
    const db = this.getDb()
    try {
      const snap = await getDoc(doc(db, 'settings', 'global'))
      if (snap.exists()) {
        const data = snap.data()
        return {
          id: snap.id,
          screenshotIntervalSeconds: Number(data.screenshotIntervalSeconds ?? 120),
          screenshotQuality: (data.screenshotQuality || 'medium') as any,
          dataRetentionDays: Number(data.dataRetentionDays ?? 30),
          schedule: data.schedule || {
            enabledDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
            startTime: '09:00',
            endTime: '18:00',
            timezone: 'Asia/Kolkata',
          },
          enableLiveScreenView: data.enableLiveScreenView ?? true,
          requireEmployeeApprovalForLiveView: true,
          updatedAt: toDate(data.updatedAt),
          updatedBy: data.updatedBy || 'admin',
        }
      }
    } catch (e) {
      console.warn('[FirestoreDataService] Could not read settings, using default:', e)
    }

    return {
      id: 'global',
      screenshotIntervalSeconds: 120,
      screenshotQuality: 'medium',
      dataRetentionDays: 30,
      schedule: {
        enabledDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
        startTime: '09:00',
        endTime: '18:00',
        timezone: 'Asia/Kolkata',
      },
      enableLiveScreenView: true,
      requireEmployeeApprovalForLiveView: true,
      updatedAt: new Date(),
      updatedBy: 'system',
    }
  }

  async updateSettings(settings: Partial<MonitoringSettings>, updatedBy = 'Admin User'): Promise<MonitoringSettings> {
    const db = this.getDb()
    const docRef = doc(db, 'settings', 'global')
    const now = new Date().toISOString()
    const payload: any = {
      ...settings,
      requireEmployeeApprovalForLiveView: true,
      updatedAt: now,
      updatedBy,
    }
    await setDoc(docRef, payload, { merge: true })
    return this.getSettings()
  }

  // ─── 9. Analytics & Summaries derived from real Firestore records ───
  async getDailySummaries(employeeId?: string): Promise<DailySummary[]> {
    const db = this.getDb()
    try {
      const [sessionsSnap, screenshotsSnap] = await Promise.all([
        getDocs(collection(db, 'work_sessions')),
        getDocs(collection(db, 'screenshots')),
      ])

      const sessions = sessionsSnap.docs.map(d => {
        const data = d.data()
        return {
          id: d.id,
          employeeId: data.employeeId || '',
          startedAt: toDate(data.startedAt || data.startTime),
          endedAt: data.endedAt ? toDate(data.endedAt) : undefined,
          durationSeconds: Number(data.durationSeconds || data.workDurationSeconds || 0),
          workDurationSeconds: Number(data.workDurationSeconds || data.activeSeconds || 0),
          breakDurationSeconds: Number(data.breakDurationSeconds || data.idleSeconds || 0),
        }
      })

      const screenshots = screenshotsSnap.docs.map(d => {
        const data = d.data()
        return {
          employeeId: data.employeeId || '',
          takenAt: toDate(data.takenAt),
        }
      })

      const summaryMap = new Map<string, {
        date: string
        employeeId: string
        totalSessionSeconds: number
        activeSeconds: number
        idleSeconds: number
        sessionCount: number
        screenshotCount: number
        deviceIds: string[]
      }>()

      for (const s of sessions) {
        if (employeeId && s.employeeId !== employeeId) continue
        const dateStr = s.startedAt.toISOString().split('T')[0]
        const key = `${dateStr}_${s.employeeId}`

        let dur = s.durationSeconds
        if (!dur && s.endedAt) {
          dur = Math.max(0, Math.floor((s.endedAt.getTime() - s.startedAt.getTime()) / 1000))
        }

        const existing = summaryMap.get(key) || {
          date: dateStr,
          employeeId: s.employeeId,
          totalSessionSeconds: 0,
          activeSeconds: 0,
          idleSeconds: 0,
          sessionCount: 0,
          screenshotCount: 0,
          deviceIds: [],
        }

        existing.totalSessionSeconds += dur
        existing.activeSeconds += s.workDurationSeconds || dur
        existing.idleSeconds += s.breakDurationSeconds || 0
        existing.sessionCount += 1
        summaryMap.set(key, existing)
      }

      for (const scr of screenshots) {
        if (employeeId && scr.employeeId !== employeeId) continue
        const dateStr = scr.takenAt.toISOString().split('T')[0]
        const key = `${dateStr}_${scr.employeeId}`
        const existing = summaryMap.get(key)
        if (existing) {
          existing.screenshotCount += 1
        } else {
          summaryMap.set(key, {
            date: dateStr,
            employeeId: scr.employeeId,
            totalSessionSeconds: 0,
            activeSeconds: 0,
            idleSeconds: 0,
            sessionCount: 0,
            screenshotCount: 1,
            deviceIds: [],
          })
        }
      }

      const list: DailySummary[] = Array.from(summaryMap.values()).map((s, idx) => ({
        id: `summary_${s.date}_${s.employeeId}_${idx}`,
        ...s,
      }))

      list.sort((a, b) => b.date.localeCompare(a.date))
      return list
    } catch (err) {
      console.warn('[FirestoreDataService] Error computing daily summaries:', err)
      return []
    }
  }

  async getAppUsages(employeeId?: string): Promise<AppUsage[]> {
    const db = this.getDb()
    try {
      const snap = await getDocs(collection(db, 'app_usages'))
      let list: AppUsage[] = snap.docs.map(d => {
        const data = d.data()
        return {
          id: d.id,
          employeeId: data.employeeId || '',
          appName: data.appName || 'Application',
          windowTitle: data.windowTitle || '',
          durationSeconds: Number(data.durationSeconds || 0),
          category: data.category || 'productive',
          productivityScore: Number(data.productivityScore || 90),
        }
      })
      if (employeeId) {
        list = list.filter(a => a.employeeId === employeeId)
      }
      return list
    } catch {
      return []
    }
  }

  async getWebUsages(employeeId?: string): Promise<WebUsage[]> {
    const db = this.getDb()
    try {
      const snap = await getDocs(collection(db, 'web_usages'))
      let list: WebUsage[] = snap.docs.map(d => {
        const data = d.data()
        return {
          id: d.id,
          employeeId: data.employeeId || '',
          domain: data.domain || '',
          title: data.title || '',
          durationSeconds: Number(data.durationSeconds || 0),
          category: data.category || 'productive',
          visitCount: Number(data.visitCount || 1),
        }
      })
      if (employeeId) {
        list = list.filter(w => w.employeeId === employeeId)
      }
      return list
    } catch {
      return []
    }
  }

  async getActivityMetrics(): Promise<ActivityMetric[]> {
    const db = this.getDb()
    try {
      const snap = await getDocs(collection(db, 'activity_metrics'))
      if (!snap.empty) {
        return snap.docs.map(d => {
          const data = d.data()
          return {
            timestamp: data.timestamp || '',
            activeMinutes: Number(data.activeMinutes || 0),
            idleMinutes: Number(data.idleMinutes || 0),
            keystrokes: Number(data.keystrokes || 0),
            mouseClicks: Number(data.mouseClicks || 0),
            productivityScore: Number(data.productivityScore || 90),
          }
        })
      }

      // Compute from real sessions
      const sessionsSnap = await getDocs(collection(db, 'work_sessions'))
      const sessions = sessionsSnap.docs.map(d => d.data())
      const hours = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00']
      const hourlyMap = new Map<string, { activeMinutes: number; idleMinutes: number }>()
      hours.forEach(h => hourlyMap.set(h, { activeMinutes: 0, idleMinutes: 0 }))

      for (const s of sessions) {
        const started = s.startedAt ? toDate(s.startedAt) : null
        if (started) {
          const hourStr = `${String(started.getHours()).padStart(2, '0')}:00`
          const existing = hourlyMap.get(hourStr)
          if (existing) {
            existing.activeMinutes += Math.round(Number(s.workDurationSeconds || s.durationSeconds || 0) / 60)
            existing.idleMinutes += Math.round(Number(s.breakDurationSeconds || 0) / 60)
          }
        }
      }

      return hours.map(h => {
        const item = hourlyMap.get(h) || { activeMinutes: 0, idleMinutes: 0 }
        const active = Math.min(60, item.activeMinutes)
        const idle = Math.min(60, item.idleMinutes)
        const total = active + idle
        const score = total > 0 ? Math.round((active / total) * 100) : 0
        return {
          timestamp: h,
          activeMinutes: active,
          idleMinutes: idle,
          keystrokes: active * 35,
          mouseClicks: active * 12,
          productivityScore: score,
        }
      })
    } catch {
      return []
    }
  }
}

export const firestoreDataService = new FirestoreDataService()
