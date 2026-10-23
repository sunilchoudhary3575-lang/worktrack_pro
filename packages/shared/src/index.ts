// ============================================================
// WorkTrack Pro — Shared Types & Interfaces
// Phase 1: Foundation types (no Firebase dependencies)
// ============================================================

// ─── Connection & Status ────────────────────────────────────

export type ConnectionState = 'connected' | 'connecting' | 'disconnected' | 'error';

export interface ConnectionStatus {
  state: ConnectionState;
  lastSeen?: Date;
  latencyMs?: number;
  error?: string;
}

// ─── Employee ───────────────────────────────────────────────

export type EmployeeRole = 'employee' | 'admin' | 'manager';

export interface Employee {
  id: string;
  name: string;
  email: string;
  role: EmployeeRole;
  department?: string;
  avatarUrl?: string;
  createdAt: Date;
  updatedAt: Date;
  userId?: string;
  status?: 'active' | 'inactive' | 'suspended';
}

// ─── Distinct System & UI Status States ───────────────────────

export type AccountStatus = 'activated' | 'not_activated' | 'disabled';
export type DeviceApprovalState = 'pending' | 'approved' | 'rejected' | 'unregistered';
export type PresenceStatus = 'online' | 'offline' | 'unknown';
export type SessionState = 'working' | 'on_break' | 'ended' | 'no_session';

export const PRESENCE_EXPIRY_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutes
export const HEARTBEAT_INTERVAL_MS = 60 * 1000; // 60 seconds

export function deriveAccountStatus(
  employee?: { userId?: string; status?: string } | null,
  userAccount?: { status?: string; uid?: string } | null
): AccountStatus {
  if (userAccount?.status === 'disabled' || employee?.status === 'suspended' || employee?.status === 'inactive') {
    return 'disabled';
  }
  if (employee?.userId || userAccount?.uid) {
    return 'activated';
  }
  return 'not_activated';
}

export function deriveDeviceApprovalState(
  device?: { approvalStatus?: string; status?: string } | null,
  registration?: { status?: string } | null
): DeviceApprovalState {
  const st = (device?.approvalStatus || registration?.status || '').toLowerCase();
  if (st === 'approved') return 'approved';
  if (st === 'pending' || st === 'pending_approval') return 'pending';
  if (st === 'rejected') return 'rejected';
  return 'unregistered';
}

export function derivePresenceStatus(
  lastHeartbeat: Date | string | number | undefined | null,
  now: Date = new Date(),
  thresholdMs = PRESENCE_EXPIRY_THRESHOLD_MS
): PresenceStatus {
  if (!lastHeartbeat) return 'unknown';
  const hbDate = parseDate(lastHeartbeat as any);
  if (!hbDate) return 'unknown';
  const diff = now.getTime() - hbDate.getTime();
  // Allow slight clock skew forward up to thresholdMs
  if (diff >= -thresholdMs && diff <= thresholdMs) {
    return 'online';
  }
  return 'offline';
}

export function deriveEmployeePresence(
  devices: Array<{ lastHeartbeat?: any; lastSeen?: any; status?: string }> | undefined | null,
  userLastActive?: any,
  now: Date = new Date(),
  thresholdMs = PRESENCE_EXPIRY_THRESHOLD_MS
): PresenceStatus {
  const devs = devices || [];
  let hasKnownHeartbeat = false;
  let anyOnline = false;

  for (const dev of devs) {
    const hb = dev.lastHeartbeat || dev.lastSeen;
    if (hb) {
      hasKnownHeartbeat = true;
      const status = derivePresenceStatus(hb, now, thresholdMs);
      if (status === 'online') {
        anyOnline = true;
      }
    }
  }

  if (anyOnline) {
    return 'online';
  }

  if (hasKnownHeartbeat) {
    return 'offline';
  }

  if (userLastActive) {
    return derivePresenceStatus(userLastActive, now, thresholdMs);
  }

  return 'unknown';
}

