import type { DeviceRegistrationRecord, DeviceRegistrationStatus } from '@worktrack-pro/shared'
import {
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore'
import { getFirebaseInstance } from './firebaseAuth'

const LOCAL_STORAGE_DEVICE_ID = 'worktrack_device_id'
const LOCAL_STORAGE_REG_RECORD = 'worktrack_registration_record'

export interface DeviceInfo {
  deviceId: string
  deviceName: string
  hostname: string
  platform: string
  osVersion: string
}

export interface RegisterPayload {
  employeeId: string
  employeeName: string
  department?: string
  deviceName?: string
}

class DeviceService {
  /**
   * Safe getter for device info (UUID + hostname).
   * Generates and persists UUID on first run; detects machine hostname via Electron main.
   */
  async getDeviceInfo(): Promise<DeviceInfo> {
    const api = (window as any).electronAPI

    if (api) {
      try {
        const res = await api.invoke('device:getInfo')
        if (res && res.success && res.data) {
          return res.data as DeviceInfo
        }
      } catch (err) {
        console.warn('[DeviceService] Electron device:getInfo error, using fallback:', err)
      }
    }

    // Fallback for browser / test preview
    let deviceId = localStorage.getItem(LOCAL_STORAGE_DEVICE_ID)
    if (!deviceId) {
      const cryptoObj = window.crypto || (window as any).msCrypto
      const uuid = cryptoObj && cryptoObj.randomUUID
        ? cryptoObj.randomUUID()
        : `dev_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
      deviceId = `dev_${uuid}`
      localStorage.setItem(LOCAL_STORAGE_DEVICE_ID, deviceId)
    }

    return {
      deviceId,
      deviceName: (window as any).__hostname__ || 'DESKTOP-EMPLOYEE',
      hostname: (window as any).__hostname__ || 'DESKTOP-EMPLOYEE',
      platform: navigator.platform || 'Win32',
      osVersion: 'Windows 11',
    }
  }

  /**
   * Retrieve the current persisted registration record.
    * Returns a record with status 'not_registered' if none exists.
   */
  async getRegistrationRecord(): Promise<DeviceRegistrationRecord> {
    const api = (window as any).electronAPI
    let record: DeviceRegistrationRecord | null = null

    if (api) {
      try {
        const res = await api.invoke('device:getRegistration')
        if (res && res.success && res.data) {
          record = res.data as DeviceRegistrationRecord
        }
      } catch (err) {
        console.warn('[DeviceService] Electron getRegistration error:', err)
      }
    }

    // Fallback storage
    if (!record) {
      const raw = localStorage.getItem(LOCAL_STORAGE_REG_RECORD)
      if (raw) {
        try {
          record = JSON.parse(raw) as DeviceRegistrationRecord
        } catch {
          localStorage.removeItem(LOCAL_STORAGE_REG_RECORD)
        }
      }
    }

    if (!record) {
      const info = await this.getDeviceInfo()
      record = {
        deviceId: info.deviceId,
        deviceName: info.deviceName,
        hostname: info.hostname,
        employeeId: '',
        employeeName: '',
        department: '',
        status: 'not_registered',
        requestedAt: new Date().toISOString(),
      }
    }

    // Always attempt background Firestore verification/sync
    this.syncWithFirestore(record).catch(() => {})
    return record
  }

  /**
   * Guarantees that the device is registered in Firestore.
   * If the device document exists, loads its true approval status.
   * If it does not exist, registers it with 'pending_approval'.
   */
  async ensureRegistered(payload: RegisterPayload): Promise<DeviceRegistrationRecord> {
    const info = await this.getDeviceInfo()
    const { db, auth } = getFirebaseInstance()

    // 1. Check if Firestore already has a record for this device
    if (db) {
      try {
        const deviceRef = doc(db, 'devices', info.deviceId)
        const snap = await getDoc(deviceRef)
        if (snap.exists()) {
          const data = snap.data()
          const firestoreStatus = (data.approvalStatus || data.status || 'pending_approval') as DeviceRegistrationStatus
          const record: DeviceRegistrationRecord = {
            deviceId: info.deviceId,
            deviceName: data.deviceName || data.name || info.deviceName,
            hostname: data.hostname || info.hostname,
            employeeId: data.employeeId || payload.employeeId,
            employeeName: data.employeeName || payload.employeeName,
            department: data.department || payload.department || 'General',
            status: firestoreStatus,
            requestedAt: data.registeredAt?.toDate ? data.registeredAt.toDate().toISOString() : (data.requestedAt || new Date().toISOString()),
            reviewedAt: data.reviewedAt?.toDate ? data.reviewedAt.toDate().toISOString() : data.reviewedAt,
            reviewedBy: data.reviewedBy,
            rejectionReason: data.rejectionReason,
          }
          await this.saveRegistrationRecord(record)
          return record
        }
      } catch (err) {
        console.warn('[DeviceService] Could not check Firestore for device:', err)
      }
    }

    // 2. If not registered in Firestore yet, create device document
    if (db && auth?.currentUser) {
      try {
        const deviceRef = doc(db, 'devices', info.deviceId)
        await setDoc(deviceRef, {
          deviceId: info.deviceId,
          name: payload.deviceName || info.deviceName,
          deviceName: payload.deviceName || info.deviceName,
          hostname: info.hostname,
          platform: info.platform || 'windows',
          osVersion: info.osVersion || 'Windows 11',
          employeeId: payload.employeeId,
          employeeName: payload.employeeName,
          department: payload.department || 'General',
          userId: auth.currentUser.uid,
          approvalStatus: 'pending_approval',
          status: 'offline',
          registeredAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        }, { merge: true })

        const record: DeviceRegistrationRecord = {
          deviceId: info.deviceId,
          deviceName: payload.deviceName || info.deviceName,
          hostname: info.hostname,
          employeeId: payload.employeeId,
          employeeName: payload.employeeName,
          department: payload.department || 'General',
          status: 'pending_approval',
          requestedAt: new Date().toISOString(),
        }
        await this.saveRegistrationRecord(record)
        return record
      } catch (err) {
        console.warn('[DeviceService] Failed to create device record in Firestore:', err)
      }
    }

    return this.getRegistrationRecord()
  }

  /**
   * Syncs local registration with Firestore /devices/{deviceId} doc if exists.
   */
  async syncWithFirestore(localRecord: DeviceRegistrationRecord): Promise<void> {
    try {
      const { db } = getFirebaseInstance()
      if (!db || !localRecord.deviceId) return
      const snap = await getDoc(doc(db, 'devices', localRecord.deviceId))
      if (snap.exists()) {
        const data = snap.data()
        const firestoreStatus = data.approvalStatus || data.status
        if (firestoreStatus && firestoreStatus !== localRecord.status) {
          const updated: DeviceRegistrationRecord = {
            ...localRecord,
            status: firestoreStatus as DeviceRegistrationStatus,
            reviewedAt: data.reviewedAt ? (data.reviewedAt?.toDate ? data.reviewedAt.toDate().toISOString() : data.reviewedAt) : undefined,
            reviewedBy: data.reviewedBy,
            rejectionReason: data.rejectionReason,
          }
          await this.saveRegistrationRecord(updated)
        }
      }
    } catch (e) {
      // Ignore network errors
    }
  }

  /**
   * Listens to Firestore /devices/{deviceId} for real-time approval/rejection updates from Admin.
   */
  subscribeToDeviceApproval(
    deviceId: string,
    callback: (record: DeviceRegistrationRecord) => void,
    onError?: (err: Error) => void
  ): () => void {
    const { db } = getFirebaseInstance()
    if (!db || !deviceId) return () => {}

    const deviceRef = doc(db, 'devices', deviceId)
    return onSnapshot(
      deviceRef,
      snap => {
        if (snap.exists()) {
          const data = snap.data()
          const current: DeviceRegistrationRecord = {
            deviceId: data.deviceId || snap.id,
            deviceName: data.name || data.deviceName || data.hostname || 'Device',
            hostname: data.hostname || '',
            employeeId: data.employeeId || '',
            employeeName: data.employeeName || '',
            department: data.department || '',
            status: (data.approvalStatus || 'pending_approval') as DeviceRegistrationStatus,
            requestedAt: data.registeredAt?.toDate ? data.registeredAt.toDate().toISOString() : new Date().toISOString(),
            reviewedAt: data.reviewedAt?.toDate ? data.reviewedAt.toDate().toISOString() : data.reviewedAt,
            reviewedBy: data.reviewedBy,
            rejectionReason: data.rejectionReason,
          }
          this.saveRegistrationRecord(current)
          callback(current)
        }
      },
      err => {
        console.warn('[DeviceService] Device approval listener error:', err)
        if (onError) onError(err)
      }
    )
  }

  /**
   * Submit a new registration request.
   * Validates inputs and enforces state transition from 'not_registered' or 'rejected' -> 'pending_approval'.
   * Prevents duplicate registrations if already pending or approved.
   */
  async registerDevice(payload: RegisterPayload): Promise<DeviceRegistrationRecord> {
    const employeeId = payload.employeeId ? payload.employeeId.trim() : ''
    const employeeName = payload.employeeName ? payload.employeeName.trim() : ''
    const department = payload.department ? payload.department.trim() : 'General'

    if (!employeeId) {
      throw new Error('Employee ID is required.')
    }
    if (!employeeName) {
      throw new Error('Employee Name is required.')
    }

    const current = await this.getRegistrationRecord()

    // Prevent duplicate registrations
    if (current.status === 'pending_approval') {
      throw new Error('Registration is already pending administrator approval.')
    }
    if (current.status === 'approved') {
      throw new Error('This device is already approved and registered.')
    }

    const info = await this.getDeviceInfo()
    const deviceName = payload.deviceName ? payload.deviceName.trim() : info.deviceName

    const record: DeviceRegistrationRecord = {
      deviceId: info.deviceId,
      deviceName: deviceName || info.deviceName,
      hostname: info.hostname,
      employeeId,
      employeeName,
      department,
      status: 'pending_approval',
      requestedAt: new Date().toISOString(),
    }

    await this.saveRegistrationRecord(record)

    // Write to Firestore /devices/{deviceId} if live Firebase is active
    try {
      const { db, auth } = getFirebaseInstance()
      if (db && auth?.currentUser) {
        const deviceRef = doc(db, 'devices', info.deviceId)
        await setDoc(deviceRef, {
          deviceId: info.deviceId,
          name: deviceName || info.deviceName,
          deviceName: deviceName || info.deviceName,
          hostname: info.hostname,
          platform: info.platform || 'windows',
          osVersion: info.osVersion || 'Windows 11',
          employeeId,
          employeeName,
          department,
          userId: auth.currentUser.uid,
          approvalStatus: 'pending_approval',
          status: 'offline',
          registeredAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        }, { merge: true })
      }
    } catch (err) {
      console.warn('[DeviceService] Failed to sync device registration to Firestore:', err)
    }

    return record
  }

  /**
   * Simulate an administrator review (Approved or Rejected).
   * Validates that state transition only occurs from 'pending_approval'.
   */
  async simulateAdminReview(
    decision: 'approved' | 'rejected',
    reason?: string
  ): Promise<DeviceRegistrationRecord> {
    const current = await this.getRegistrationRecord()

    if (current.status !== 'pending_approval') {
      throw new Error(`Invalid state transition: Cannot change status from "${current.status}" to "${decision}". Only "pending_approval" devices can be reviewed.`)
    }

    const updated: DeviceRegistrationRecord = {
      ...current,
      status: decision,
      reviewedAt: new Date().toISOString(),
      reviewedBy: 'Admin (Mock Console)',
      rejectionReason: decision === 'rejected' ? (reason || 'Device hardware policy check failed. Contact IT administrator.') : undefined,
    }

    await this.saveRegistrationRecord(updated)
    return updated
  }

  /**
   * Reset / unregister device back to 'not_registered'.
   */
  async resetRegistration(): Promise<void> {
    const api = (window as any).electronAPI

    if (api) {
      try {
        await api.invoke('device:clearRegistration')
      } catch (err) {
        console.warn('[DeviceService] Electron clearRegistration error:', err)
      }
    }

    localStorage.removeItem(LOCAL_STORAGE_REG_RECORD)
  }

  /**
   * Persists the record via Electron or localStorage fallback.
   */
  private async saveRegistrationRecord(record: DeviceRegistrationRecord): Promise<void> {
    const api = (window as any).electronAPI

    if (api) {
      try {
        await api.invoke('device:saveRegistration', record)
        return
      } catch (err) {
        console.warn('[DeviceService] Electron saveRegistration error, falling back:', err)
      }
    }

    localStorage.setItem(LOCAL_STORAGE_REG_RECORD, JSON.stringify(record))
  }
}

export const deviceService = new DeviceService()
