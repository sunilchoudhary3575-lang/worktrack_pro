import type {
  Employee,
  EmployeeRole,
  Device,
  DeviceRegistrationRecord,
  WorkSession,
  Screenshot,
  ScreenshotFilters,
  MonitoringSettings,
  DailySummary,
  WeeklySummary,
  ScreenViewRequest,
  PreAuthorizationRecord,
  AppUsage,
  WebUsage,
  ActivityMetric,
  ApprovalRequest,
  ProvisionEmployeePayload,
  ProvisionEmployeeResult,
  ResetEmployeePasswordPayload,
  ResetEmployeePasswordResult,
  UserAccount,
} from '@worktrack-pro/shared'
import {
  CURRENT_PRE_AUTH_POLICY,
  normalizeEmployeeId,
  formatEmployeeAuthEmail,
  validatePasswordStrength,
} from '@worktrack-pro/shared'
import { isFirebaseConfigured, getFirebaseInstance } from './firebaseAuth'
import { firestoreDataService } from './firestoreDataService'

export function isLiveFirestoreActive(): boolean {
  if (typeof window === 'undefined') return false
  if (!isFirebaseConfigured()) return false
  const { auth } = getFirebaseInstance()
  if (auth?.currentUser) return true
  // In offline demo session, stream live Firestore data if available unless mock data is explicitly forced
  if (localStorage.getItem('worktrack_admin_demo_session')) {
    return localStorage.getItem('worktrack_admin_force_mock') !== 'true'
  }
  return false
}

// ─── Mock Data ───────────────────────────────────────────────
// ⚠️  ALL DATA BELOW IS MOCK DATA FOR DEVELOPMENT ONLY.
// ⚠️  This does NOT represent real employee activity.
// Replace all functions here with Firebase calls in Phase 2.

export const MOCK_EMPLOYEES: Employee[] = [
  {
    id: 'emp_001',
    name: 'Sarah Johnson',
    email: 'sarah.johnson@example.com',
    role: 'employee',
    department: 'Engineering',
    avatarUrl: undefined,
    createdAt: new Date('2024-01-15'),
    updatedAt: new Date('2024-10-01'),
  },
  {
    id: 'emp_002',
    name: 'Marcus Chen',
    email: 'marcus.chen@example.com',
    role: 'employee',
    department: 'Design',
    avatarUrl: undefined,
    createdAt: new Date('2024-02-20'),
    updatedAt: new Date('2024-10-01'),
  },
  {
    id: 'emp_003',
    name: 'Priya Sharma',
    email: 'priya.sharma@example.com',
    role: 'employee',
    department: 'Engineering',
    avatarUrl: undefined,
    createdAt: new Date('2024-03-10'),
    updatedAt: new Date('2024-10-01'),
  },
  {
    id: 'emp_004',
    name: 'James Wilson',
    email: 'james.wilson@example.com',
    role: 'manager',
    department: 'Operations',
    avatarUrl: undefined,
    createdAt: new Date('2023-11-05'),
    updatedAt: new Date('2024-10-01'),
  },
  {
    id: 'emp_005',
    name: 'Aisha Patel',
    email: 'aisha.patel@example.com',
    role: 'employee',
    department: 'Marketing',
    avatarUrl: undefined,
    createdAt: new Date('2024-05-12'),
    updatedAt: new Date('2024-10-01'),
  },
  {
    id: 'emp_006',
    name: 'Alex Mercer',
    email: 'alex.mercer@example.com',
    role: 'employee',
    department: 'Engineering',
    avatarUrl: undefined,
    createdAt: new Date('2024-09-01'),
    updatedAt: new Date('2024-10-01'),
  },
  {
    id: 'emp_007',
    name: 'Jordan Taylor',
    email: 'jordan.taylor@example.com',
    role: 'employee',
    department: 'Support',
    avatarUrl: undefined,
    createdAt: new Date('2024-09-15'),
    updatedAt: new Date('2024-10-01'),
  },
]

export const MOCK_DEVICES: Device[] = [
  {
    id: 'dev_001',
    employeeId: 'emp_001',
    name: 'LAPTOP-SJ-001',
    hostname: 'LAPTOP-SJ-001',
    os: 'windows',
    osVersion: 'Windows 11 Pro 23H2',
    appVersion: '1.0.0',
    status: 'online',
    ipAddress: '192.168.1.101',
    lastSeen: new Date(),
    registeredAt: new Date('2024-01-16'),
  },
  {
    id: 'dev_002',
    employeeId: 'emp_002',
    name: 'LAPTOP-MC-001',
    hostname: 'LAPTOP-MC-001',
    os: 'windows',
    osVersion: 'Windows 11 Home 23H2',
    appVersion: '1.0.0',
    status: 'online',
    ipAddress: '192.168.1.102',
    lastSeen: new Date(),
    registeredAt: new Date('2024-02-21'),
  },
  {
    id: 'dev_003',
    employeeId: 'emp_003',
    name: 'LAPTOP-PS-001',
    hostname: 'LAPTOP-PS-001',
    os: 'windows',
    osVersion: 'Windows 11 Pro 23H2',
    appVersion: '1.0.0',
    status: 'idle',
    ipAddress: '192.168.1.103',
    lastSeen: new Date(Date.now() - 15 * 60_000),
    registeredAt: new Date('2024-03-11'),
  },
  {
    id: 'dev_004',
    employeeId: 'emp_004',
    name: 'LAPTOP-JW-001',
    hostname: 'LAPTOP-JW-001',
    os: 'windows',
    osVersion: 'Windows 10 Pro 22H2',
    appVersion: '1.0.0',
    status: 'offline',
    lastSeen: new Date(Date.now() - 2 * 60 * 60_000),
    registeredAt: new Date('2023-11-06'),
  },
  {
    id: 'dev_005',
    employeeId: 'emp_005',
    name: 'LAPTOP-AP-001',
    hostname: 'LAPTOP-AP-001',
    os: 'windows',
    osVersion: 'Windows 11 Home 23H2',
    appVersion: '1.0.0',
    status: 'online',
    ipAddress: '192.168.1.105',
    lastSeen: new Date(),
    registeredAt: new Date('2024-05-13'),
  },
  {
    id: 'dev_006',
    employeeId: 'emp_006',
    name: 'WORKSTATION-AM-01',
    hostname: 'WORKSTATION-AM-01',
    os: 'windows',
    osVersion: 'Windows 11 Pro',
    appVersion: '1.0.0',
    status: 'idle',
    ipAddress: '192.168.1.108',
    lastSeen: new Date(Date.now() - 30 * 60_000),
    registeredAt: new Date(Date.now() - 2 * 3600_000),
  },
]