export function deriveSessionState(
  session?: { status?: string; endedAt?: any } | null
): SessionState {
  if (!session) return 'no_session';
  const st = (session.status || '').toLowerCase();
  if (st === 'working' || st === 'active') return 'working';
  if (st === 'on_break' || st === 'paused') return 'on_break';
  if (st === 'ended' || st === 'completed') return 'ended';
  return 'no_session';
}

// ─── Device ─────────────────────────────────────────────────

export type DeviceStatus = 'online' | 'offline' | 'idle';
export type OsType = 'windows' | 'macos' | 'linux';

export type DeviceRegistrationStatus =
  | 'not_registered'
  | 'pending_approval'
  | 'approved'
  | 'rejected';

export interface DeviceRegistrationRecord {
  deviceId: string;
  deviceName: string;
  hostname: string;
  employeeId: string;
  employeeName: string;
  department?: string;
  status: DeviceRegistrationStatus;
  requestedAt: Date | string;
  reviewedAt?: Date | string;
  reviewedBy?: string;
  rejectionReason?: string;
}

export interface Device {
  id: string;
  employeeId: string;
  name: string;
  hostname: string;
  os: OsType;
  osVersion: string;
  appVersion: string;
  status: DeviceStatus;
  approvalStatus?: DeviceRegistrationStatus;
  ipAddress?: string;
  lastSeen: Date;
  lastHeartbeat?: Date;
  registeredAt: Date;
  reviewedAt?: Date | string;
  reviewedBy?: string;
  rejectionReason?: string;
}

// ─── Employee Break ─────────────────────────────────────────

export type BreakReason = 'lunch' | 'coffee' | 'personal' | 'other' | 'meeting' | string;

export interface EmployeeBreak {
  id: string;
  reason: BreakReason;
  customReason?: string;
  startedAt: Date;
  endedAt?: Date;
  durationSeconds?: number;
}

// ─── Work Session ────────────────────────────────────────────

export type WorkSessionState = 'not_started' | 'working' | 'on_break' | 'ended';
export type SessionStatus = WorkSessionState | 'active' | 'paused';

export interface WorkSession {
  id: string;
  employeeId: string;
  deviceId: string;
  status: SessionStatus;
  startedAt: Date;
  endedAt?: Date;
  pausedAt?: Date;
  durationSeconds?: number;
  workDurationSeconds?: number;
  breakDurationSeconds?: number;
  breaks?: EmployeeBreak[];
  notes?: string;
}

export interface SerializedEmployeeBreak {
  id: string;
  reason: BreakReason;
  customReason?: string;
  startedAt: string;
  endedAt?: string;
  durationSeconds?: number;
}

export interface SerializedWorkSession {
  id: string;
  employeeId: string;
  deviceId: string;
  status: SessionStatus;
  startedAt: string;
  endedAt?: string;
  pausedAt?: string;
  durationSeconds?: number;
  workDurationSeconds?: number;
  breakDurationSeconds?: number;
  breaks?: SerializedEmployeeBreak[];
  notes?: string;
}

// ─── Time Calculation Helpers (Timestamp source of truth) ──

