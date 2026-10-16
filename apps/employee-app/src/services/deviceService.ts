import type { DeviceRegistrationRecord, DeviceRegistrationStatus } from '@worktrack-pro/shared'

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

    if (api) {
      try {
        const res = await api.invoke('device:getRegistration')
        if (res && res.success && res.data) {
          return res.data as DeviceRegistrationRecord
        }
      } catch (err) {
        console.warn('[DeviceService] Electron getRegistration error:', err)
      }
    }

    // Fallback storage
    const raw = localStorage.getItem(LOCAL_STORAGE_REG_RECORD)
    if (raw) {
      try {
        return JSON.parse(raw) as DeviceRegistrationRecord
      } catch {
        localStorage.removeItem(LOCAL_STORAGE_REG_RECORD)
      }
    }

    const info = await this.getDeviceInfo()
    return {
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