export const MOCK_DEVICE_REGISTRATIONS: DeviceRegistrationRecord[] = [
  {
    deviceId: 'dev_001',
    deviceName: 'LAPTOP-SJ-001',
    hostname: 'LAPTOP-SJ-001',
    employeeId: 'emp_001',
    employeeName: 'Sarah Johnson',
    department: 'Engineering',
    status: 'approved',
    requestedAt: new Date('2024-01-16T08:30:00Z'),
    reviewedAt: new Date('2024-01-16T09:00:00Z'),
    reviewedBy: 'Admin User',
  },
  {
    deviceId: 'dev_002',
    deviceName: 'LAPTOP-MC-001',
    hostname: 'LAPTOP-MC-001',
    employeeId: 'emp_002',
    employeeName: 'Marcus Chen',
    department: 'Design',
    status: 'approved',
    requestedAt: new Date('2024-02-21T09:15:00Z'),
    reviewedAt: new Date('2024-02-21T09:45:00Z'),
    reviewedBy: 'Admin User',
  },
  {
    deviceId: 'dev_003',
    deviceName: 'LAPTOP-PS-001',
    hostname: 'LAPTOP-PS-001',
    employeeId: 'emp_003',
    employeeName: 'Priya Sharma',
    department: 'Engineering',
    status: 'approved',
    requestedAt: new Date('2024-03-11T10:00:00Z'),
    reviewedAt: new Date('2024-03-11T10:30:00Z'),
    reviewedBy: 'Admin User',
  },
  {
    deviceId: 'dev_004',
    deviceName: 'LAPTOP-JW-001',
    hostname: 'LAPTOP-JW-001',
    employeeId: 'emp_004',
    employeeName: 'James Wilson',
    department: 'Operations',
    status: 'rejected',
    requestedAt: new Date('2024-04-05T11:00:00Z'),
    reviewedAt: new Date('2024-04-05T11:45:00Z'),
    reviewedBy: 'Admin User',
    rejectionReason: 'Hardware serial mismatch with IT inventory policy.',
  },
  {
    deviceId: 'dev_005',
    deviceName: 'LAPTOP-AP-001',
    hostname: 'LAPTOP-AP-001',
    employeeId: 'emp_005',
    employeeName: 'Aisha Patel',
    department: 'Marketing',
    status: 'pending_approval',
    requestedAt: new Date(Date.now() - 3 * 3600_000),
  },
  {
    deviceId: 'dev_006',
    deviceName: 'WORKSTATION-AM-01',
    hostname: 'WORKSTATION-AM-01',
    employeeId: 'emp_006',
    employeeName: 'Alex Mercer',
    department: 'Engineering',
    status: 'pending_approval',
    requestedAt: new Date(Date.now() - 45 * 60_000),
  },
]

export const MOCK_SESSIONS: WorkSession[] = [
  {
    id: 'sess_001',
    employeeId: 'emp_001',
    deviceId: 'dev_001',
    status: 'working',
    startedAt: new Date(Date.now() - 3 * 60 * 60_000),
    breaks: [
      {
        id: 'brk_001',
        reason: 'coffee',
        customReason: 'Morning Coffee',
        startedAt: new Date(Date.now() - 110 * 60_000),
        endedAt: new Date(Date.now() - 95 * 60_000),
        durationSeconds: 900,
      },
    ],
    durationSeconds: 3 * 3600,
    breakDurationSeconds: 900,
    workDurationSeconds: 3 * 3600 - 900,
  },
  {
    id: 'sess_002',
    employeeId: 'emp_002',
    deviceId: 'dev_002',
    status: 'on_break',
    startedAt: new Date(Date.now() - 5 * 60 * 60_000),
    pausedAt: new Date(Date.now() - 25 * 60_000),
    breaks: [
      {
        id: 'brk_002',
        reason: 'lunch',
        customReason: 'Design Team Lunch',
        startedAt: new Date(Date.now() - 25 * 60_000),
      },
    ],
    durationSeconds: 5 * 3600,
    breakDurationSeconds: 1500,
    workDurationSeconds: 5 * 3600 - 1500,
  },
  {
    id: 'sess_003',
    employeeId: 'emp_003',
    deviceId: 'dev_003',
    status: 'ended',
    startedAt: new Date(Date.now() - 26 * 60 * 60_000),
    endedAt: new Date(Date.now() - 18 * 60 * 60_000),
    durationSeconds: 8 * 3600,
    breakDurationSeconds: 3600,
    workDurationSeconds: 7 * 3600,
    breaks: [
      {
        id: 'brk_003',
        reason: 'lunch',
        startedAt: new Date(Date.now() - 22 * 60 * 60_000),
        endedAt: new Date(Date.now() - 21 * 60 * 60_000),
        durationSeconds: 3600,
      },
    ],
  },
  {
    id: 'sess_004',
    employeeId: 'emp_001',
    deviceId: 'dev_001',
    status: 'ended',
    startedAt: new Date(Date.now() - 28 * 60 * 60_000),
    endedAt: new Date(Date.now() - 20 * 60 * 60_000),
    durationSeconds: 8 * 3600,
    breakDurationSeconds: 2700,
    workDurationSeconds: 8 * 3600 - 2700,
    breaks: [
      {
        id: 'brk_004',
        reason: 'lunch',
        startedAt: new Date(Date.now() - 25 * 60 * 60_000),
        endedAt: new Date(Date.now() - (24 * 60 + 15) * 60_000),
        durationSeconds: 2700,
      },
    ],
  },
  {
    id: 'sess_005',
    employeeId: 'emp_003',
    deviceId: 'dev_003',
    status: 'ended',
    startedAt: new Date(Date.now() - 50 * 60 * 60_000),
    endedAt: new Date(Date.now() - 42 * 60 * 60_000),
    durationSeconds: 8 * 3600,
    breakDurationSeconds: 1800,
    workDurationSeconds: 8 * 3600 - 1800,
    breaks: [
      {
        id: 'brk_005',
        reason: 'coffee',
        startedAt: new Date(Date.now() - 46 * 60 * 60_000),
        endedAt: new Date(Date.now() - (45 * 60 + 30) * 60_000),
        durationSeconds: 1800,
      },
    ],
  },
]

// Generate mock screenshots (placeholder data URLs replaced in Phase 2)
export const MOCK_SCREENSHOTS: Screenshot[] = Array.from({ length: 12 }, (_, i) => ({
  id: `scr_${String(i + 1).padStart(3, '0')}`,
  sessionId: MOCK_SESSIONS[i % 3]?.id ?? 'sess_001',
  employeeId: MOCK_EMPLOYEES[i % 3]?.id ?? 'emp_001',
  deviceId: MOCK_DEVICES[i % 3]?.id ?? 'dev_001',
  takenAt: new Date(Date.now() - i * 20 * 60_000),
  imageUrl: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><rect width="1280" height="720" fill="#1e1e35"/><text x="640" y="360" font-family="sans-serif" font-size="24" fill="#6b6bf5" text-anchor="middle">Mock Screenshot ${i + 1} — ${MOCK_EMPLOYEES[i % 3]?.name ?? 'Employee'}</text><text x="640" y="400" font-family="sans-serif" font-size="16" fill="#666" text-anchor="middle">⚠ Development placeholder — not real employee data</text></svg>`)}`,
  thumbnailUrl: undefined,
  fileSizeBytes: 45_000 + i * 3000,
  width: 1280,
  height: 720,
}))

export const MOCK_SETTINGS: MonitoringSettings = {
  id: 'settings_001',
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
  updatedAt: new Date('2024-10-01'),
  updatedBy: 'admin_001',
}

export const MOCK_SCREEN_VIEW_REQUESTS: ScreenViewRequest[] = [
  {
    id: 'req_init_001',
    adminId: 'admin_001',
    adminName: 'Security Admin',
    employeeId: 'emp_002',
    employeeName: 'Marcus Chen',
    deviceId: 'dev_002',
    deviceName: 'LAPTOP-MC-001',
    status: 'pending',
    requestedAt: new Date(Date.now() - 20 * 1000),
    expiresAt: new Date(Date.now() + 40 * 1000),
    requiresEmployeeApproval: true,
  },
]

export const MOCK_PRE_AUTHORIZATIONS: PreAuthorizationRecord[] = []