export function parseDate(val: any): Date | undefined {
  if (!val) return undefined;
  if (val instanceof Date) return isNaN(val.getTime()) ? undefined : val;
  if (typeof val?.toDate === 'function') {
    try {
      const d = val.toDate();
      if (d instanceof Date && !isNaN(d.getTime())) return d;
    } catch {}
  }
  if (typeof val === 'object' && typeof val?.seconds === 'number') {
    const ms = val.seconds * 1000 + (val.nanoseconds ? Math.floor(val.nanoseconds / 1e6) : 0);
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d;
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? undefined : d;
}

export function calcSessionElapsedDuration(
  session: Pick<WorkSession, 'startedAt' | 'endedAt'>,
  now: Date = new Date()
): number {
  const start = parseDate(session.startedAt);
  if (!start) return 0;
  const end = session.endedAt ? parseDate(session.endedAt) : parseDate(now);
  if (!end || end.getTime() < start.getTime()) return 0;
  return Math.floor((end.getTime() - start.getTime()) / 1000);
}

export function calcBreakDuration(
  b: EmployeeBreak,
  now: Date = new Date()
): number {
  const start = parseDate(b.startedAt);
  if (!start) return 0;
  const end = b.endedAt ? parseDate(b.endedAt) : parseDate(now);
  if (!end || end.getTime() < start.getTime()) return 0;
  return Math.floor((end.getTime() - start.getTime()) / 1000);
}

export function calcTotalBreakDuration(
  breaks?: EmployeeBreak[],
  now: Date = new Date()
): number {
  if (!breaks || !Array.isArray(breaks)) return 0;
  return breaks.reduce((total, b) => total + calcBreakDuration(b, now), 0);
}

export function calcWorkDuration(
  session: WorkSession,
  now: Date = new Date()
): number {
  const elapsed = calcSessionElapsedDuration(session, now);
  const totalBreak = calcTotalBreakDuration(session.breaks, now);
  return Math.max(0, elapsed - totalBreak);
}

export function calculateSessionDurations(
  session: WorkSession,
  now: Date = new Date()
): {
  elapsedSeconds: number;
  breakSeconds: number;
  workSeconds: number;
} {
  const elapsedSeconds = calcSessionElapsedDuration(session, now);
  const breakSeconds = calcTotalBreakDuration(session.breaks, now);
  const workSeconds = Math.max(0, elapsedSeconds - breakSeconds);
  return { elapsedSeconds, breakSeconds, workSeconds };
}

// ─── Screenshot ──────────────────────────────────────────────

export type ScreenshotUploadStatus = 'uploaded' | 'pending' | 'failed';
export type ScreenshotImageFormat = 'png' | 'jpg' | 'jpeg';

export interface Screenshot {
  id: string;
  sessionId: string;
  employeeId: string;
  employeeName?: string;
  userId?: string;
  deviceId: string;
  takenAt: Date;
  createdAt?: Date;
  imageUrl: string;
  storagePath?: string;
  thumbnailUrl?: string;
  fileSizeBytes?: number;
  width?: number;
  height?: number;
  format?: ScreenshotImageFormat;
  status?: ScreenshotUploadStatus;
  retryCount?: number;
}

export interface SerializedScreenshot {
  id: string;
  sessionId: string;
  employeeId: string;
  employeeName?: string;
  userId: string;
  deviceId: string;
  takenAt: string;
  createdAt: string;
  imageUrl?: string;
  storagePath: string;
  downloadUrl?: string;
  fileSizeBytes: number;
  width: number;
  height: number;
  format: ScreenshotImageFormat;
  status: ScreenshotUploadStatus;
}

export interface ScreenshotOutboxItem {
  id: string;
  sessionId: string;
  employeeId: string;
  employeeName?: string;
  userId: string;
  deviceId: string;
  takenAt: string;
  storagePath: string;
  dataUrl?: string;
  filePath?: string;
  fileSizeBytes: number;
  width: number;
  height: number;
  format: ScreenshotImageFormat;
  status: 'pending' | 'failed';
  retryCount: number;
  lastAttemptAt?: string;
  lastError?: string;
}

export interface ScreenshotFilters {
  employeeId?: string;
  sessionId?: string;
  dateStr?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

// ─── Pre-Authorized Monitoring Policy ─────────────────────────

export type PreAuthorizationStatus = 'granted' | 'revoked' | 'none';

export interface PreAuthorizationPolicy {
  version: string;
  name: string;
  scope: string[];
  description: string;
}

export const CURRENT_PRE_AUTH_POLICY: PreAuthorizationPolicy = {
  version: 'v1.0-standard-oversight',
  name: 'Standard Workplace Oversight Policy',
  scope: [
    'Allows authorized security administrators to initiate immediate live screen viewing sessions during active work.',
    'A prominent visual indicator is displayed to the employee during every active session.',
    'Employee retains the right to stop any active session immediately and revoke authorization at any time.',
    'No recording during breaks, no covert monitoring, no keylogging, and no password collection.',
  ],
  description:
    'Enables pre-authorized, one-click live screen verification for authorized administrators without requiring per-session manual confirmation prompts. Active monitoring remains 100% visible.',
};

export interface PreAuthorizationRecord {
  id: string;
  employeeId: string;
  employeeName?: string;
  deviceId: string;
  deviceName?: string;
  status: PreAuthorizationStatus;
  policyVersion: string;
  grantedAt?: Date;
  grantedByAdminId?: string;
  grantedByAdminName?: string;
  revokedAt?: Date;
  revokedBy?: 'employee' | 'admin';
  revocationReason?: string;
  updatedAt: Date;
}

export interface SerializedPreAuthorizationRecord {
  id: string;
  employeeId: string;
  employeeName?: string;
  deviceId: string;
  deviceName?: string;
  status: PreAuthorizationStatus;
  policyVersion: string;
  grantedAt?: string;
  grantedByAdminId?: string;
  grantedByAdminName?: string;
  revokedAt?: string;
  revokedBy?: 'employee' | 'admin';
  revocationReason?: string;
  updatedAt: string;
}

// ─── Screen View & Monitoring Permission Request ─────────────

export type MonitoringPermissionStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'expired'
  | 'stopped';

export type ScreenViewRequestStatus =
  | MonitoringPermissionStatus
  | 'denied'
  | 'active'
  | 'ended';

export interface ScreenViewRequest {
  id: string;
  adminId: string;
  adminName?: string;
  employeeId: string;
  employeeName?: string;
  deviceId: string;
  deviceName?: string;
  status: ScreenViewRequestStatus;
  requestedAt: Date;
  respondedAt?: Date;
  endedAt?: Date;
  stoppedAt?: Date;
  stoppedBy?: 'admin' | 'employee';
  expiresAt?: Date;
  rejectionReason?: string;
  /** False if initiated under a valid pre-authorization policy; true otherwise */
  requiresEmployeeApproval?: boolean;
  /** Set to true when initiated under a valid pre-authorization policy */
  isPreAuthorized?: boolean;
  authorizationPolicyVersion?: string;
}

export interface SerializedScreenViewRequest {
  id: string;
  adminId: string;
  adminName?: string;
  employeeId: string;
  employeeName?: string;
  deviceId: string;
  deviceName?: string;
  status: ScreenViewRequestStatus;
  requestedAt: string;
  respondedAt?: string;
  endedAt?: string;
  stoppedAt?: string;
  stoppedBy?: 'admin' | 'employee';
  expiresAt?: string;
  rejectionReason?: string;
  requiresEmployeeApproval?: boolean;
  isPreAuthorized?: boolean;
  authorizationPolicyVersion?: string;
}

export function isValidPermissionTransition(
  current: ScreenViewRequestStatus,
  next: ScreenViewRequestStatus
): boolean {
  if (current === next) return false;
  switch (current) {
    case 'pending':
      return (
        next === 'approved' ||
        next === 'rejected' ||
        next === 'denied' ||
        next === 'cancelled' ||
        next === 'expired'
      );
    case 'approved':
    case 'active':
      return next === 'stopped' || next === 'ended';
    case 'rejected':
    case 'denied':
    case 'cancelled':
    case 'expired':
    case 'stopped':
    case 'ended':
    default:
      return false;
  }
}

// ─── Monitoring Settings ─────────────────────────────────────

export type ScheduleDay =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export interface MonitoringSchedule {
  enabledDays: ScheduleDay[];
  startTime: string; // "HH:MM" 24h
  endTime: string;   // "HH:MM" 24h
  timezone: string;  // IANA timezone string
}

export interface MonitoringSettings {
  id: string;
  screenshotIntervalSeconds: number;   // min 30, max 3600
  screenshotQuality: 'low' | 'medium' | 'high';
  dataRetentionDays: number;           // min 7, max 365
  schedule: MonitoringSchedule;
  enableLiveScreenView: boolean;
  requireEmployeeApprovalForLiveView: boolean; // must always be true
  updatedAt: Date;
  updatedBy: string;
}

// ─── Activity Summary (for reports) ──────────────────────────

export interface DailySummary {
  date: string; // ISO date "YYYY-MM-DD"
  employeeId: string;
  totalSessionSeconds: number;
  sessionCount: number;
  screenshotCount: number;
  deviceIds: string[];
}

export interface WeeklySummary {
  weekStartDate: string; // ISO date "YYYY-MM-DD"
  employeeId: string;
  days: DailySummary[];
  totalSessionSeconds: number;
  avgDailySessionSeconds: number;
}

// ─── Productivity & Analytics ───────────────────────────────

export type ProductivityCategory = 'productive' | 'neutral' | 'unproductive';

export interface AppUsage {
  id: string;
  employeeId: string;
  appName: string;
  windowTitle: string;
  durationSeconds: number;
  category: ProductivityCategory;
  productivityScore: number; // 0 - 100
  icon?: string;
}

export interface WebUsage {
  id: string;
  employeeId: string;
  domain: string;
  title: string;
  durationSeconds: number;
  category: ProductivityCategory;
  visitCount: number;
}

export interface ActivityMetric {
  timestamp: string; // e.g. "09:00", "10:00"
  activeMinutes: number;
  idleMinutes: number;
  keystrokes: number;
  mouseClicks: number;
  productivityScore: number;
}

// ─── Approval & Alerts Queue ────────────────────────────────

export type ApprovalType = 'access' | 'overtime' | 'privacy_review' | 'off_track_alert';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface ApprovalRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  type: ApprovalType;
  title: string;
  description: string;
  requestedAt: Date;
  status: ApprovalStatus;
  urgency: 'low' | 'medium' | 'high';
  resolvedAt?: Date;
  resolvedBy?: string;
}


// ─── IPC Message Types (Electron preload bridge) ─────────────

export type IpcChannel =
  | 'session:start'
  | 'session:end'
  | 'session:status'
  | 'capture:start'
  | 'capture:stop'
  | 'capture:preview'
  | 'share:request'
  | 'share:approve'
  | 'share:deny'
  | 'share:stop'
  | 'device:register'
  | 'device:status'
  | 'settings:get'
  | 'settings:update';

export interface IpcMessage<T = unknown> {
  channel: IpcChannel;
  payload: T;
  timestamp: Date;
  requestId: string;
}

export interface IpcResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  requestId: string;
}

