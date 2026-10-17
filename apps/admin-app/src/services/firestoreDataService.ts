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
import { getFirebaseInstance } from './firebaseAuth'
import type {
  Employee,
  EmployeeRole,
  Device,
  DeviceRegistrationRecord,
  WorkSession,
  Screenshot,
  MonitoringSettings,
  ApprovalRequest,
  ProvisionEmployeePayload,
  ProvisionEmployeeResult,
} from '@worktrack-pro/shared'

// ─── Helper to parse Firestore dates safely ───────────────────
function toDate(val: any): Date {
  if (!val) return new Date()
  if (val instanceof Date) return val
  if (typeof val.toDate === 'function') return val.toDate()
  if (typeof val === 'string' || typeof val === 'number') return new Date(val)
  return new Date()
}

export class FirestoreDataService {
  private getDb(): Firestore {
    const { db } = getFirebaseInstance()
    if (!db) {
      throw new Error('Firestore is not initialized. Verify .env Firebase configuration.')
    }
    return db
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
      const message = err?.message || 'Failed to provision employee account.'
      throw new Error(message)
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
      return {
        id: data.deviceId || d.id,
        employeeId: data.employeeId || '',
        name: data.hostname || data.deviceName || 'Device',
        hostname: data.hostname || data.deviceName || 'Device',
        os: (data.platform || 'windows') as any,
        osVersion: data.osVersion || 'Windows',
        appVersion: data.agentVersion || data.appVersion || '1.0.0',
        status: (data.status || 'offline') as any,
        lastSeen: toDate(data.lastSeen || data.registeredAt),
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

  // ─── 3. Work Sessions Collection (/work_sessions) ─────────────
  async getSessions(): Promise<WorkSession[]> {
    const db = this.getDb()
    try {
      const snap = await getDocs(collection(db, 'work_sessions'))
      return snap.docs.map(d => {
        const data = d.data()
        return {
          id: data.sessionId || d.id,
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
    } catch (e) {
      console.warn('[FirestoreDataService] Could not read work_sessions:', e)
      return []
    }
  }

  async getActiveSessions(): Promise<WorkSession[]> {
    const all = await this.getSessions()
    return all.filter(s => s.status === 'active')
  }

  // ─── 4. Screenshots Collection (/screenshots) ─────────────────
  async getScreenshots(): Promise<Screenshot[]> {
    const db = this.getDb()
    try {
      const snap = await getDocs(collection(db, 'screenshots'))
      return snap.docs.map(d => {
        const data = d.data()
        return {
          id: data.screenshotId || d.id,
          sessionId: data.sessionId || '',
          employeeId: data.employeeId || '',
          deviceId: data.deviceId || '',
          takenAt: toDate(data.takenAt),
          imageUrl: data.imageUrl || data.downloadUrl || '',
          thumbnailUrl: data.thumbnailUrl,
          fileSizeBytes: Number(data.fileSizeBytes || 0),
          width: Number(data.width || 1920),
          height: Number(data.height || 1080),
        }
      })
    } catch (e) {
      console.warn('[FirestoreDataService] Could not read screenshots:', e)
      return []
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
  subscribeToEmployees(callback: (employees: Employee[]) => void): () => void {
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
          }
        })
        callback(emps)
      },
      err => {
        console.error('[FirestoreDataService] Error in employee subscription:', err)
      }
    )
  }

  subscribeToDevices(callback: (devices: Device[]) => void): () => void {
    const db = this.getDb()
    return onSnapshot(
      collection(db, 'devices'),
      snap => {
        const devs: Device[] = snap.docs.map(d => {
          const data = d.data()
          return {
            id: data.deviceId || d.id,
            employeeId: data.employeeId || '',
            name: data.hostname || data.deviceName || 'Device',
            hostname: data.hostname || data.deviceName || 'Device',
            os: (data.platform || 'windows') as any,
            osVersion: data.osVersion || 'Windows',
            appVersion: data.agentVersion || data.appVersion || '1.0.0',
            status: (data.status || 'offline') as any,
            lastSeen: toDate(data.lastSeen || data.registeredAt),
            registeredAt: toDate(data.registeredAt || data.lastSeen),
            ipAddress: data.ipAddress || '127.0.0.1',
          }
        })
        callback(devs)
      },
      err => {
        console.error('[FirestoreDataService] Error in device subscription:', err)
      }
    )
  }
}

export const firestoreDataService = new FirestoreDataService()