// Snapshot copies for reset
const INITIAL_EMPLOYEES = JSON.stringify(MOCK_EMPLOYEES)
const INITIAL_DEVICES = JSON.stringify(MOCK_DEVICES)
const INITIAL_REGISTRATIONS = JSON.stringify(MOCK_DEVICE_REGISTRATIONS)
const INITIAL_SESSIONS = JSON.stringify(MOCK_SESSIONS)
const INITIAL_SCREEN_VIEW_REQUESTS = JSON.stringify(MOCK_SCREEN_VIEW_REQUESTS)
const INITIAL_PRE_AUTHORIZATIONS = JSON.stringify(MOCK_PRE_AUTHORIZATIONS)

// ─── Data Service Interface ───────────────────────────────────
// Replace the mock implementations below with Firebase calls in Phase 2.
// Keep function signatures identical to avoid breaking callers.

export const dataService = {
  // Live Subscriptions
  subscribeToEmployees: (callback: (employees: Employee[]) => void, onError?: (err: Error) => void): (() => void) => {
    if (isLiveFirestoreActive()) {
      return firestoreDataService.subscribeToEmployees(callback, onError)
    }
    callback([...MOCK_EMPLOYEES])
    return () => {}
  },

  subscribeToUsers: (callback: (users: UserAccount[]) => void, onError?: (err: Error) => void): (() => void) => {
    if (isLiveFirestoreActive()) {
      return firestoreDataService.subscribeToUsers(callback, onError)
    }
    callback([])
    return () => {}
  },

  subscribeToDevices: (callback: (devices: Device[]) => void, onError?: (err: Error) => void): (() => void) => {
    if (isLiveFirestoreActive()) {
      return firestoreDataService.subscribeToDevices(callback, onError)
    }
    callback([...MOCK_DEVICES])
    return () => {}
  },

  subscribeToDeviceRegistrations: (callback: (registrations: DeviceRegistrationRecord[]) => void, onError?: (err: Error) => void): (() => void) => {
    if (isLiveFirestoreActive()) {
      return firestoreDataService.subscribeToDeviceRegistrations(callback, onError)
    }
    callback([...MOCK_DEVICE_REGISTRATIONS])
    return () => {}
  },

  subscribeToSessions: (callback: (sessions: WorkSession[]) => void, onError?: (err: Error) => void): (() => void) => {
    if (isLiveFirestoreActive()) {
      return firestoreDataService.subscribeToSessions(callback, onError)
    }
    callback([...MOCK_SESSIONS])
    return () => {}
  },

  // Employees
  getEmployees: async (): Promise<Employee[]> => {
    if (isLiveFirestoreActive()) {
      return firestoreDataService.getEmployees()
    }
    await delay(150)
    return [...MOCK_EMPLOYEES]
  },

  getEmployee: async (id: string): Promise<Employee | null> => {
    if (isLiveFirestoreActive()) {
      return firestoreDataService.getEmployee(id)
    }
    await delay(100)
    return MOCK_EMPLOYEES.find(e => e.id === id) ?? null
  },

  createEmployee: async (data: {
    id: string
    name: string
    email: string
    role?: EmployeeRole
    department?: string
  }): Promise<Employee> => {
    if (isLiveFirestoreActive()) {
      return firestoreDataService.createEmployee(data)
    }
    await delay(150)
    const trimmedId = data.id?.trim()
    const trimmedName = data.name?.trim()
    const trimmedEmail = data.email?.trim()

    if (!trimmedId) throw new Error('Employee ID is required.')
    if (!trimmedName) throw new Error('Employee Full Name is required.')
    if (!trimmedEmail) throw new Error('Email address is required.')
    if (!trimmedEmail.includes('@') || !trimmedEmail.includes('.')) {
      throw new Error('Please provide a valid email address.')
    }

    const existing = MOCK_EMPLOYEES.find(e => e.id.toLowerCase() === trimmedId.toLowerCase())
    if (existing) {
      throw new Error(`Duplicate Employee ID: An employee with ID "${trimmedId}" already exists.`)
    }

    const newEmp: Employee = {
      id: trimmedId,
      name: trimmedName,
      email: trimmedEmail,
      role: data.role || 'employee',
      department: data.department?.trim() || 'General',
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    MOCK_EMPLOYEES.push(newEmp)
    return { ...newEmp }
  },

  provisionEmployee: async (payload: ProvisionEmployeePayload): Promise<ProvisionEmployeeResult> => {
    if (isLiveFirestoreActive()) {
      return firestoreDataService.provisionEmployee(payload)
    }

    // Offline Demo / Mock Mode implementation
    await delay(300)
    const normalized = normalizeEmployeeId(payload.employeeId)
    const existing = MOCK_EMPLOYEES.find(e => e.id.toLowerCase() === normalized)
    if (existing && existing.userId) {
      const err: any = new Error(`[functions/already-exists] Employee ID "${normalized}" is already linked to an active user account.`)
      err.code = 'functions/already-exists'
      throw err
    }

    const passwordCheck = validatePasswordStrength(payload.initialPassword)
    if (!passwordCheck.valid) {
      const err: any = new Error(`[functions/invalid-argument] Password does not meet security requirements: ${passwordCheck.errors.join(' ')}`)
      err.code = 'functions/invalid-argument'
      throw err
    }

    const mockUid = `demo_uid_${normalized}`
    const syntheticEmail = formatEmployeeAuthEmail(normalized)

    if (existing) {
      existing.userId = mockUid
      existing.updatedAt = new Date()
    } else {
      const newEmp: Employee = {
        id: normalized,
        name: payload.name.trim(),
        email: payload.contactEmail.trim(),
        role: 'employee',
        department: payload.department.trim(),
        userId: mockUid,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      MOCK_EMPLOYEES.push(newEmp)
    }

    return {
      success: true,
      uid: mockUid,
      employeeId: normalized,
      authEmail: syntheticEmail,
      contactEmail: payload.contactEmail.trim().toLowerCase(),
      name: payload.name.trim(),
      role: 'employee',
      department: payload.department.trim(),
    }
  },

  resetEmployeePassword: async (payload: ResetEmployeePasswordPayload): Promise<ResetEmployeePasswordResult> => {
    if (isLiveFirestoreActive()) {
      return firestoreDataService.resetEmployeePassword(payload)
    }

    // Offline / Mock implementation
    await delay(300)
    const normalized = normalizeEmployeeId(payload.employeeId)
    const existing = MOCK_EMPLOYEES.find(e => e.id.toLowerCase() === normalized)
    if (!existing) {
      const err: any = new Error(`[functions/not-found] Employee with ID "${normalized}" was not found in directory.`)
      err.code = 'functions/not-found'
      throw err
    }
    if (!existing.userId) {
      const err: any = new Error(`[functions/failed-precondition] Employee "${normalized}" has not been provisioned with an active account.`)
      err.code = 'functions/failed-precondition'
      throw err
    }

    const passwordCheck = validatePasswordStrength(payload.newPassword)
    if (!passwordCheck.valid) {
      const err: any = new Error(`[functions/invalid-argument] Password does not meet security requirements: ${passwordCheck.errors.join(' ')}`)
      err.code = 'functions/invalid-argument'
      throw err
    }

    existing.updatedAt = new Date()
    return {
      success: true,
      employeeId: normalized,
      uid: existing.userId,
      updatedAt: new Date().toISOString(),
    }
  },

  updateEmployee: async (
    id: string,
    updates: {
      name?: string
      email?: string
      role?: EmployeeRole
      department?: string
    }
  ): Promise<Employee> => {
    if (isLiveFirestoreActive()) {
      const updated = await firestoreDataService.updateEmployee(id, updates)
      if (!updated) throw new Error(`Employee with ID "${id}" not found.`)
      return updated
    }
    await delay(150)
    const emp = MOCK_EMPLOYEES.find(e => e.id === id)
    if (!emp) {
      throw new Error(`Employee with ID "${id}" not found.`)
    }

    if (updates.name !== undefined) {
      if (!updates.name.trim()) throw new Error('Employee Name cannot be empty.')
      emp.name = updates.name.trim()
    }
    if (updates.email !== undefined) {
      if (!updates.email.trim() || !updates.email.includes('@')) {
        throw new Error('Please provide a valid email address.')
      }
      emp.email = updates.email.trim()
    }
    if (updates.department !== undefined) {
      emp.department = updates.department.trim()
    }
    if (updates.role !== undefined) {
      emp.role = updates.role
    }
    emp.updatedAt = new Date()

    return { ...emp }
  },

  deleteEmployee: async (employeeId: string, userId?: string): Promise<{ success: boolean; employeeId: string }> => {
    if (isLiveFirestoreActive()) {
      try {
        return await firestoreDataService.deleteEmployee(employeeId, userId)
      } catch (err) {
        console.warn('[DataService] Firestore deleteEmployee failed, updating mock store:', err)
      }
    }

    await delay(150)
    const normalized = normalizeEmployeeId(employeeId)
    const empIdx = MOCK_EMPLOYEES.findIndex(e => e.id.toLowerCase() === normalized)
    if (empIdx !== -1) {
      MOCK_EMPLOYEES.splice(empIdx, 1)
    }

    for (let i = MOCK_DEVICES.length - 1; i >= 0; i--) {
      if (MOCK_DEVICES[i].employeeId.toLowerCase() === normalized) {
        MOCK_DEVICES.splice(i, 1)
      }
    }

    for (let i = MOCK_DEVICE_REGISTRATIONS.length - 1; i >= 0; i--) {
      if (MOCK_DEVICE_REGISTRATIONS[i].employeeId.toLowerCase() === normalized) {
        MOCK_DEVICE_REGISTRATIONS.splice(i, 1)
      }
    }

    for (let i = MOCK_SESSIONS.length - 1; i >= 0; i--) {
      if (MOCK_SESSIONS[i].employeeId.toLowerCase() === normalized) {
        MOCK_SESSIONS.splice(i, 1)
      }
    }

    return { success: true, employeeId: normalized }
  },

  // Devices
  getDevices: async (): Promise<Device[]> => {
    if (isLiveFirestoreActive()) {
      return firestoreDataService.getDevices()
    }
    await delay(150)
    return [...MOCK_DEVICES]
  },

  getDevicesByEmployee: async (employeeId: string): Promise<Device[]> => {
    if (isLiveFirestoreActive()) {
      const all = await firestoreDataService.getDevices()
      return all.filter(d => d.employeeId === employeeId)
    }
    await delay(100)
    return MOCK_DEVICES.filter(d => d.employeeId === employeeId)
  },

  getDeviceByEmployee: async (employeeId: string): Promise<Device | null> => {
    if (isLiveFirestoreActive()) {
      const all = await firestoreDataService.getDevices()
      return all.find(d => d.employeeId === employeeId) ?? null
    }
    await delay(100)
    return MOCK_DEVICES.find(d => d.employeeId === employeeId) ?? null
  },

  // Device Registrations
  getDeviceRegistrations: async (): Promise<DeviceRegistrationRecord[]> => {
    if (isLiveFirestoreActive()) {
      return firestoreDataService.getDeviceRegistrations()
    }
    await delay(150)
    const list = [...MOCK_DEVICE_REGISTRATIONS]
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem('worktrack_registration_record') || localStorage.getItem('worktrack_device_registration')
      if (raw) {
        try {
          const rec = JSON.parse(raw)
          if (rec && rec.deviceId && !list.some(r => r.deviceId === rec.deviceId)) {
            list.push({
              ...rec,
              requestedAt: new Date(rec.requestedAt),
              reviewedAt: rec.reviewedAt ? new Date(rec.reviewedAt) : undefined,
            })
          }
        } catch {}
      }
    }
    return list
  },

  getDeviceRegistration: async (deviceId: string): Promise<DeviceRegistrationRecord | null> => {
    await delay(100)
    const inMem = MOCK_DEVICE_REGISTRATIONS.find(r => r.deviceId === deviceId)
    if (inMem) return inMem
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem('worktrack_registration_record') || localStorage.getItem('worktrack_device_registration')
      if (raw) {
        try {
          const rec = JSON.parse(raw)
          if (rec && rec.deviceId === deviceId) {
            return {
              ...rec,
              requestedAt: new Date(rec.requestedAt),
              reviewedAt: rec.reviewedAt ? new Date(rec.reviewedAt) : undefined,
            }
          }
        } catch {}
      }
    }
    return null
  },

  getDeviceRegistrationByEmployee: async (employeeId: string): Promise<DeviceRegistrationRecord | null> => {
    await delay(100)
    return MOCK_DEVICE_REGISTRATIONS.find(r => r.employeeId === employeeId) ?? null
  },

  approveDeviceRegistration: async (deviceId: string, reviewedBy = 'Admin User'): Promise<DeviceRegistrationRecord> => {
    if (isLiveFirestoreActive()) {
      const res = await firestoreDataService.approveDeviceRegistration(deviceId, reviewedBy)
      if (!res) {
        throw new Error(`Device registration record not found for device: "${deviceId}".`)
      }
      return res
    }
    await delay(150)
    const rec = MOCK_DEVICE_REGISTRATIONS.find(r => r.deviceId === deviceId)
    if (!rec) {
      throw new Error(`Device registration record not found for device: "${deviceId}".`)
    }
    if (rec.status === 'approved') {
      throw new Error(`Duplicate approval rejected: Device "${deviceId}" is already approved.`)
    }
    if (rec.status !== 'pending_approval') {
      throw new Error(`Invalid state transition: Cannot approve device in status "${rec.status}". Only "pending_approval" records may be approved.`)
    }
    rec.status = 'approved'
    rec.reviewedAt = new Date()
    rec.reviewedBy = reviewedBy
    rec.rejectionReason = undefined

    // Update or add corresponding device in MOCK_DEVICES
    const device = MOCK_DEVICES.find(d => d.id === deviceId)
    if (device) {
      device.status = 'online'
      device.lastSeen = new Date()
    } else {
      MOCK_DEVICES.push({
        id: deviceId,
        employeeId: rec.employeeId,
        name: rec.deviceName,
        hostname: rec.hostname || rec.deviceName,
        os: 'windows',
        osVersion: 'Windows 11 Pro',
        appVersion: '1.0.0',
        status: 'online',
        lastSeen: new Date(),
        registeredAt: new Date(),
      })
    }

    return { ...rec }
  },

  rejectDeviceRegistration: async (deviceId: string, reason: string, reviewedBy = 'Admin User'): Promise<DeviceRegistrationRecord> => {
    const trimmedReason = reason?.trim()
    if (!trimmedReason) {
      throw new Error('Rejection failed: A valid rejection reason is required.')
    }

    if (isLiveFirestoreActive()) {
      const res = await firestoreDataService.rejectDeviceRegistration(deviceId, trimmedReason, reviewedBy)
      if (res) return res
    }

    await delay(150)
    const rec = MOCK_DEVICE_REGISTRATIONS.find(r => r.deviceId === deviceId)
    if (!rec) {
      throw new Error(`Device registration record not found for device: "${deviceId}".`)
    }
    if (rec.status === 'rejected') {
      throw new Error(`Duplicate rejection rejected: Device "${deviceId}" is already rejected.`)
    }
    if (rec.status !== 'pending_approval') {
      throw new Error(`Invalid state transition: Cannot reject device in status "${rec.status}". Only "pending_approval" records may be rejected.`)
    }
    rec.status = 'rejected'
    rec.reviewedAt = new Date()
    rec.reviewedBy = reviewedBy
    rec.rejectionReason = trimmedReason

    const device = MOCK_DEVICES.find(d => d.id === deviceId)
    if (device) {
      device.status = 'offline'
    }

    return { ...rec }
  },

  // Reset helper for testing
  resetMockData: async (): Promise<void> => {
    MOCK_EMPLOYEES.length = 0
    MOCK_EMPLOYEES.push(...JSON.parse(INITIAL_EMPLOYEES).map((e: any) => ({
      ...e,
      createdAt: new Date(e.createdAt),
      updatedAt: new Date(e.updatedAt),
    })))

    MOCK_DEVICES.length = 0
    MOCK_DEVICES.push(...JSON.parse(INITIAL_DEVICES).map((d: any) => ({
      ...d,
      lastSeen: new Date(d.lastSeen),
      registeredAt: new Date(d.registeredAt),
    })))

    MOCK_DEVICE_REGISTRATIONS.length = 0
    MOCK_DEVICE_REGISTRATIONS.push(...JSON.parse(INITIAL_REGISTRATIONS).map((r: any) => ({
      ...r,
      requestedAt: new Date(r.requestedAt),
      reviewedAt: r.reviewedAt ? new Date(r.reviewedAt) : undefined,
    })))

    MOCK_SESSIONS.length = 0
    MOCK_SESSIONS.push(...JSON.parse(INITIAL_SESSIONS).map((s: any) => ({
      ...s,
      startedAt: new Date(s.startedAt),
      endedAt: s.endedAt ? new Date(s.endedAt) : undefined,
      pausedAt: s.pausedAt ? new Date(s.pausedAt) : undefined,
      breaks: s.breaks?.map((b: any) => ({
        ...b,
        startedAt: new Date(b.startedAt),
        endedAt: b.endedAt ? new Date(b.endedAt) : undefined,
      })),
    })))

    MOCK_SCREEN_VIEW_REQUESTS.length = 0
    MOCK_SCREEN_VIEW_REQUESTS.push(...JSON.parse(INITIAL_SCREEN_VIEW_REQUESTS).map((r: any) => ({
      ...r,
      requestedAt: new Date(r.requestedAt),
      respondedAt: r.respondedAt ? new Date(r.respondedAt) : undefined,
      endedAt: r.endedAt ? new Date(r.endedAt) : undefined,
      stoppedAt: r.stoppedAt ? new Date(r.stoppedAt) : undefined,
      expiresAt: r.expiresAt ? new Date(r.expiresAt) : undefined,
    })))

    MOCK_PRE_AUTHORIZATIONS.length = 0
    MOCK_PRE_AUTHORIZATIONS.push(...JSON.parse(INITIAL_PRE_AUTHORIZATIONS).map((p: any) => ({
      ...p,
      grantedAt: p.grantedAt ? new Date(p.grantedAt) : undefined,
      revokedAt: p.revokedAt ? new Date(p.revokedAt) : undefined,
      updatedAt: p.updatedAt ? new Date(p.updatedAt) : new Date(),
    })))

    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('worktrack_screen_requests')
      localStorage.removeItem('worktrack_pre_authorizations')
    }
  },

  // Sessions
  getSessions: async (employeeId?: string): Promise<WorkSession[]> => {
    if (isLiveFirestoreActive()) {
      const all = await firestoreDataService.getSessions()
      return employeeId ? all.filter(s => s.employeeId === employeeId) : all
    }
    await delay(150)
    return employeeId
      ? MOCK_SESSIONS.filter(s => s.employeeId === employeeId)
      : [...MOCK_SESSIONS]
  },

  getActiveSessions: async (): Promise<WorkSession[]> => {
    if (isLiveFirestoreActive()) {
      return firestoreDataService.getActiveSessions()
    }
    await delay(100)
    return MOCK_SESSIONS.filter(s => s.status === 'working' || s.status === 'on_break' || s.status === 'active' || s.status === 'paused')
  },

  // Screenshots
  getScreenshots: async (filters?: ScreenshotFilters): Promise<Screenshot[]> => {
    if (isLiveFirestoreActive()) {
      return firestoreDataService.getScreenshots(filters)
    }
    await delay(400)
    let results = [...MOCK_SCREENSHOTS]
    if (filters?.employeeId) {
      results = results.filter(s => s.employeeId === filters.employeeId)
    }
    if (filters?.sessionId) {
      results = results.filter(s => s.sessionId === filters.sessionId)
    }
    if (filters?.dateStr) {
      results = results.filter(s => s.takenAt.toISOString().split('T')[0] === filters.dateStr)
    }
    return results
  },

  subscribeToScreenshots: (
    callback: (screenshots: Screenshot[]) => void,
    filters?: ScreenshotFilters
  ): (() => void) => {
    if (isLiveFirestoreActive()) {
      return firestoreDataService.subscribeToScreenshots(callback, filters)
    }
    // Mock fallback
    dataService.getScreenshots(filters).then(callback)
    return () => {}
  },

  getScreenshotImageUrl: async (screenshot: Screenshot): Promise<string> => {
    if (screenshot.imageUrl && (screenshot.imageUrl.startsWith('http') || screenshot.imageUrl.startsWith('data:'))) {
      return screenshot.imageUrl
    }
    if (screenshot.storagePath && isFirebaseConfigured()) {
      return firestoreDataService.getScreenshotImageUrl(screenshot)
    }
    return screenshot.imageUrl || ''
  },

  deleteScreenshot: async (screenshotId: string, storagePath?: string): Promise<boolean> => {
    if (isLiveFirestoreActive()) {
      return firestoreDataService.deleteScreenshot(screenshotId, storagePath)
    }
    const idx = MOCK_SCREENSHOTS.findIndex(s => s.id === screenshotId)
    if (idx !== -1) {
      MOCK_SCREENSHOTS.splice(idx, 1)
    }
    return true
  },

  // Settings
  getSettings: async (): Promise<MonitoringSettings> => {
    if (isLiveFirestoreActive()) {
      return await firestoreDataService.getSettings()
    }
    await delay(200)
    return { ...MOCK_SETTINGS }
  },

  updateSettings: async (settings: Partial<MonitoringSettings>): Promise<MonitoringSettings> => {
    if (isLiveFirestoreActive()) {
      return await firestoreDataService.updateSettings(settings)
    }
    await delay(400)
    return { ...MOCK_SETTINGS, ...settings, updatedAt: new Date() }
  },

  // Screen View Requests (Phase 6 Monitoring Permissions)
  getScreenViewRequests: async (): Promise<ScreenViewRequest[]> => {
    await delay(150)
    // Sync with localStorage if present
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('worktrack_screen_requests') : null
    if (raw) {
      try {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((r: any) => ({
            ...r,
            requestedAt: new Date(r.requestedAt),
            respondedAt: r.respondedAt ? new Date(r.respondedAt) : undefined,
            endedAt: r.endedAt ? new Date(r.endedAt) : undefined,
            stoppedAt: r.stoppedAt ? new Date(r.stoppedAt) : undefined,
            expiresAt: r.expiresAt ? new Date(r.expiresAt) : undefined,
          }))
        }
      } catch {
        // use memory array
      }
    }
    return [...MOCK_SCREEN_VIEW_REQUESTS]
  },

  getScreenViewRequest: async (id: string): Promise<ScreenViewRequest | null> => {
    await delay(100)
    const all = await dataService.getScreenViewRequests()
    return all.find(r => r.id === id) || null
  },

  getScreenViewRequestByDevice: async (deviceId: string): Promise<ScreenViewRequest | null> => {
    await delay(100)
    const all = await dataService.getScreenViewRequests()
    return all.find(r => r.deviceId === deviceId) || null
  },

  requestScreenView: async (
    employeeId: string,
    deviceId: string,
    options?: { expiresInSeconds?: number; adminName?: string; timestamp?: Date }
  ): Promise<ScreenViewRequest> => {
    await delay(200)

    // 1. Verify device registration state
    const reg = await dataService.getDeviceRegistration(deviceId)
    if (!reg || reg.status !== 'approved') {
      const currentStatus = reg ? reg.status : 'not_registered'
      throw new Error(
        `Cannot request live view: Device must be approved before requesting monitoring permission (current status: "${currentStatus}").`
      )
    }

    // 2. Check for duplicate pending or approved request
    const all = await dataService.getScreenViewRequests()
    const activeExisting = all.find(
      r => r.deviceId === deviceId && (r.status === 'pending' || r.status === 'approved' || r.status === 'active')
    )
    if (activeExisting) {
      throw new Error(`Duplicate request rejected: A monitoring request for device "${deviceId}" is already ${activeExisting.status}.`)
    }

    const emp = await dataService.getEmployee(employeeId)
    const now = options?.timestamp ? new Date(options.timestamp) : new Date()
    const expiresInSec = options?.expiresInSeconds || 60
    const expiresAt = new Date(now.getTime() + expiresInSec * 1000)

    const cryptoObj = typeof window !== 'undefined' ? (window.crypto || (window as any).msCrypto) : null
    const uuid = cryptoObj && cryptoObj.randomUUID
      ? cryptoObj.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

    const newReq: ScreenViewRequest = {
      id: `req_${uuid}`,
      adminId: 'admin_001',
      adminName: options?.adminName || 'Security Admin',
      employeeId,
      employeeName: emp?.name || reg.employeeName,
      deviceId,
      deviceName: reg.deviceName,
      status: 'pending',
      requestedAt: now,
      expiresAt,
      requiresEmployeeApproval: true,
    }

    MOCK_SCREEN_VIEW_REQUESTS.unshift(newReq)

    // Sync to localStorage
    if (typeof localStorage !== 'undefined') {
      const existingRaw = localStorage.getItem('worktrack_screen_requests')
      const existingList = existingRaw ? JSON.parse(existingRaw) : []
      const serialized = {
        ...newReq,
        requestedAt: newReq.requestedAt.toISOString(),
        expiresAt: newReq.expiresAt ? newReq.expiresAt.toISOString() : undefined,
      }
      localStorage.setItem('worktrack_screen_requests', JSON.stringify([serialized, ...existingList]))
    }

    return { ...newReq }
  },

  cancelScreenViewRequest: async (requestId: string): Promise<ScreenViewRequest> => {
    await delay(150)
    const all = await dataService.getScreenViewRequests()
    const req = all.find(r => r.id === requestId)
    if (!req) {
      throw new Error(`Screen view request "${requestId}" not found.`)
    }
    if (req.status !== 'pending') {
      throw new Error(`Invalid state transition: Cannot cancel request in status "${req.status}". Only pending requests can be cancelled.`)
    }

    req.status = 'cancelled'
    req.endedAt = new Date()

    // Update in-memory and storage
    const inMem = MOCK_SCREEN_VIEW_REQUESTS.find(r => r.id === requestId)
    if (inMem) {
      inMem.status = 'cancelled'
      inMem.endedAt = req.endedAt
    }

    if (typeof localStorage !== 'undefined') {
      const updated = all.map(r => (r.id === requestId ? req : r))
      localStorage.setItem('worktrack_screen_requests', JSON.stringify(updated))
    }

    return { ...req }
  },

  stopScreenView: async (requestId: string, stoppedBy: 'admin' | 'employee' = 'admin'): Promise<ScreenViewRequest> => {
    await delay(150)
    const all = await dataService.getScreenViewRequests()
    const req = all.find(r => r.id === requestId)
    if (!req) {
      throw new Error(`Screen view request "${requestId}" not found.`)
    }
    if (req.status !== 'approved' && req.status !== 'active') {
      throw new Error(`Invalid state transition: Cannot stop view in status "${req.status}". Must be approved.`)
    }

    req.status = 'stopped'
    req.stoppedAt = new Date()
    req.endedAt = new Date()
    req.stoppedBy = stoppedBy

    const inMem = MOCK_SCREEN_VIEW_REQUESTS.find(r => r.id === requestId)
    if (inMem) {
      inMem.status = 'stopped'
      inMem.stoppedAt = req.stoppedAt
      inMem.endedAt = req.endedAt
      inMem.stoppedBy = stoppedBy
    }

    if (typeof localStorage !== 'undefined') {
      const updated = all.map(r => (r.id === requestId ? req : r))
      localStorage.setItem('worktrack_screen_requests', JSON.stringify(updated))
    }

    return { ...req }
  },

  // Pre-Authorization Policies & One-Click Live View
  getPreAuthorizations: async (): Promise<PreAuthorizationRecord[]> => {
    await delay(100)
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem('worktrack_pre_authorizations')
      if (raw) {
        try {
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed)) {
            return parsed.map((item: any) => ({
              ...item,
              grantedAt: item.grantedAt ? new Date(item.grantedAt) : undefined,
              revokedAt: item.revokedAt ? new Date(item.revokedAt) : undefined,
              updatedAt: item.updatedAt ? new Date(item.updatedAt) : new Date(),
            }))
          }
        } catch {}
      }
    }
    return [...MOCK_PRE_AUTHORIZATIONS]
  },

  getPreAuthorization: async (deviceId: string): Promise<PreAuthorizationRecord | null> => {
    const all = await dataService.getPreAuthorizations()
    return all.find(r => r.deviceId === deviceId) || null
  },

  grantPreAuthorization: async (payload: {
    employeeId: string
    employeeName?: string
    deviceId: string
    deviceName?: string
    adminName?: string
    policyVersion?: string
    timestamp?: Date
  }): Promise<PreAuthorizationRecord> => {
    await delay(150)
    const reg = await dataService.getDeviceRegistration(payload.deviceId)
    if (!reg || reg.status !== 'approved') {
      const status = reg ? reg.status : 'not_registered'
      throw new Error(
        `Cannot grant pre-authorization: Device registration status is "${status}". Only approved devices can grant monitoring authorization.`
      )
    }

    const now = payload.timestamp ? new Date(payload.timestamp) : new Date()
    const all = await dataService.getPreAuthorizations()
    const existingIndex = all.findIndex(r => r.deviceId === payload.deviceId)
    const rec: PreAuthorizationRecord = {
      id: existingIndex >= 0 ? all[existingIndex].id : `auth_${payload.deviceId}`,
      employeeId: payload.employeeId,
      employeeName: payload.employeeName || reg.employeeName,
      deviceId: payload.deviceId,
      deviceName: payload.deviceName || reg.deviceName,
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
      all[existingIndex] = rec
    } else {
      all.unshift(rec)
    }

    const inMemIdx = MOCK_PRE_AUTHORIZATIONS.findIndex(r => r.deviceId === payload.deviceId)
    if (inMemIdx >= 0) {
      MOCK_PRE_AUTHORIZATIONS[inMemIdx] = rec
    } else {
      MOCK_PRE_AUTHORIZATIONS.unshift(rec)
    }

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('worktrack_pre_authorizations', JSON.stringify(all))
    }

    return { ...rec }
  },

  revokePreAuthorization: async (
    deviceId: string,
    revokedBy: 'admin' | 'employee' = 'admin',
    reason?: string,
    timestamp?: Date
  ): Promise<PreAuthorizationRecord> => {
    await delay(150)
    const now = timestamp ? new Date(timestamp) : new Date()
    const all = await dataService.getPreAuthorizations()
    let rec = all.find(r => r.deviceId === deviceId)

    if (!rec) {
      rec = {
        id: `auth_${deviceId}`,
        employeeId: '',
        deviceId,
        status: 'revoked',
        policyVersion: CURRENT_PRE_AUTH_POLICY.version,
        revokedAt: now,
        revokedBy,
        revocationReason: reason,
        updatedAt: now,
      }
      all.unshift(rec)
    } else {
      rec.status = 'revoked'
      rec.revokedAt = now
      rec.revokedBy = revokedBy
      rec.revocationReason = reason
      rec.updatedAt = now
    }

    const inMem = MOCK_PRE_AUTHORIZATIONS.find(r => r.deviceId === deviceId)
    if (inMem) {
      inMem.status = 'revoked'
      inMem.revokedAt = now
      inMem.revokedBy = revokedBy
      inMem.revocationReason = reason
      inMem.updatedAt = now
    } else {
      MOCK_PRE_AUTHORIZATIONS.unshift({ ...rec })
    }

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('worktrack_pre_authorizations', JSON.stringify(all))
    }

    // Terminate any active screen view session for this device
    const activeReq = (await dataService.getScreenViewRequests()).find(
      r => r.deviceId === deviceId && (r.status === 'approved' || r.status === 'active')
    )
    if (activeReq) {
      await dataService.stopScreenView(activeReq.id, revokedBy)
    }

    return { ...rec }
  },

  startPreAuthorizedSession: async (
    employeeId: string,
    deviceId: string,
    options?: { adminName?: string; timestamp?: Date }
  ): Promise<ScreenViewRequest> => {
    await delay(200)

    // 1. Verify device registration state
    const reg = await dataService.getDeviceRegistration(deviceId)
    if (!reg || reg.status !== 'approved') {
      const currentStatus = reg ? reg.status : 'not_registered'
      throw new Error(
        `Cannot start viewing session: Device registration is "${currentStatus}". Only approved devices are eligible for live monitoring.`
      )
    }

    // 2. Check pre-authorization policy status
    const auth = await dataService.getPreAuthorization(deviceId)
    if (!auth || auth.status !== 'granted') {
      const authStatus = auth ? auth.status : 'not_configured'
      throw new Error(
        `Pre-authorized viewing blocked: Employee has not granted active monitoring authorization (status: "${authStatus}").`
      )
    }

    // 3. Prevent duplicate active sessions
    const all = await dataService.getScreenViewRequests()
    const activeExisting = all.find(
      r => r.deviceId === deviceId && (r.status === 'approved' || r.status === 'active' || r.status === 'pending')
    )
    if (activeExisting) {
      throw new Error(
        `Duplicate session rejected: A screen viewing session for device "${deviceId}" is already active (Session: ${activeExisting.id}).`
      )
    }

    const emp = await dataService.getEmployee(employeeId)
    const now = options?.timestamp ? new Date(options.timestamp) : new Date()

    const cryptoObj = typeof window !== 'undefined' ? (window.crypto || (window as any).msCrypto) : null
    const uuid = cryptoObj && cryptoObj.randomUUID
      ? cryptoObj.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

    const newReq: ScreenViewRequest = {
      id: `req_oneclick_${uuid}`,
      adminId: 'admin_001',
      adminName: options?.adminName || 'Security Admin',
      employeeId,
      employeeName: emp?.name || reg.employeeName,
      deviceId,
      deviceName: reg.deviceName,
      status: 'approved',
      isPreAuthorized: true,
      authorizationPolicyVersion: auth.policyVersion,
      requiresEmployeeApproval: false,
      requestedAt: now,
      respondedAt: now,
    }

    MOCK_SCREEN_VIEW_REQUESTS.unshift(newReq)

    // Sync to localStorage
    if (typeof localStorage !== 'undefined') {
      const existingRaw = localStorage.getItem('worktrack_screen_requests')
      const existingList = existingRaw ? JSON.parse(existingRaw) : []
      const serialized = {
        ...newReq,
        requestedAt: newReq.requestedAt.toISOString(),
        respondedAt: newReq.respondedAt ? newReq.respondedAt.toISOString() : undefined,
        expiresAt: newReq.expiresAt ? newReq.expiresAt.toISOString() : undefined,
      }
      localStorage.setItem('worktrack_screen_requests', JSON.stringify([serialized, ...existingList]))
    }

    return { ...newReq }
  },

  // Summaries (for reports) — real Firestore data
  getDailySummaries: async (employeeId?: string): Promise<DailySummary[]> => {
    if (isLiveFirestoreActive()) {
      return firestoreDataService.getDailySummaries(employeeId)
    }
    return []
  },

  // App & Web Usage Analytics — real Firestore data
  getAppUsages: async (employeeId?: string): Promise<AppUsage[]> => {
    if (isLiveFirestoreActive()) {
      return firestoreDataService.getAppUsages(employeeId)
    }
    return []
  },

  getWebUsages: async (employeeId?: string): Promise<WebUsage[]> => {
    if (isLiveFirestoreActive()) {
      return firestoreDataService.getWebUsages(employeeId)
    }
    return []
  },

  getActivityMetrics: async (): Promise<ActivityMetric[]> => {
    if (isLiveFirestoreActive()) {
      return firestoreDataService.getActivityMetrics()
    }
    return []
  },

  // Approval queue
  getApprovalRequests: async (): Promise<ApprovalRequest[]> => {
    if (isLiveFirestoreActive()) {
      return firestoreDataService.getApprovalRequests()
    }
    await delay(200)
    return [...MOCK_APPROVAL_REQUESTS]
  },

  resolveApprovalRequest: async (
    id: string,
    status: 'approved' | 'rejected'
  ): Promise<boolean> => {
    await delay(300)
    const req = MOCK_APPROVAL_REQUESTS.find(r => r.id === id)
    if (req) {
      req.status = status
      req.resolvedAt = new Date()
      req.resolvedBy = 'Admin User'
      return true
    }
    return false
  },
}