// ─── Mock data helper types ───────────────────────────────────

/** Clearly marks data as mock — prevents confusion with real data */
export interface MockDataEnvelope<T> {
  isMockData: true;
  data: T;
  note: string;
}

export function wrapMockData<T>(data: T, note = 'This is mock data for development only. Not real employee activity.'): MockDataEnvelope<T> {
  return { isMockData: true, data, note };
}

// ─── Phase 7: Local Screenshot Capture & Preview ────────────

export interface LocalScreenshotMetadata {
  id: string;
  filename: string;
  filePath: string;
  deviceId: string;
  sessionId: string;
  employeeId?: string;
  capturedAt: string; // ISO date string
  fileSizeBytes: number;
  width: number;
  height: number;
  format: 'png' | 'jpg' | 'jpeg';
  isLocalOnly: true;
  retentionNotice: string;
}

export interface CaptureScreenshotPayload {
  deviceId: string;
  sessionId: string;
  employeeId?: string;
  timestamp?: Date | string;
  checkScheduleHours?: boolean;
  interactive?: boolean;
}

export type CaptureErrorCode =
  | 'UNAPPROVED_DEVICE'
  | 'UNAUTHORIZED_MONITORING'
  | 'INACTIVE_SESSION'
  | 'INVALID_PAYLOAD'
  | 'CAPTURE_FAILED'
  | 'STORAGE_ERROR'
  | 'NOT_PERMITTED';

