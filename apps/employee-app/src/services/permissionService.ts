import type {
  ScreenViewRequest,
  ScreenViewRequestStatus,
  SerializedScreenViewRequest,
  PreAuthorizationRecord,
  SerializedPreAuthorizationRecord,
  PreAuthorizationStatus,
} from '@worktrack-pro/shared'
import {
  isValidPermissionTransition,
  parseDate,
  CURRENT_PRE_AUTH_POLICY,
} from '@worktrack-pro/shared'
import { deviceService } from './deviceService'

const LOCAL_STORAGE_PERMISSIONS = 'worktrack_screen_requests'
const LOCAL_STORAGE_PRE_AUTHS = 'worktrack_pre_authorizations'

export interface CreatePermissionRequestPayload {
  adminId?: string
  adminName?: string
  employeeId: string
  employeeName?: string
  deviceId: string
  deviceName?: string
  expiresInSeconds?: number
  timestamp?: Date
}

export interface PermissionActionOptions {
  reason?: string
  timestamp?: Date
  stoppedBy?: 'admin' | 'employee'
}

export class PermissionService {
  private isProcessing = false

  /**
   * Helper to serialize ScreenViewRequest for storage.
   */
  private serialize(req: ScreenViewRequest): SerializedScreenViewRequest {
    return {
      id: req.id,
      adminId: req.adminId,
      adminName: req.adminName,
      employeeId: req.employeeId,
      employeeName: req.employeeName,
      deviceId: req.deviceId,
      deviceName: req.deviceName,
      status: req.status,
      requestedAt: req.requestedAt instanceof Date ? req.requestedAt.toISOString() : new Date(req.requestedAt).toISOString(),
      respondedAt: req.respondedAt ? (req.respondedAt instanceof Date ? req.respondedAt.toISOString() : new Date(req.respondedAt).toISOString()) : undefined,
      endedAt: req.endedAt ? (req.endedAt instanceof Date ? req.endedAt.toISOString() : new Date(req.endedAt).toISOString()) : undefined,
      stoppedAt: req.stoppedAt ? (req.stoppedAt instanceof Date ? req.stoppedAt.toISOString() : new Date(req.stoppedAt).toISOString()) : undefined,
      stoppedBy: req.stoppedBy,
      expiresAt: req.expiresAt ? (req.expiresAt instanceof Date ? req.expiresAt.toISOString() : new Date(req.expiresAt).toISOString()) : undefined,
      rejectionReason: req.rejectionReason,
      requiresEmployeeApproval: req.requiresEmployeeApproval,
      isPreAuthorized: req.isPreAuthorized,
      authorizationPolicyVersion: req.authorizationPolicyVersion,
    }
  }

  /**
   * Helper to deserialize raw storage object to typed ScreenViewRequest with Date objects.
   */
  private deserialize(data: any): ScreenViewRequest | null {
    if (!data || typeof data !== 'object' || !data.id || !data.deviceId) return null
    const requestedAt = parseDate(data.requestedAt) || new Date()
    return {
      id: data.id,
      adminId: data.adminId || 'admin_001',
      adminName: data.adminName || 'Security Admin',
      employeeId: data.employeeId || '',
      employeeName: data.employeeName || '',
      deviceId: data.deviceId,
      deviceName: data.deviceName || 'Employee Desktop',
      status: data.status as ScreenViewRequestStatus,
      requestedAt,
      respondedAt: parseDate(data.respondedAt),
      endedAt: parseDate(data.endedAt),
      stoppedAt: parseDate(data.stoppedAt),
      stoppedBy: data.stoppedBy,
      expiresAt: parseDate(data.expiresAt),
      rejectionReason: data.rejectionReason,
      requiresEmployeeApproval: data.requiresEmployeeApproval !== undefined ? Boolean(data.requiresEmployeeApproval) : true,
      isPreAuthorized: Boolean(data.isPreAuthorized),
      authorizationPolicyVersion: data.authorizationPolicyVersion,
    }
  }