export const MOCK_APP_USAGES: AppUsage[] = [
  {
    id: 'app_1',
    employeeId: 'emp_001',
    appName: 'Visual Studio Code',
    windowTitle: 'WorkTrack Pro — frontend/src/App.tsx',
    durationSeconds: 14200,
    category: 'productive',
    productivityScore: 98,
  },
  {
    id: 'app_2',
    employeeId: 'emp_001',
    appName: 'Slack',
    windowTitle: '#eng-team discussion — Sprint 14',
    durationSeconds: 4300,
    category: 'productive',
    productivityScore: 88,
  },
  {
    id: 'app_3',
    employeeId: 'emp_001',
    appName: 'Google Chrome',
    windowTitle: 'GitHub — Pull Request #42: Realtime Live Sync',
    durationSeconds: 6100,
    category: 'productive',
    productivityScore: 92,
  },
  {
    id: 'app_4',
    employeeId: 'emp_002',
    appName: 'Figma',
    windowTitle: 'WorkTrack Pro UI/UX Design System v2.0',
    durationSeconds: 16800,
    category: 'productive',
    productivityScore: 99,
  },
  {
    id: 'app_5',
    employeeId: 'emp_003',
    appName: 'Postman',
    windowTitle: 'API Gateway Test Suite — WorkTrack Endpoints',
    durationSeconds: 5200,
    category: 'productive',
    productivityScore: 95,
  },
  {
    id: 'app_6',
    employeeId: 'emp_001',
    appName: 'Spotify',
    windowTitle: 'Deep Focus Chill Lo-Fi Beats',
    durationSeconds: 7200,
    category: 'neutral',
    productivityScore: 65,
  },
  {
    id: 'app_7',
    employeeId: 'emp_004',
    appName: 'Microsoft Excel',
    windowTitle: 'Q4 Operations Budget & Resource Allocations.xlsx',
    durationSeconds: 11400,
    category: 'productive',
    productivityScore: 94,
  },
  {
    id: 'app_8',
    employeeId: 'emp_005',
    appName: 'Notion',
    windowTitle: 'Campaign Strategy 2024 — Growth Roadmaps',
    durationSeconds: 9800,
    category: 'productive',
    productivityScore: 90,
  },
]