export interface CaptureScreenshotResult {
  success: boolean;
  data?: LocalScreenshotMetadata & {
    dataUrl?: string;
  };
  error?: string;
  errorCode?: CaptureErrorCode;
}

export interface DeleteScreenshotResult {
  success: boolean;
  filename?: string;
  error?: string;
  errorCode?: 'STORAGE_ERROR' | 'NOT_FOUND' | 'INVALID_PAYLOAD';
}

export interface RecentScreenshotsResult {
  success: boolean;
  data?: LocalScreenshotMetadata[];
  error?: string;
}

// ─── Phase 8: Scheduled Sessions & Background Execution ───────

export interface ScheduleConfig {
  startHour: number; // 9
  startMinute: number; // 30
  endHour: number; // 18
  endMinute: number; // 30
  timezone?: string;
}

export const DEFAULT_SCHEDULE_CONFIG: ScheduleConfig = {
  startHour: 9,
  startMinute: 30,
  endHour: 18,
  endMinute: 30,
};

export type ScheduleState =
  | 'outside_hours'
  | 'scheduled_active'
  | 'manual_active'
  | 'on_break'
  | 'manually_stopped'
  | 'unauthorized'
  | 'unapproved'
  | 'onboarding_required'
  | 'ended_for_day';

export interface OnboardingPolicyRecord {
  employeeId: string;
  deviceId: string;
  acknowledgedAt: string; // ISO date string
  policyVersion: string;
  agreedToTerms: boolean;
  acknowledgedWorkingHours: string; // e.g. "09:30 - 18:30"
  acknowledgedStoragePolicy: boolean;
  acknowledgedWhoHasAccess: boolean;
}

