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

// ─── Work Session ────────────────────────────────────────────

export type SessionStatus = 'active' | 'paused' | 'ended';

export interface WorkSession {
  id: string;
  employeeId: string;
  deviceId: string;
  status: SessionStatus;
  startedAt: Date;
  endedAt?: Date;
  pausedAt?: Date;
  durationSeconds?: number;
  notes?: string;
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

// ─── Screen View Request ─────────────────────────────────────

export type ScreenViewRequestStatus =
  | 'pending'
  | 'approved'
  | 'denied'
  | 'active'
  | 'ended'
  | 'expired';

export interface ScreenViewRequest {
  id: string;
  adminId: string;
  employeeId: string;
  deviceId: string;
  status: ScreenViewRequestStatus;
  requestedAt: Date;
  respondedAt?: Date;
  endedAt?: Date;
  expiresAt: Date;
  /** Employee must explicitly approve — no silent/stealth access */
  requiresEmployeeApproval: true;
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

// ─── Employee Break ─────────────────────────────────────────

export type BreakReason = 'lunch' | 'personal' | 'meeting' | 'coffee';

export interface EmployeeBreak {
  id: string;
  reason: BreakReason;
  startedAt: Date;
  endedAt?: Date;
  durationSeconds: number;
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