export const MOCK_WEB_USAGES: WebUsage[] = [
  {
    id: 'web_1',
    employeeId: 'emp_001',
    domain: 'github.com',
    title: 'WorkTrack Pro Repository — Issues and Pull Requests',
    durationSeconds: 5800,
    category: 'productive',
    visitCount: 24,
  },
  {
    id: 'web_2',
    employeeId: 'emp_001',
    domain: 'stackoverflow.com',
    title: 'Electron desktopCapturer getUserMedia stream resolution',
    durationSeconds: 2100,
    category: 'productive',
    visitCount: 12,
  },
  {
    id: 'web_3',
    employeeId: 'emp_002',
    domain: 'figma.com',
    title: 'Design Files — WorkTrack Pro Component Tokens',
    durationSeconds: 7400,
    category: 'productive',
    visitCount: 18,
  },
  {
    id: 'web_4',
    employeeId: 'emp_001',
    domain: 'tailwindcss.com',
    title: 'Documentation — Tailwind CSS v3 Reference',
    durationSeconds: 1400,
    category: 'productive',
    visitCount: 9,
  },
  {
    id: 'web_5',
    employeeId: 'emp_003',
    domain: 'aws.amazon.com',
    title: 'AWS Console — CloudWatch Monitoring Metrics',
    durationSeconds: 3200,
    category: 'productive',
    visitCount: 8,
  },
  {
    id: 'web_6',
    employeeId: 'emp_005',
    domain: 'youtube.com',
    title: 'Product Design Trends 2024 Showcase',
    durationSeconds: 1200,
    category: 'neutral',
    visitCount: 3,
  },
]

