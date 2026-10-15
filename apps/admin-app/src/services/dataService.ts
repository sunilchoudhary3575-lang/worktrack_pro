import type {
  Employee,
  Device,
  WorkSession,
  Screenshot,
  MonitoringSettings,
  DailySummary,
  WeeklySummary,
  ScreenViewRequest,
  AppUsage,
  WebUsage,
  ActivityMetric,
  ApprovalRequest,
} from '@worktrack-pro/shared'

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
]

export const MOCK_SESSIONS: WorkSession[] = [
  {
    id: 'sess_001',
    employeeId: 'emp_001',
    deviceId: 'dev_001',
    status: 'active',
    startedAt: new Date(Date.now() - 3 * 60 * 60_000),
  },
  {
    id: 'sess_002',
    employeeId: 'emp_002',
    deviceId: 'dev_002',
    status: 'active',
    startedAt: new Date(Date.now() - 5 * 60 * 60_000),
  },
  {
    id: 'sess_003',
    employeeId: 'emp_005',
    deviceId: 'dev_005',
    status: 'active',
    startedAt: new Date(Date.now() - 1.5 * 60 * 60_000),
  },
  {
    id: 'sess_004',
    employeeId: 'emp_001',
    deviceId: 'dev_001',
    status: 'ended',
    startedAt: new Date(Date.now() - 28 * 60 * 60_000),
    endedAt: new Date(Date.now() - 20 * 60 * 60_000),
    durationSeconds: 8 * 3600,
  },
  {
    id: 'sess_005',
    employeeId: 'emp_003',
    deviceId: 'dev_003',
    status: 'ended',
    startedAt: new Date(Date.now() - 26 * 60 * 60_000),
    endedAt: new Date(Date.now() - 18 * 60 * 60_000),
    durationSeconds: 6.5 * 3600,
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

// ─── Data Service Interface ───────────────────────────────────
// Replace the mock implementations below with Firebase calls in Phase 2.
// Keep function signatures identical to avoid breaking callers.

export const dataService = {
  // Employees
  getEmployees: async (): Promise<Employee[]> => {
    await delay(300)
    return [...MOCK_EMPLOYEES]
  },

  getEmployee: async (id: string): Promise<Employee | null> => {
    await delay(150)
    return MOCK_EMPLOYEES.find(e => e.id === id) ?? null
  },

  // Devices
  getDevices: async (): Promise<Device[]> => {
    await delay(300)
    return [...MOCK_DEVICES]
  },

  getDevicesByEmployee: async (employeeId: string): Promise<Device[]> => {
    await delay(150)
    return MOCK_DEVICES.filter(d => d.employeeId === employeeId)
  },

  // Sessions
  getSessions: async (employeeId?: string): Promise<WorkSession[]> => {
    await delay(300)
    return employeeId
      ? MOCK_SESSIONS.filter(s => s.employeeId === employeeId)
      : [...MOCK_SESSIONS]
  },

  getActiveSessions: async (): Promise<WorkSession[]> => {
    await delay(200)
    return MOCK_SESSIONS.filter(s => s.status === 'active')
  },

  // Screenshots
  getScreenshots: async (filters?: { employeeId?: string; date?: string }): Promise<Screenshot[]> => {
    await delay(400)
    let results = [...MOCK_SCREENSHOTS]
    if (filters?.employeeId) {
      results = results.filter(s => s.employeeId === filters.employeeId)
    }
    return results
  },

  // Settings
  getSettings: async (): Promise<MonitoringSettings> => {
    await delay(200)
    return { ...MOCK_SETTINGS }
  },

  updateSettings: async (settings: Partial<MonitoringSettings>): Promise<MonitoringSettings> => {
    await delay(400)
    return { ...MOCK_SETTINGS, ...settings, updatedAt: new Date() }
  },

  // Screen View Requests
  requestScreenView: async (employeeId: string, deviceId: string): Promise<ScreenViewRequest> => {
    await delay(500)
    return {
      id: `req_${Date.now()}`,
      adminId: 'admin_001',
      employeeId,
      deviceId,
      status: 'pending',
      requestedAt: new Date(),
      expiresAt: new Date(Date.now() + 30_000),
      requiresEmployeeApproval: true,
    }
  },

  // Summaries (for reports)
  getDailySummaries: async (employeeId?: string): Promise<DailySummary[]> => {
    await delay(300)
    return generateMockDailySummaries(employeeId)
  },

  // App & Web Usage Analytics
  getAppUsages: async (employeeId?: string): Promise<AppUsage[]> => {
    await delay(200)
    if (!employeeId) return MOCK_APP_USAGES
    return MOCK_APP_USAGES.filter(a => a.employeeId === employeeId)
  },

  getWebUsages: async (employeeId?: string): Promise<WebUsage[]> => {
    await delay(200)
    if (!employeeId) return MOCK_WEB_USAGES
    return MOCK_WEB_USAGES.filter(w => w.employeeId === employeeId)
  },

  getActivityMetrics: async (): Promise<ActivityMetric[]> => {
    await delay(200)
    return MOCK_ACTIVITY_METRICS
  },

  // Approval queue
  getApprovalRequests: async (): Promise<ApprovalRequest[]> => {
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