export interface BackgroundSettings {
  minimizeToTrayOnClose: boolean;
  launchOnStartup: boolean;
}

export const DEFAULT_BACKGROUND_SETTINGS: BackgroundSettings = {
  minimizeToTrayOnClose: false,
  launchOnStartup: false,
};

export interface ScheduleReconcileResult {
  action: 'started' | 'ended' | 'none' | 'blocked';
  reason: string;
  session?: WorkSession;
  timestamp: Date;
}

export interface ScheduleStatusInfo {
  state: ScheduleState;
  isWithinHours: boolean;
  activeSessionId?: string;
  nextScheduledEvent?: {
    type: 'start' | 'end';
    time: string; // ISO date string or local time string
  };
  manualStopRecordedForToday: boolean;
  onboardingCompleted: boolean;
  monitoringAuthorized: boolean;
  deviceApproved: boolean;
  statusText: string;
}

// ─── Phase 9: Firebase Authentication & Firestore Foundation ───

export interface FirebaseClientConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export interface UserAccount {
  uid: string;
  email: string;
  contactEmail?: string;
  displayName: string;
  role: EmployeeRole;
  employeeId?: string;
  status: 'active' | 'disabled';
  createdAt: string;
  lastLoginAt?: string;
  lastActiveAt?: any;
  updatedAt?: any;
}

export interface FirestoreEmployeeDoc {
  employeeId: string;
  userId?: string;
  name: string;
  email: string;
  department: string;
  role: string;
  status: 'active' | 'inactive' | 'suspended';
  createdAt: string;
  updatedAt: string;
}

export interface FirestoreDeviceDoc {
  deviceId: string;
  userId: string;
  employeeId: string;
  employeeName: string;
  hostname: string;
  platform: string;
  approvalStatus: DeviceRegistrationStatus;
  registeredAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  rejectionReason?: string;
}

export interface AuthState {
  user: UserAccount | null;
  loading: boolean;
  error: string | null;
  isConfigured: boolean;
  isOfflineDemo: boolean;
}

