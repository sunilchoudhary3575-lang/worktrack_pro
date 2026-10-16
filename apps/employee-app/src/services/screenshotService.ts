import type {
  LocalScreenshotMetadata,
  CaptureScreenshotPayload,
  CaptureScreenshotResult,
  DeleteScreenshotResult,
  RecentScreenshotsResult,
} from '@worktrack-pro/shared'
import { deviceService } from './deviceService'
import { sessionService } from './sessionService'
import { permissionService } from './permissionService'

const LOCAL_STORAGE_SCREENSHOTS = 'worktrack_local_screenshots'
const MAX_LOCAL_SCREENSHOTS = 50

// Standard 1x1 PNG data URL for test & mock preview rendering
const MOCK_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

/**
 * Validate that a screenshot filename adheres to the strict safe pattern
 * and contains no path traversal sequences (no .., /, or \).
 */
export function isValidScreenshotFilename(filename: string): boolean {
  if (!filename || typeof filename !== 'string') return false
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return false
  }
  return /^screenshot_[0-9]+_[a-zA-Z0-9_\-]+\.png$/.test(filename)
}

/**
 * Validates whether a file path or name stays within the safe storage boundary.
 */
export function validateStoragePath(filename: string): boolean {
  return isValidScreenshotFilename(filename)
}

export class ScreenshotService {
  private isProcessing = false

