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
  ipAddress?: string;
  lastSeen: Date;
  registeredAt: Date;
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

export function parseDate(val: Date | string | undefined | null): Date | undefined {
  if (!val) return undefined;
  if (val instanceof Date) return isNaN(val.getTime()) ? undefined : val;
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

export interface Screenshot {
  id: string;
  sessionId: string;
  employeeId: string;
  deviceId: string;
  takenAt: Date;
  imageUrl: string;
  thumbnailUrl?: string;
  fileSizeBytes?: number;
  width?: number;
  height?: number;
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
  format: 'png';
  isLocalOnly: true;
  retentionNotice: string;
}

export interface CaptureScreenshotPayload {
  deviceId: string;
  sessionId: string;
  employeeId?: string;
  timestamp?: Date | string;
  checkScheduleHours?: boolean;
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