export function formatAuthError(errorCode: string): string {
  switch (errorCode) {
    case 'auth/invalid-email':
      return 'The email address is improperly formatted.';
    case 'auth/user-disabled':
      return 'This user account has been disabled. Contact an administrator.';
    case 'auth/user-not-found':
      return 'No account exists with this email address.';
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
      return 'Invalid email or password. Please verify your credentials.';
    case 'auth/email-already-in-use':
      return 'An account already exists with this email address.';
    case 'auth/operation-not-allowed':
      return 'Email/password sign-in is not enabled in Firebase Console.';
    case 'auth/weak-password':
      return 'The password must be at least 6 characters.';
    case 'auth/too-many-requests':
      return 'Access temporarily blocked due to many failed login attempts. Try again later.';
    case 'auth/network-request-failed':
      return 'Network error connecting to Firebase. Check your internet connection.';
    case 'auth/requires-recent-login':
      return 'Please log in again to perform this sensitive action.';
    case 'auth/permission-denied':
      return 'Insufficient permissions to perform this operation.';
    case 'auth/unauthorized-role':
      return 'Access Denied: Your account role is not authorized for this application.';
    default:
      return errorCode ? `Authentication error: ${errorCode}` : 'An unknown authentication error occurred.';
  }
}

// ─── Employee ID & Synthetic Auth Email Mapping ───────────────
export const SYNTHETIC_AUTH_EMAIL_DOMAIN = 'worktrack.internal';

/**
 * Strict Employee ID format:
 * - 3 to 32 characters total
 * - Must begin with an alphanumeric character (a-z, A-Z, 0-9)
 * - May contain letters, digits, hyphens (-), and underscores (_)
 * - Strict rejection of invalid characters, whitespace, or empty strings
 */
export const EMPLOYEE_ID_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,31}$/;

/**
 * Normalizes an Employee ID:
 * - Trims leading/trailing whitespace
 * - Strictly validates format against EMPLOYEE_ID_REGEX
 * - Rejects invalid characters (does NOT silently strip or alter them)
 * - Converts to lowercase for case-insensitive consistency
 */
export function normalizeEmployeeId(id: string): string {
  if (!id || typeof id !== 'string') {
    throw new Error('Employee ID must be a non-empty string.');
  }
  const trimmed = id.trim();
  if (!EMPLOYEE_ID_REGEX.test(trimmed)) {
    throw new Error(
      `Invalid Employee ID "${id}". Must be 3–32 characters, start with a letter or digit, and contain only letters, numbers, hyphens, or underscores.`
    );
  }
  return trimmed.toLowerCase();
}

/**
 * Validates an Employee ID safely without throwing.
 */
export function validateEmployeeId(id: string): { valid: boolean; normalized?: string; error?: string } {
  try {
    const normalized = normalizeEmployeeId(id);
    return { valid: true, normalized };
  } catch (err: any) {
    return { valid: false, error: err.message || 'Invalid Employee ID' };
  }
}

/**
 * Deterministically constructs the internal Firebase Authentication email alias for an Employee ID.
 * Example: 'emp_001' -> 'emp_001@worktrack.internal'
 * Throws if the employee ID does not pass strict format validation.
 */
export function formatEmployeeAuthEmail(employeeId: string): string {
  const normalized = normalizeEmployeeId(employeeId);
  return `${normalized}@${SYNTHETIC_AUTH_EMAIL_DOMAIN}`;
}

/**
 * Returns true if the email address corresponds to an internal synthetic employee auth alias.
 */
export function isSyntheticAuthEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  return email.toLowerCase().endsWith(`@${SYNTHETIC_AUTH_EMAIL_DOMAIN}`);
}

/**
 * Extracts and normalizes the Employee ID from a synthetic email alias.
 * Returns null if the email does not match the synthetic domain or format.
 */
export function extractEmployeeIdFromAuthEmail(email: string): string | null {
  if (!isSyntheticAuthEmail(email)) return null;
  const parts = email.toLowerCase().split('@');
  if (parts.length !== 2) return null;
  const candidate = parts[0];
  const validation = validateEmployeeId(candidate);
  return validation.valid ? validation.normalized! : null;
}

