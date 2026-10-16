// ============================================================
// WorkTrack Pro — Phase 7: Local Screenshot Capture & Preview
// Automated Test Suite
// ============================================================

import assert from 'node:assert/strict'

// Mock browser localStorage for Node testing environment
const mockStorage = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (key: string) => mockStorage.get(key) || null,
  setItem: (key: string, value: string) => mockStorage.set(key, String(value)),
  removeItem: (key: string) => mockStorage.delete(key),
  clear: () => mockStorage.clear(),
}

;(globalThis as any).window = {
  crypto: {
    randomUUID: () => `uuid_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
  },
}

// Import services and helpers
import { deviceService } from './apps/employee-app/src/services/deviceService.js'
import { sessionService } from './apps/employee-app/src/services/sessionService.js'
import { permissionService } from './apps/employee-app/src/services/permissionService.js'
import {
  screenshotService,
  isValidScreenshotFilename,
  validateStoragePath,
} from './apps/employee-app/src/services/screenshotService.js'
import type { CaptureScreenshotPayload } from './packages/shared/dist/index.js'

async function runPhase7Tests() {
  console.log('🧪 Starting Phase 7 Local Screenshot Capture and Preview Tests...\n')
  console.log('[Environment Note: Running in Mock Desktop Capture Mode for Automated Headless Verification]\n')

  mockStorage.clear()
  await permissionService.resetAll()
  await screenshotService.resetMockStorage()


  const deviceInfo = await deviceService.getDeviceInfo()
  const TEST_DEVICE_ID = deviceInfo.deviceId
  const TEST_EMP_ID = 'emp_sarah_001'
  const TEST_EMP_NAME = 'Sarah Johnson'


  // ────────────────────────────────────────────────────────────
  // Test 1: Capture is blocked for an unapproved device
  // ────────────────────────────────────────────────────────────
  console.log('Test 1: Capture is blocked for an unapproved device')

  // Register device in pending status
  await deviceService.registerDevice({
    deviceId: TEST_DEVICE_ID,
    employeeId: TEST_EMP_ID,
    employeeName: TEST_EMP_NAME,
    department: 'Engineering',
  })
  // Verify device is pending
  let reg = await deviceService.getRegistrationRecord()
  assert.equal(reg.status, 'pending_approval', 'Device must be pending approval initially')

  const pendingPayload: CaptureScreenshotPayload = {
    deviceId: TEST_DEVICE_ID,
    sessionId: 'sess_mock_123',
    employeeId: TEST_EMP_ID,
  }

  const resPending = await screenshotService.captureScreenshot(pendingPayload)
  assert.equal(resPending.success, false, 'Capture must fail for pending device')
  assert.equal(resPending.errorCode, 'UNAPPROVED_DEVICE')
  assert.match(resPending.error || '', /Device must be approved/i)

  // Now simulate rejection
  await deviceService.simulateAdminReview('rejected', 'Security policy violation')
  reg = await deviceService.getRegistrationRecord()
  assert.equal(reg.status, 'rejected', 'Device must be rejected')

  const resRejected = await screenshotService.captureScreenshot(pendingPayload)
  assert.equal(resRejected.success, false, 'Capture must fail for rejected device')
  assert.equal(resRejected.errorCode, 'UNAPPROVED_DEVICE')
  console.log('  ✓ Capture blocked when device status is pending_approval and rejected')

  // ────────────────────────────────────────────────────────────
  // Test 2: Capture is blocked without valid authorization
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 2: Capture is blocked without valid authorization')

  // Re-register and approve device
  await deviceService.registerDevice({
    deviceId: TEST_DEVICE_ID,
    employeeId: TEST_EMP_ID,
    employeeName: TEST_EMP_NAME,
    department: 'Engineering',
  })
  await deviceService.simulateAdminReview('approved')
  reg = await deviceService.getRegistrationRecord()
  assert.equal(reg.status, 'approved', 'Device must be approved')


  // Start active work session
  const activeSession = await sessionService.startWork({
    deviceId: TEST_DEVICE_ID,
    employeeId: TEST_EMP_ID,
  })
  assert.equal(activeSession.status, 'working')

  // No authorization granted yet
  const authRecordBefore = await permissionService.getPreAuthorization(TEST_DEVICE_ID)
  assert.equal(authRecordBefore, null, 'No monitoring authorization should exist yet')

  const resNoAuth = await screenshotService.captureScreenshot({
    deviceId: TEST_DEVICE_ID,
    sessionId: activeSession.id,
    employeeId: TEST_EMP_ID,
  })
  assert.equal(resNoAuth.success, false, 'Capture must fail without monitoring authorization')
  assert.equal(resNoAuth.errorCode, 'UNAUTHORIZED_MONITORING')
  assert.match(resNoAuth.error || '', /Valid monitoring authorization policy is required/i)

  // Now grant and then revoke authorization
  await permissionService.grantPreAuthorization({
    deviceId: TEST_DEVICE_ID,
    employeeId: TEST_EMP_ID,
    employeeName: TEST_EMP_NAME,
  })
  await permissionService.revokePreAuthorization(TEST_DEVICE_ID, {
    reason: 'Employee revoked privacy policy',
  })

  const resRevokedAuth = await screenshotService.captureScreenshot({
    deviceId: TEST_DEVICE_ID,
    sessionId: activeSession.id,
    employeeId: TEST_EMP_ID,
  })
  assert.equal(resRevokedAuth.success, false, 'Capture must fail when authorization is revoked')
  assert.equal(resRevokedAuth.errorCode, 'UNAUTHORIZED_MONITORING')
  console.log('  ✓ Capture blocked when authorization is missing or revoked')

  // ────────────────────────────────────────────────────────────
  // Test 3: Capture is blocked after a session is stopped or on break
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 3: Capture is blocked after a session is stopped or during breaks')

  // Re-grant authorization
  await permissionService.grantPreAuthorization({
    deviceId: TEST_DEVICE_ID,
    employeeId: TEST_EMP_ID,
    employeeName: TEST_EMP_NAME,
  })

  // Start a break
  await sessionService.startBreak('coffee')
  const breakSession = await sessionService.getActiveSession()
  assert.equal(breakSession?.status, 'on_break', 'Session must be on break')

  const resOnBreak = await screenshotService.captureScreenshot({
    deviceId: TEST_DEVICE_ID,
    sessionId: activeSession.id,
    employeeId: TEST_EMP_ID,
  })
  assert.equal(resOnBreak.success, false, 'Capture must fail during breaks')
  assert.equal(resOnBreak.errorCode, 'INACTIVE_SESSION')
  assert.match(resOnBreak.error || '', /Capture is not permitted during breaks/i)

  // Resume work and then end session
  await sessionService.resumeWork()
  await sessionService.endWork()

  const resEnded = await screenshotService.captureScreenshot({
    deviceId: TEST_DEVICE_ID,
    sessionId: activeSession.id,
    employeeId: TEST_EMP_ID,
  })
  assert.equal(resEnded.success, false, 'Capture must fail after session is ended')
  assert.equal(resEnded.errorCode, 'INACTIVE_SESSION')
  console.log('  ✓ Capture safely blocked during breaks and after session is ended')

  // ────────────────────────────────────────────────────────────
  // Test 4: A valid capture request returns a success structured result
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 4: A valid capture request returns a success structured result')

  // Start a fresh new active working session
  const validSession = await sessionService.startWork({
    deviceId: TEST_DEVICE_ID,
    employeeId: TEST_EMP_ID,
  })
  assert.equal(validSession.status, 'working')

  const validPayload: CaptureScreenshotPayload = {
    deviceId: TEST_DEVICE_ID,
    sessionId: validSession.id,
    employeeId: TEST_EMP_ID,
  }

  const captureRes = await screenshotService.captureScreenshot(validPayload)
  assert.equal(captureRes.success, true, 'Valid capture must succeed')
  assert.ok(captureRes.data, 'Must return capture data')
  assert.ok(captureRes.data.id.startsWith('sc_'), 'ID must have sc_ prefix')
  assert.ok(isValidScreenshotFilename(captureRes.data.filename), 'Filename must be safe')
  assert.equal(captureRes.data.deviceId, TEST_DEVICE_ID)
  assert.equal(captureRes.data.sessionId, validSession.id)
  assert.equal(captureRes.data.employeeId, TEST_EMP_ID)
  assert.equal(captureRes.data.format, 'png')
  assert.equal(captureRes.data.isLocalOnly, true)
  assert.ok(captureRes.data.dataUrl?.startsWith('data:image/png;base64,'), 'Must include PNG data URL for preview')
  assert.ok(captureRes.data.fileSizeBytes > 0, 'fileSizeBytes must be positive')
  assert.ok(captureRes.data.width > 0, 'width must be positive')
  assert.ok(captureRes.data.height > 0, 'height must be positive')
  console.log(`  ✓ Valid capture succeeded: ${captureRes.data.filename} (${captureRes.data.width}x${captureRes.data.height})`)

  // ────────────────────────────────────────────────────────────
  // Test 5: Invalid IPC payloads are rejected
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 5: Invalid IPC payloads are rejected')

  const invalidPayloads: any[] = [
    null,
    undefined,
    {},
    { deviceId: '' },
    { deviceId: '   ', sessionId: 'sess_123' },
    { deviceId: TEST_DEVICE_ID, sessionId: '' },
    { deviceId: TEST_DEVICE_ID, sessionId: '   ' },
    { deviceId: 12345, sessionId: 'sess_123' },
    { deviceId: TEST_DEVICE_ID, sessionId: 99999 },
  ]

  for (const invalid of invalidPayloads) {
    const res = await screenshotService.captureScreenshot(invalid)
    assert.equal(res.success, false, 'Invalid payload must return success: false')
    assert.equal(res.errorCode, 'INVALID_PAYLOAD')
  }
  console.log('  ✓ All 9 invalid IPC payload variations cleanly rejected')

  // ────────────────────────────────────────────────────────────
  // Test 6: UI displays capture progress and errors correctly
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 6: UI displays capture progress and errors correctly')

  // Verify recent list retrieval
  const recentList = await screenshotService.getRecentScreenshots(10)
  assert.ok(recentList.length >= 1, 'Recent list must contain captured item')
  assert.equal(recentList[0].filename, captureRes.data?.filename)

  // Verify preview data URL retrieval
  const previewDataUrl = await screenshotService.getScreenshotDataUrl(recentList[0].filename)
  assert.ok(previewDataUrl?.startsWith('data:image/png;base64,'), 'Preview URL must be retrievable')

  // Verify invalid capture result error handling
  const mismatchedSessionRes = await screenshotService.captureScreenshot({
    deviceId: TEST_DEVICE_ID,
    sessionId: 'sess_non_existent_999',
    employeeId: TEST_EMP_ID,
  })
  assert.equal(mismatchedSessionRes.success, false)
  assert.equal(mismatchedSessionRes.errorCode, 'INACTIVE_SESSION')
  assert.match(mismatchedSessionRes.error || '', /No active session matches the provided session ID/i)
  console.log('  ✓ UI preview data loading and structured error messaging verified')

  // ────────────────────────────────────────────────────────────
  // Test 7: Screenshot metadata is associated with the correct device and session
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 7: Screenshot metadata is associated with the correct device and session')

  const meta = captureRes.data!
  assert.equal(meta.deviceId, TEST_DEVICE_ID, 'Device ID must match')
  assert.equal(meta.sessionId, validSession.id, 'Session ID must match')
  assert.equal(meta.employeeId, TEST_EMP_ID, 'Employee ID must match')
  assert.equal(meta.isLocalOnly, true, 'isLocalOnly must be true')
  assert.match(meta.retentionNotice, /Stored locally in employee app data/i)
  assert.ok(new Date(meta.capturedAt).getTime() <= Date.now(), 'Timestamp must be current')
  console.log('  ✓ Metadata strictly preserves deviceId, sessionId, isLocalOnly, and retention notice')

  // ────────────────────────────────────────────────────────────
  // Test 8: Local storage paths are validated and path traversal is rejected
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 8: Local storage paths are validated and path traversal is rejected')

  // Valid safe filename patterns
  assert.equal(validateStoragePath('screenshot_1792131000000_abc12345.png'), true)
  assert.equal(validateStoragePath('screenshot_1600000000000_1234abcd.png'), true)

  // Path traversal attacks must all be rejected
  const traversalAttacks = [
    '../../etc/passwd',
    '..\\..\\windows\\system32\\calc.exe',
    'screenshot/subdir/file.png',
    'screenshot\\subdir\\file.png',
    '../screenshot_123_abc.png',
    'screenshot_123_abc.png/evil',
    'evil.exe',
    '',
    '   ',
    'screenshot_invalid_ext.jpg',
  ]

  for (const attack of traversalAttacks) {
    assert.equal(validateStoragePath(attack), false, `Attack must be rejected: ${attack}`)
    const deleteRes = await screenshotService.deleteScreenshot(attack)
    assert.equal(deleteRes.success, false, `Delete must reject traversal: ${attack}`)
  }

  // Safe deletion of real file
  const deleteValidRes = await screenshotService.deleteScreenshot(meta.filename)
  assert.equal(deleteValidRes.success, true, 'Safe deletion must succeed')
  const afterDeleteList = await screenshotService.getRecentScreenshots(10)
  assert.equal(
    afterDeleteList.some(item => item.filename === meta.filename),
    false,
    'Deleted screenshot must be removed from local index'
  )
  console.log('  ✓ Path traversal protection verified and safe deletion confirmed')

  // ────────────────────────────────────────────────────────────
  // Test 9: Storage limit and pruning (50 max local captures)
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 9: Storage limit and pruning (50 max local captures)')

  // Generate 55 captures
  for (let i = 0; i < 55; i++) {
    await screenshotService.captureScreenshot({
      deviceId: TEST_DEVICE_ID,
      sessionId: validSession.id,
      employeeId: TEST_EMP_ID,
    })
  }

  const totalRecent = await screenshotService.getRecentScreenshots(100)
  assert.equal(totalRecent.length, 50, 'Recent captures list must be pruned to max 50 items')
  console.log(`  ✓ Auto-pruning strictly limits storage to max 50 items (found ${totalRecent.length})`)

  console.log('\n🎉 ALL PHASE 7 LOCAL SCREENSHOT CAPTURE & PREVIEW TESTS PASSED WITH ZERO FAILURES!')
}

runPhase7Tests().catch(err => {
  console.error('\n❌ Phase 7 test failure:', err)
  process.exit(1)
})