  /**
   * Helper to load stored screenshot records from local storage.
   */
  private loadMockIndex(): LocalScreenshotMetadata[] {
    if (typeof localStorage === 'undefined') return []
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_SCREENSHOTS)
      if (raw) {
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed : []
      }
    } catch {
      localStorage.removeItem(LOCAL_STORAGE_SCREENSHOTS)
    }
    return []
  }

  /**
   * Helper to save screenshot index to local storage.
   */
  private saveMockIndex(list: LocalScreenshotMetadata[]): void {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(LOCAL_STORAGE_SCREENSHOTS, JSON.stringify(list))
  }

  /**
   * Capture a local desktop screenshot.
   * Enforces:
   * 1. Payload validation (deviceId & sessionId).
   * 2. Approved device check.
   * 3. Valid active monitoring authorization policy.
   * 4. Active working session requirement.
   */
  async captureScreenshot(payload: CaptureScreenshotPayload): Promise<CaptureScreenshotResult> {
    if (this.isProcessing) {
      return {
        success: false,
        error: 'A screenshot capture operation is already in progress.',
        errorCode: 'NOT_PERMITTED',
      }
    }

    this.isProcessing = true
    try {
      // 1. Validate payload shape
      if (
        !payload ||
        typeof payload !== 'object' ||
        typeof payload.deviceId !== 'string' ||
        !payload.deviceId.trim() ||
        typeof payload.sessionId !== 'string' ||
        !payload.sessionId.trim()
      ) {
        return {
          success: false,
          error: 'Invalid IPC payload: deviceId and sessionId are required and must be non-empty strings.',
          errorCode: 'INVALID_PAYLOAD',
        }
      }

      // Check for Electron desktop bridge
      const api = typeof window !== 'undefined' ? (window as any).electronAPI : null
      if (api?.capture?.takeScreenshot) {
        try {
          const res = await api.capture.takeScreenshot(payload)
          if (res) return res
        } catch (err: any) {
          return {
            success: false,
            error: err?.message || 'Electron desktop capture invocation failed.',
            errorCode: 'CAPTURE_FAILED',
          }
        }
      }

      // ── Mock / Browser Fallback Implementation ───────────────────

      // 2. Validate device registration
      const reg = await deviceService.getRegistrationRecord()
      if (!reg || reg.deviceId !== payload.deviceId || reg.status !== 'approved') {
        return {
          success: false,
          error: `Capture blocked: Device status is "${reg?.status || 'unregistered'}". Device must be approved by an administrator before capture.`,
          errorCode: 'UNAPPROVED_DEVICE',
        }
      }

      // 3. Validate active monitoring authorization policy
      const auth = await permissionService.getPreAuthorization(payload.deviceId)
      const activeApproved = await permissionService.getActiveApprovedRequest(payload.deviceId)
      const isAuthorized = (auth && auth.status === 'granted') || (activeApproved && (activeApproved.status === 'approved' || activeApproved.status === 'active'))

      if (!isAuthorized) {
        return {
          success: false,
          error: 'Capture blocked: Valid monitoring authorization policy is required.',
          errorCode: 'UNAUTHORIZED_MONITORING',
        }
      }

      // 4. Validate active work session
      const activeSession = await sessionService.getActiveSession()
      if (!activeSession || activeSession.id !== payload.sessionId) {
        return {
          success: false,
          error: 'Capture blocked: No active session matches the provided session ID.',
          errorCode: 'INACTIVE_SESSION',
        }
      }

      if (activeSession.status !== 'working' && activeSession.status !== 'active') {
        return {
          success: false,
          error: `Capture blocked: Session status is "${activeSession.status}". Capture is not permitted during breaks or when ended.`,
          errorCode: 'INACTIVE_SESSION',
        }
      }

      // 4b. Phase 8: Validate working hours if schedule enforcement requested
      if (payload.checkScheduleHours) {
        const captureTime = payload.timestamp ? new Date(payload.timestamp) : new Date()
        const currentMins = captureTime.getHours() * 60 + captureTime.getMinutes()
        const startMins = 9 * 60 + 30 // 09:30
        const endMins = 18 * 60 + 30  // 18:30
        const isWithin = currentMins >= startMins && currentMins < endMins
        if (!isWithin) {
          return {
            success: false,
            error: 'Capture blocked: Screenshot capture is not permitted outside authorized working hours (09:30 - 18:30).',
            errorCode: 'NOT_PERMITTED',
          }
        }
      }

      // 5. Generate safe local capture metadata
      const cryptoObj = typeof window !== 'undefined' ? window.crypto : null
      const randSuffix = cryptoObj && (cryptoObj as any).randomUUID
        ? (cryptoObj as any).randomUUID().slice(0, 8)
        : Math.random().toString(36).substring(2, 10)

      const timestamp = Date.now()
      const safeFilename = `screenshot_${timestamp}_${randSuffix}.png`
      const mockFilePath = `C:\\Users\\Owner\\AppData\\Roaming\\worktrack-pro\\screenshots\\${safeFilename}`

      const metadata: LocalScreenshotMetadata = {
        id: `sc_${timestamp}_${randSuffix.slice(0, 4)}`,
        filename: safeFilename,
        filePath: mockFilePath,
        deviceId: payload.deviceId,
        sessionId: payload.sessionId,
        employeeId: payload.employeeId || reg.employeeId || '',
        capturedAt: new Date(timestamp).toISOString(),
        fileSizeBytes: 142850,
        width: 1920,
        height: 1080,
        format: 'png',
        isLocalOnly: true,
        retentionNotice: 'Stored locally in employee app data. Automatically pruned after 50 captures or 7 days.',
      }

      // Store in local mock index
      const list = this.loadMockIndex()
      list.unshift(metadata)
      if (list.length > MAX_LOCAL_SCREENSHOTS) {
        list.splice(MAX_LOCAL_SCREENSHOTS)
      }
      this.saveMockIndex(list)

      return {
        success: true,
        data: {
          ...metadata,
          dataUrl: MOCK_PNG_DATA_URL,
        },
      }
    } finally {
      this.isProcessing = false
    }
  }

  /**
   * Retrieve recent local screenshot metadata list.
   */
  async getRecentScreenshots(limit = 20): Promise<LocalScreenshotMetadata[]> {
    const api = typeof window !== 'undefined' ? (window as any).electronAPI : null
    if (api?.capture?.getRecent) {
      try {
        const res: RecentScreenshotsResult = await api.capture.getRecent(limit)
        if (res && res.success && Array.isArray(res.data)) {
          return res.data
        }
      } catch (err) {
        console.warn('[ScreenshotService] Electron getRecent failed, falling back to local index:', err)
      }
    }

    const list = this.loadMockIndex()
    return list.slice(0, limit)
  }

  /**
   * Delete a local screenshot by filename.
   * Enforces path safety and rejects path traversal attempts.
   */
  async deleteScreenshot(filename: string): Promise<DeleteScreenshotResult> {
    if (!filename || typeof filename !== 'string') {
      return { success: false, error: 'Filename is required.', errorCode: 'INVALID_PAYLOAD' }
    }

    const trimmed = filename.trim()
    if (!isValidScreenshotFilename(trimmed)) {
      return {
        success: false,
        error: 'Storage error: Invalid or unsafe screenshot filename. Path traversal rejected.',
        errorCode: 'STORAGE_ERROR',
      }
    }

    const api = typeof window !== 'undefined' ? (window as any).electronAPI : null
    if (api?.capture?.delete) {
      try {
        return await api.capture.delete(trimmed)
      } catch (err: any) {
        return { success: false, error: err?.message || 'Delete operation failed.', errorCode: 'STORAGE_ERROR' }
      }
    }

    // Mock deletion
    const list = this.loadMockIndex()
    const filtered = list.filter(item => item.filename !== trimmed)
    this.saveMockIndex(filtered)

    return { success: true, filename: trimmed }
  }

  /**
   * Get image data URL for a specific screenshot.
   */
  async getScreenshotDataUrl(filename: string): Promise<string | null> {
    if (!isValidScreenshotFilename(filename)) return null

    const api = typeof window !== 'undefined' ? (window as any).electronAPI : null
    if (api?.capture?.readImage) {
      try {
        const res = await api.capture.readImage(filename)
        if (res && res.success && res.dataUrl) {
          return res.dataUrl
        }
      } catch {
        // fallback
      }
    }

    return MOCK_PNG_DATA_URL
  }

  /**
   * Reset mock screenshot storage for testing.
   */
  async resetMockStorage(): Promise<void> {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(LOCAL_STORAGE_SCREENSHOTS)
    }
    this.isProcessing = false
  }
}

export const screenshotService = new ScreenshotService()