// ─── Password Strength Validation ─────────────────────────────
export interface PasswordStrengthResult {
  valid: boolean;
  score: number; // 0 to 4
  errors: string[];
}

/**
 * Validates password strength:
 * - At least 8 characters
 * - At least 1 uppercase letter
 * - At least 1 lowercase letter
 * - At least 1 number
 * - At least 1 special character
 * - No whitespace
 */
export function validatePasswordStrength(password: string): PasswordStrengthResult {
  const errors: string[] = [];
  if (!password || typeof password !== 'string') {
    return { valid: false, score: 0, errors: ['Password is required.'] };
  }

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long.');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter (A-Z).');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter (a-z).');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number (0-9).');
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(password)) {
    errors.push('Password must contain at least one special character (!@#$%^&*...).');
  }
  if (/\s/.test(password)) {
    errors.push('Password cannot contain spaces.');
  }

  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password) && /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(password)) score++;

  return {
    valid: errors.length === 0,
    score: Math.min(4, score),
    errors,
  };
}

/**
 * Cryptographically generates a secure random password using Web Crypto API.
 */
export function generateSecurePassword(length = 16): string {
  const charsetUpper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const charsetLower = 'abcdefghijkmnopqrstuvwxyz';
  const charsetNumbers = '23456789';
  const charsetSymbols = '!@#$%^&*_-+=';
  const allChars = charsetUpper + charsetLower + charsetNumbers + charsetSymbols;

  const cryptoObj =
    typeof globalThis !== 'undefined' && globalThis.crypto
      ? globalThis.crypto
      : null;

  if (!cryptoObj || typeof cryptoObj.getRandomValues !== 'function') {
    // Fallback if crypto is unavailable in legacy environments
    throw new Error('Cryptographically secure random values (crypto.getRandomValues) is required.');
  }

  const getRandomChar = (chars: string) => {
    const array = new Uint32Array(1);
    cryptoObj.getRandomValues(array);
    return chars[array[0] % chars.length];
  };

  // Guarantee at least one from each character set
  const requiredChars = [
    getRandomChar(charsetUpper),
    getRandomChar(charsetLower),
    getRandomChar(charsetNumbers),
    getRandomChar(charsetSymbols),
  ];

  // Fill remaining length
  const remainingLength = Math.max(0, length - requiredChars.length);
  const remainingChars: string[] = [];
  const randomIndices = new Uint32Array(remainingLength);
  cryptoObj.getRandomValues(randomIndices);
  for (let i = 0; i < remainingLength; i++) {
    remainingChars.push(allChars[randomIndices[i] % allChars.length]);
  }

  // Shuffle array using Fisher-Yates with crypto random values
  const combined = [...requiredChars, ...remainingChars];
  const shuffleValues = new Uint32Array(combined.length);
  cryptoObj.getRandomValues(shuffleValues);
  for (let i = combined.length - 1; i > 0; i--) {
    const j = shuffleValues[i] % (i + 1);
    const temp = combined[i];
    combined[i] = combined[j];
    combined[j] = temp;
  }

  return combined.join('');
}

// ─── Automated Provisioning Types ─────────────────────────────
export interface ProvisionEmployeePayload {
  employeeId: string;
  name: string;
  contactEmail: string;
  department: string;
  role?: EmployeeRole;
  initialPassword: string;
}

export interface ProvisionEmployeeResult {
  success: boolean;
  uid: string;
  employeeId: string;
  authEmail: string;
  contactEmail: string;
  name: string;
  role: EmployeeRole;
  department: string;
}

// ─── Reset Password Types ─────────────────────────────────────
export interface ResetEmployeePasswordPayload {
  employeeId: string;
  newPassword: string;
}

export interface ResetEmployeePasswordResult {
  success: boolean;
  employeeId: string;
  uid: string;
  updatedAt: string;
}