  /**
   * Retrieve all stored permission requests.
   */
  async getAllRequests(): Promise<ScreenViewRequest[]> {
    const raw = localStorage.getItem(LOCAL_STORAGE_PERMISSIONS)
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return parsed
          .map(item => this.deserialize(item))
          .filter((r): r is ScreenViewRequest => r !== null)
      }
    } catch {
      localStorage.removeItem(LOCAL_STORAGE_PERMISSIONS)
    }
    return []
  }

  /**
   * Save array of requests to persistence.
   */
  private async saveAllRequests(requests: ScreenViewRequest[]): Promise<void> {
    const serialized = requests.map(r => this.serialize(r))
    localStorage.setItem(LOCAL_STORAGE_PERMISSIONS, JSON.stringify(serialized))
  }

  /**
   * Create a new screen view permission request.
   * - Device must be in 'approved' registration state.
   */
  async createRequest(payload: CreatePermissionRequestPayload): Promise<ScreenViewRequest> {
    if (this.isProcessing) {
      throw new Error('A permission operation is currently in progress. Please wait.')
    }
    this.isProcessing = true
    try {
      // 1. Verify device registration state
      const regRecord = await deviceService.getRegistrationRecord()
      // If checking for the local device or matching device
      if (regRecord.deviceId === payload.deviceId && regRecord.status !== 'approved') {
        throw new Error(
          `Cannot request screen view: Device registration status is "${regRecord.status}". Only approved devices can receive monitoring requests.`
        )
      }

      const now = payload.timestamp ? new Date(payload.timestamp) : new Date()
      const expiresInSec = payload.expiresInSeconds || 60
      const expiresAt = new Date(now.getTime() + expiresInSec * 1000)

      const cryptoObj = window.crypto || (window as any).msCrypto
      const uuid = cryptoObj && cryptoObj.randomUUID
        ? cryptoObj.randomUUID()
        : `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

      const newRequest: ScreenViewRequest = {
        id: `req_${uuid}`,
        adminId: payload.adminId || 'admin_001',
        adminName: payload.adminName || 'Security Admin',
        employeeId: payload.employeeId,
        employeeName: payload.employeeName || 'Employee',
        deviceId: payload.deviceId,
        deviceName: payload.deviceName || 'Workstation',
        status: 'pending',
        requestedAt: now,
        expiresAt,
        requiresEmployeeApproval: true,
      }

      const all = await this.getAllRequests()
      await this.saveAllRequests([newRequest, ...all])
      return newRequest
    } finally {
      this.isProcessing = false
    }
  }

  /**
   * Get pending request for a specific device. Automatically checks and applies expiration.
   */
  async getPendingRequestForDevice(deviceId: string, now: Date = new Date()): Promise<ScreenViewRequest | null> {
    const all = await this.getAllRequests()
    let modified = false

    const updated = all.map(req => {
      if (req.deviceId === deviceId && req.status === 'pending') {
        if (req.expiresAt && now.getTime() >= req.expiresAt.getTime()) {
          modified = true
          return {
            ...req,
            status: 'expired' as ScreenViewRequestStatus,
            endedAt: req.expiresAt,
          }
        }
      }
      return req
    })

    if (modified) {
      await this.saveAllRequests(updated)
    }

    return updated.find(r => r.deviceId === deviceId && r.status === 'pending') || null
  }

  /**
   * Get active approved sharing request for a device.
   */
  async getActiveApprovedRequest(deviceId: string): Promise<ScreenViewRequest | null> {
    const all = await this.getAllRequests()
    return all.find(r => r.deviceId === deviceId && (r.status === 'approved' || r.status === 'active')) || null
  }

  /**
   * Employee approves a pending request.
   */
  async approveRequest(requestId: string, deviceId: string, options?: PermissionActionOptions): Promise<ScreenViewRequest> {
    if (this.isProcessing) {
      throw new Error('A permission operation is currently in progress. Please wait.')
    }
    this.isProcessing = true
    try {
      // 1. Device must be approved
      const reg = await deviceService.getRegistrationRecord()
      if (reg.deviceId === deviceId && reg.status !== 'approved') {
        throw new Error(`Device is not approved (status: ${reg.status}). Cannot grant permission.`)
      }

      const all = await this.getAllRequests()
      const req = all.find(r => r.id === requestId)
      if (!req) {
        throw new Error(`Permission request with ID "${requestId}" not found.`)
      }

      if (req.deviceId !== deviceId) {
        throw new Error(`Permission request is not addressed to this device (${deviceId}).`)
      }

      const now = options?.timestamp ? new Date(options.timestamp) : new Date()

      // Check expiration
      if (req.expiresAt && now.getTime() >= req.expiresAt.getTime()) {
        req.status = 'expired'
        req.endedAt = req.expiresAt
        await this.saveAllRequests(all)
        throw new Error('Cannot approve request: Permission request has expired.')
      }

      // Check duplicate approval
      if (req.status === 'approved' || req.status === 'active') {
        throw new Error('Duplicate approval rejected: Permission request is already approved.')
      }

      // Check transition validity
      if (!isValidPermissionTransition(req.status, 'approved')) {
        throw new Error(`Invalid state transition: Cannot approve request in status "${req.status}".`)
      }

      req.status = 'approved'
      req.respondedAt = now

      await this.saveAllRequests(all)

      if (typeof window !== 'undefined' && (window as any).electronAPI?.monitoring?.setAuthorization) {
        try {
          await (window as any).electronAPI.monitoring.setAuthorization({
            id: `auth_${req.id}`,
            deviceId: req.deviceId,
            status: 'granted',
            policyVersion: 'per-session-approved',
            grantedAt: now.toISOString(),
            updatedAt: now.toISOString(),
          })
        } catch {
          // quiet
        }
      }

      return { ...req }

    } finally {
      this.isProcessing = false
    }
  }

  /**
   * Employee rejects a pending request.
   */
  async rejectRequest(requestId: string, deviceId: string, options?: PermissionActionOptions): Promise<ScreenViewRequest> {
    if (this.isProcessing) {
      throw new Error('A permission operation is currently in progress. Please wait.')
    }
    this.isProcessing = true
    try {
      const all = await this.getAllRequests()
      const req = all.find(r => r.id === requestId)
      if (!req) {
        throw new Error(`Permission request with ID "${requestId}" not found.`)
      }

      if (req.deviceId !== deviceId) {
        throw new Error(`Permission request is not addressed to this device (${deviceId}).`)
      }

      if (req.status === 'rejected' || req.status === 'denied') {
        throw new Error('Duplicate rejection rejected: Request has already been rejected.')
      }

      if (!isValidPermissionTransition(req.status, 'rejected')) {
        throw new Error(`Invalid state transition: Cannot reject request in status "${req.status}".`)
      }

      const now = options?.timestamp ? new Date(options.timestamp) : new Date()
      req.status = 'rejected'
      req.respondedAt = now
      req.rejectionReason = options?.reason?.trim() || undefined

      await this.saveAllRequests(all)
      return { ...req }
    } finally {
      this.isProcessing = false
    }
  }

  /**
   * Cancel a pending request (typically by Admin before employee responds).
   */
  async cancelRequest(requestId: string): Promise<ScreenViewRequest> {
    const all = await this.getAllRequests()
    const req = all.find(r => r.id === requestId)
    if (!req) {
      throw new Error(`Permission request with ID "${requestId}" not found.`)
    }

    if (!isValidPermissionTransition(req.status, 'cancelled')) {
      throw new Error(`Invalid state transition: Cannot cancel request in status "${req.status}".`)
    }

    req.status = 'cancelled'
    req.endedAt = new Date()

    await this.saveAllRequests(all)
    return { ...req }
  }

  /**
   * Stop an active sharing session (by employee or admin).
   */
  async stopSharing(requestId: string, deviceId: string, options?: PermissionActionOptions): Promise<ScreenViewRequest> {
    if (this.isProcessing) {
      throw new Error('A permission operation is currently in progress. Please wait.')
    }
    this.isProcessing = true
    try {
      const all = await this.getAllRequests()
      const req = all.find(r => r.id === requestId)
      if (!req) {
        throw new Error(`Permission request with ID "${requestId}" not found.`)
      }

      if (req.deviceId !== deviceId) {
        throw new Error(`Permission request is not addressed to device "${deviceId}".`)
      }

      if (req.status === 'stopped' || req.status === 'ended') {
        throw new Error('Duplicate stop operation rejected: Sharing session has already been stopped.')
      }

      if (!isValidPermissionTransition(req.status, 'stopped')) {
        throw new Error(`Invalid state transition: Cannot stop request in status "${req.status}". Must be "approved".`)
      }

      const now = options?.timestamp ? new Date(options.timestamp) : new Date()
      req.status = 'stopped'
      req.stoppedAt = now
      req.endedAt = now
      req.stoppedBy = options?.stoppedBy || 'employee'

      await this.saveAllRequests(all)

      const preAuth = await this.getPreAuthorization(deviceId)
      if (typeof window !== 'undefined' && (window as any).electronAPI?.monitoring?.setAuthorization) {
        try {
          if (preAuth && preAuth.status === 'granted') {
            await (window as any).electronAPI.monitoring.setAuthorization(this.serializePreAuth(preAuth))
          } else {
            await (window as any).electronAPI.monitoring.setAuthorization({
              id: `auth_${deviceId}`,
              deviceId,
              status: 'revoked',
              policyVersion: CURRENT_PRE_AUTH_POLICY.version,
              revokedAt: now.toISOString(),
              updatedAt: now.toISOString(),
            })
          }
        } catch {
          // quiet
        }
      }

      return { ...req }

    } finally {
      this.isProcessing = false
    }
  }

  /**
   * Helper to serialize PreAuthorizationRecord for storage.
   */
  private serializePreAuth(rec: PreAuthorizationRecord): SerializedPreAuthorizationRecord {
    return {
      id: rec.id,
      employeeId: rec.employeeId,
      employeeName: rec.employeeName,
      deviceId: rec.deviceId,
      deviceName: rec.deviceName,
      status: rec.status,
      policyVersion: rec.policyVersion,
      grantedAt: rec.grantedAt ? (rec.grantedAt instanceof Date ? rec.grantedAt.toISOString() : new Date(rec.grantedAt).toISOString()) : undefined,
      grantedByAdminId: rec.grantedByAdminId,
      grantedByAdminName: rec.grantedByAdminName,
      revokedAt: rec.revokedAt ? (rec.revokedAt instanceof Date ? rec.revokedAt.toISOString() : new Date(rec.revokedAt).toISOString()) : undefined,
      revokedBy: rec.revokedBy,
      revocationReason: rec.revocationReason,
      updatedAt: rec.updatedAt instanceof Date ? rec.updatedAt.toISOString() : new Date(rec.updatedAt).toISOString(),
    }
  }

  /**
   * Helper to deserialize PreAuthorizationRecord from storage.
   */
  private deserializePreAuth(data: any): PreAuthorizationRecord | null {
    if (!data || typeof data !== 'object' || !data.deviceId) return null
    return {
      id: data.id || `auth_${data.deviceId}`,
      employeeId: data.employeeId || '',
      employeeName: data.employeeName,
      deviceId: data.deviceId,
      deviceName: data.deviceName,
      status: (data.status as PreAuthorizationStatus) || 'none',
      policyVersion: data.policyVersion || CURRENT_PRE_AUTH_POLICY.version,
      grantedAt: parseDate(data.grantedAt),
      grantedByAdminId: data.grantedByAdminId,
      grantedByAdminName: data.grantedByAdminName,
      revokedAt: parseDate(data.revokedAt),
      revokedBy: data.revokedBy,
      revocationReason: data.revocationReason,
      updatedAt: parseDate(data.updatedAt) || new Date(),
    }
  }

  /**
   * Retrieve all pre-authorization policy records.
   */
  async getAllPreAuthorizations(): Promise<PreAuthorizationRecord[]> {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(LOCAL_STORAGE_PRE_AUTHS) : null
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return parsed
          .map(item => this.deserializePreAuth(item))
          .filter((r): r is PreAuthorizationRecord => r !== null)
      }
    } catch {
      localStorage.removeItem(LOCAL_STORAGE_PRE_AUTHS)
    }
    return []
  }

  /**
   * Save pre-authorization records.
   */
  async saveAllPreAuthorizations(records: PreAuthorizationRecord[]): Promise<void> {
    if (typeof localStorage === 'undefined') return
    const serialized = records.map(r => this.serializePreAuth(r))
    localStorage.setItem(LOCAL_STORAGE_PRE_AUTHS, JSON.stringify(serialized))
    if (typeof window !== 'undefined' && (window as any).electronAPI?.monitoring?.setAuthorization && records.length > 0) {
      try {
        await (window as any).electronAPI.monitoring.setAuthorization(serialized[0])
      } catch {
        // quiet
      }
    }
  }

  /**
   * Get pre-authorization record for a specific device.
   */
  async getPreAuthorization(deviceId: string): Promise<PreAuthorizationRecord | null> {
    const all = await this.getAllPreAuthorizations()
    return all.find(r => r.deviceId === deviceId) || null
  }

  /**
   * Explicitly grant pre-authorization under the standard oversight policy.
   * Device must be in 'approved' registration status.
   */
  async grantPreAuthorization(payload: {
    employeeId: string
    employeeName?: string
    deviceId: string
    deviceName?: string
    policyVersion?: string
    adminName?: string
    timestamp?: Date
  }): Promise<PreAuthorizationRecord> {
    // 1. Verify device registration state
    const reg = await deviceService.getRegistrationRecord()
    if (reg.deviceId === payload.deviceId && reg.status !== 'approved') {
      throw new Error(
        `Cannot grant pre-authorization: Device registration status is "${reg.status}". Only approved devices can grant monitoring authorization.`
      )
    }

    const now = payload.timestamp ? new Date(payload.timestamp) : new Date()
    const all = await this.getAllPreAuthorizations()

    const existingIndex = all.findIndex(r => r.deviceId === payload.deviceId)
    const record: PreAuthorizationRecord = {
      id: existingIndex >= 0 ? all[existingIndex].id : `auth_${payload.deviceId}`,
      employeeId: payload.employeeId,
      employeeName: payload.employeeName,
      deviceId: payload.deviceId,
      deviceName: payload.deviceName,
      status: 'granted',
      policyVersion: payload.policyVersion || CURRENT_PRE_AUTH_POLICY.version,
      grantedAt: now,
      grantedByAdminName: payload.adminName || 'Security Admin',
      revokedAt: undefined,
      revokedBy: undefined,
      revocationReason: undefined,
      updatedAt: now,
    }

    if (existingIndex >= 0) {
      all[existingIndex] = record
    } else {
      all.unshift(record)
    }

    await this.saveAllPreAuthorizations(all)
    return { ...record }
  }

  /**
   * Revoke pre-authorization for a device.
   * If an active session is currently running, stops it immediately.
   */
  async revokePreAuthorization(
    deviceId: string,
    options?: {
      revokedBy?: 'employee' | 'admin'
      reason?: string
      timestamp?: Date
    }
  ): Promise<PreAuthorizationRecord> {
    const now = options?.timestamp ? new Date(options.timestamp) : new Date()
    const all = await this.getAllPreAuthorizations()
    let record = all.find(r => r.deviceId === deviceId)

    if (!record) {
      record = {
        id: `auth_${deviceId}`,
        employeeId: '',
        deviceId,
        status: 'revoked',
        policyVersion: CURRENT_PRE_AUTH_POLICY.version,
        revokedAt: now,
        revokedBy: options?.revokedBy || 'employee',
        revocationReason: options?.reason,
        updatedAt: now,
      }
      all.unshift(record)
    } else {
      record.status = 'revoked'
      record.revokedAt = now
      record.revokedBy = options?.revokedBy || 'employee'
      record.revocationReason = options?.reason
      record.updatedAt = now
    }

    await this.saveAllPreAuthorizations(all)

    // Terminate any currently active session for this device
    const active = await this.getActiveApprovedRequest(deviceId)
    if (active) {
      try {
        await this.stopSharing(active.id, deviceId, {
          stoppedBy: options?.revokedBy || 'employee',
          reason: options?.reason || 'Authorization revoked',
          timestamp: now,
        })
      } catch {
        // ignore if already stopped
      }
    }

    return { ...record }
  }

  /**
   * Initiate a pre-authorized one-click live viewing session.
   * No per-session employee prompt is required.
   * Pre-authorization MUST be in 'granted' status.
   */
  async startPreAuthorizedSession(payload: {
    employeeId: string
    employeeName?: string
    deviceId: string
    deviceName?: string
    adminId?: string
    adminName?: string
    timestamp?: Date
  }): Promise<ScreenViewRequest> {
    if (this.isProcessing) {
      throw new Error('A permission operation is currently in progress. Please wait.')
    }
    this.isProcessing = true
    try {
      // 1. Verify device registration state
      const reg = await deviceService.getRegistrationRecord()
      if (reg.deviceId === payload.deviceId && reg.status !== 'approved') {
        throw new Error(
          `Cannot start viewing session: Device registration is "${reg.status}". Only approved devices are eligible for live monitoring.`
        )
      }

      // 2. Check pre-authorization policy status
      const auth = await this.getPreAuthorization(payload.deviceId)
      if (!auth || auth.status !== 'granted') {
        const authStatus = auth ? auth.status : 'not_configured'
        throw new Error(
          `Pre-authorized viewing blocked: Employee has not granted active monitoring authorization (status: "${authStatus}").`
        )
      }

      // 3. Prevent duplicate active sessions
      const existing = await this.getActiveApprovedRequest(payload.deviceId)
      if (existing) {
        throw new Error(
          `Duplicate session rejected: A screen viewing session for device "${payload.deviceId}" is already active (Session: ${existing.id}).`
        )
      }

      const now = payload.timestamp ? new Date(payload.timestamp) : new Date()
      const cryptoObj = typeof window !== 'undefined' ? (window.crypto || (window as any).msCrypto) : null
      const uuid = cryptoObj && cryptoObj.randomUUID
        ? cryptoObj.randomUUID()
        : `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

      const newSession: ScreenViewRequest = {
        id: `req_oneclick_${uuid}`,
        adminId: payload.adminId || 'admin_001',
        adminName: payload.adminName || 'Security Admin',
        employeeId: payload.employeeId,
        employeeName: payload.employeeName || auth.employeeName || 'Employee',
        deviceId: payload.deviceId,
        deviceName: payload.deviceName || auth.deviceName || 'Workstation',
        status: 'approved',
        isPreAuthorized: true,
        authorizationPolicyVersion: auth.policyVersion,
        requiresEmployeeApproval: false,
        requestedAt: now,
        respondedAt: now,
      }

      const allRequests = await this.getAllRequests()
      await this.saveAllRequests([newSession, ...allRequests])
      return { ...newSession }
    } finally {
      this.isProcessing = false
    }
  }

  /**
   * Reset all permission and authorization data for clean testing.
   */
  async resetAll(): Promise<void> {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(LOCAL_STORAGE_PERMISSIONS)
      localStorage.removeItem(LOCAL_STORAGE_PRE_AUTHS)
    }
    this.isProcessing = false
  }
}

export const permissionService = new PermissionService()