export const MOCK_ACTIVITY_METRICS: ActivityMetric[] = [
  { timestamp: '09:00', activeMinutes: 48, idleMinutes: 12, keystrokes: 1820, mouseClicks: 540, productivityScore: 92 },
  { timestamp: '10:00', activeMinutes: 55, idleMinutes: 5,  keystrokes: 2410, mouseClicks: 710, productivityScore: 96 },
  { timestamp: '11:00', activeMinutes: 52, idleMinutes: 8,  keystrokes: 2100, mouseClicks: 620, productivityScore: 94 },
  { timestamp: '12:00', activeMinutes: 30, idleMinutes: 30, keystrokes: 980,  mouseClicks: 290, productivityScore: 78 },
  { timestamp: '13:00', activeMinutes: 20, idleMinutes: 40, keystrokes: 620,  mouseClicks: 180, productivityScore: 65 },
  { timestamp: '14:00', activeMinutes: 54, idleMinutes: 6,  keystrokes: 2650, mouseClicks: 780, productivityScore: 97 },
  { timestamp: '15:00', activeMinutes: 50, idleMinutes: 10, keystrokes: 2200, mouseClicks: 690, productivityScore: 93 },
  { timestamp: '16:00', activeMinutes: 47, idleMinutes: 13, keystrokes: 1950, mouseClicks: 590, productivityScore: 90 },
  { timestamp: '17:00', activeMinutes: 42, idleMinutes: 18, keystrokes: 1480, mouseClicks: 430, productivityScore: 86 },
]

export const MOCK_APPROVAL_REQUESTS: ApprovalRequest[] = [
  {
    id: 'appr_001',
    employeeId: 'emp_001',
    employeeName: 'Sarah Johnson',
    department: 'Engineering',
    type: 'overtime',
    title: 'Overtime Tracking Approval (2 Hours)',
    description: 'Critical bugfix deployment for release v1.0.2 hotfix patch after regular 6:00 PM cutoff.',
    requestedAt: new Date(Date.now() - 45 * 60_000),
    status: 'pending',
    urgency: 'high',
  },
  {
    id: 'appr_002',
    employeeId: 'emp_003',
    employeeName: 'Priya Sharma',
    department: 'Engineering',
    type: 'access',
    title: 'Elevated Debugger Port Access',
    description: 'Requesting permission to run local reverse-proxy daemon on port 8080 during session.',
    requestedAt: new Date(Date.now() - 110 * 60_000),
    status: 'pending',
    urgency: 'medium',
  },
  {
    id: 'appr_003',
    employeeId: 'emp_002',
    employeeName: 'Marcus Chen',
    department: 'Design',
    type: 'privacy_review',
    title: 'Screenshot Redaction Request',
    description: 'Private banking tab was momentarily visible on dual monitor during 11:32 AM screenshot.',
    requestedAt: new Date(Date.now() - 180 * 60_000),
    status: 'pending',
    urgency: 'high',
  },
  {
    id: 'appr_004',
    employeeId: 'emp_005',
    employeeName: 'Aisha Patel',
    department: 'Marketing',
    type: 'off_track_alert',
    title: 'Off-Track Threshold Exceeded (Automatic Notice)',
    description: 'System detected 25 minutes on unclassified streaming media domain during active work session.',
    requestedAt: new Date(Date.now() - 240 * 60_000),
    status: 'pending',
    urgency: 'low',
  },
]


// ─── Helpers ─────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function generateMockDailySummaries(employeeId?: string): DailySummary[] {
  const employees = employeeId ? [employeeId] : MOCK_EMPLOYEES.map(e => e.id)
  const summaries: DailySummary[] = []

  for (const empId of employees) {
    for (let i = 0; i < 7; i++) {
      const date = new Date(Date.now() - i * 24 * 60 * 60_000)
      const dateStr = date.toISOString().split('T')[0]!
      const isWeekend = date.getDay() === 0 || date.getDay() === 6
      summaries.push({
        date: dateStr,
        employeeId: empId,
        totalSessionSeconds: isWeekend ? 0 : Math.floor(Math.random() * 3 * 3600 + 5 * 3600),
        sessionCount: isWeekend ? 0 : Math.floor(Math.random() * 2 + 1),
        screenshotCount: isWeekend ? 0 : Math.floor(Math.random() * 20 + 10),
        deviceIds: MOCK_DEVICES.filter(d => d.employeeId === empId).map(d => d.id),
      })
    }
  }
  return summaries
}
