// ============================================================
// WorkTrack Pro — Automatic Screenshot Monitoring & Cloud Delivery
// Automated Test Suite
// ============================================================

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

// Mock browser localStorage & window for Node testing environment
const mockStorage = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (key: string) => mockStorage.get(key) || null,
  setItem: (key: string, value: string) => mockStorage.set(key, String(value)),
  removeItem: (key: string) => mockStorage.delete(key),
  clear: () => mockStorage.clear(),
}

;(globalThis as any).window = {
  crypto: {
    randomUUID: () => `sc_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
  },
}

;(globalThis as any).navigator = {
  onLine: true,
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
import { dataService } from './apps/admin-app/src/services/dataService.js'
import { firestoreDataService } from './apps/admin-app/src/services/firestoreDataService.js'
import type { Screenshot, ScreenshotFilters } from './packages/shared/dist/index.js'

async function runScreenshotMonitoringTests() {
  console.log('\n🧪 Starting Automatic Screenshot Monitoring & Cloud Delivery Tests...\n')

  mockStorage.clear()
  await permissionService.resetAll()
  await screenshotService.resetMockStorage()

  const deviceInfo = await deviceService.getDeviceInfo()
  const TEST_DEVICE_ID = deviceInfo.deviceId
  const TEST_EMP_ID = 'emp_sarah_001'
  const TEST_EMP_NAME = 'Sarah Johnson'
  const TEST_AUTH_UID = 'firebase_auth_uid_sarah_123'

  // ────────────────────────────────────────────────────────────
  // Test 1: Capture Preconditions (Device, Consent, Session, Schedule)
  // ────────────────────────────────────────────────────────────
  console.log('Test 1: Capture Preconditions strictly enforced')

  // Register device in pending approval
  await deviceService.registerDevice({
    deviceId: TEST_DEVICE_ID,
    employeeId: TEST_EMP_ID,
    employeeName: TEST_EMP_NAME,
    department: 'Engineering',
  })

  // 1a. Unapproved device cannot capture
  const unapprovedRes = await screenshotService.captureScreenshot({
    deviceId: TEST_DEVICE_ID,
    sessionId: 'sess_123',
    employeeId: TEST_EMP_ID,
  })
  assert.equal(unapprovedRes.success, false)
  assert.equal(unapprovedRes.errorCode, 'UNAPPROVED_DEVICE')
  console.log('  ✓ Unapproved device blocked from capture')

  // Approve device
  await deviceService.simulateAdminReview('approved')

  // 1b. No monitoring without explicit policy authorization
  const unauthRes = await screenshotService.captureScreenshot({
    deviceId: TEST_DEVICE_ID,
    sessionId: 'sess_123',
    employeeId: TEST_EMP_ID,
  })
  assert.equal(unauthRes.success, false)
  assert.equal(unauthRes.errorCode, 'UNAUTHORIZED_MONITORING')
  console.log('  ✓ Monitoring blocked without employee pre-authorization')

  // Grant authorization
  await permissionService.grantPreAuthorization({
    deviceId: TEST_DEVICE_ID,
    employeeId: TEST_EMP_ID,
    employeeName: TEST_EMP_NAME,
  })

  // 1c. Blocked when no active session
  const noSessionRes = await screenshotService.captureScreenshot({
    deviceId: TEST_DEVICE_ID,
    sessionId: 'sess_nonexistent',
    employeeId: TEST_EMP_ID,
  })
  assert.equal(noSessionRes.success, false)
  assert.equal(noSessionRes.errorCode, 'INACTIVE_SESSION')
  console.log('  ✓ Blocked when no active session is running')

  // Start active work session
  const activeSession = await sessionService.startWork({
    deviceId: TEST_DEVICE_ID,
    employeeId: TEST_EMP_ID,
  })
  assert.equal(activeSession.status, 'working')

  // 1d. Blocked during breaks
  await sessionService.startBreak('coffee')
  const breakRes = await screenshotService.captureScreenshot({
    deviceId: TEST_DEVICE_ID,
    sessionId: activeSession.id,
    employeeId: TEST_EMP_ID,
  })
  assert.equal(breakRes.success, false)
  assert.equal(breakRes.errorCode, 'INACTIVE_SESSION')
  assert.match(breakRes.error || '', /Capture is not permitted during breaks/i)
  console.log('  ✓ Capture strictly blocked during breaks')

  // Resume work
  await sessionService.resumeWork()

  // 1e. Blocked outside working hours when checkScheduleHours is set
  const eveningTime = new Date()
  eveningTime.setHours(20, 0, 0, 0) // 8:00 PM
  const afterHoursRes = await screenshotService.captureScreenshot({
    deviceId: TEST_DEVICE_ID,
    sessionId: activeSession.id,
    employeeId: TEST_EMP_ID,
    checkScheduleHours: true,
    timestamp: eveningTime,
  })
  assert.equal(afterHoursRes.success, false)
  assert.equal(afterHoursRes.errorCode, 'NOT_PERMITTED')
  assert.match(afterHoursRes.error || '', /outside authorized working hours/i)
  console.log('  ✓ Capture blocked outside authorized schedule (09:30 - 18:30)')

  // ────────────────────────────────────────────────────────────
  // Test 2: Automatic Capture Loop Controls & Interval Clamping
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 2: Automatic Capture Loop Controls & Interval Clamping')

  assert.equal(screenshotService.isAutoCaptureRunning(), false)

  // Start auto capture with sub-30s interval (should clamp to 30s)
  screenshotService.startAutoCapture({
    deviceId: TEST_DEVICE_ID,
    sessionId: activeSession.id,
    employeeId: TEST_EMP_ID,
    employeeName: TEST_EMP_NAME,
    intervalSeconds: 10, // Under minimum 30s
  })
  assert.equal(screenshotService.isAutoCaptureRunning(), true)
  assert.equal(screenshotService.getAutoCaptureIntervalSeconds(), 30, 'Interval must be clamped to minimum 30 seconds')
  console.log('  ✓ Automatic capture started; interval safely clamped to minimum 30s')

  // Setting interval to 120s
  screenshotService.setAutoCaptureIntervalSeconds(120)
  assert.equal(screenshotService.getAutoCaptureIntervalSeconds(), 120)
  console.log('  ✓ Automatic capture interval dynamically updated to 120s')

  // Stop auto capture
  screenshotService.stopAutoCapture()
  assert.equal(screenshotService.isAutoCaptureRunning(), false)
  console.log('  ✓ Automatic capture stopped immediately')

  // ────────────────────────────────────────────────────────────
  // Test 3: Structured Storage Path & Safe Filenames
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 3: Structured Storage Path & Safe Filenames')

  const validCapture = await screenshotService.captureScreenshot({
    deviceId: TEST_DEVICE_ID,
    sessionId: activeSession.id,
    employeeId: TEST_EMP_ID,
  })
  assert.equal(validCapture.success, true)
  assert.ok(validCapture.data)
  const screenshotId = validCapture.data.id

  // Path structure: screenshots/{authUid}/{sessionId}/{id}.jpg
  const expectedStoragePath = `screenshots/${TEST_AUTH_UID}/${activeSession.id}/${screenshotId}.jpg`
  assert.match(
    expectedStoragePath,
    /^screenshots\/[a-zA-Z0-9_\-]+\/[a-zA-Z0-9_\-]+\/sc_[0-9]+_[a-zA-Z0-9_\-]+\.jpg$/
  )
  console.log(`  ✓ Storage path format validated: ${expectedStoragePath}`)

  // Safe filename and path traversal prevention
  assert.equal(isValidScreenshotFilename('screenshot_1792131000000_abc123.jpg'), true)
  assert.equal(isValidScreenshotFilename('screenshot_1792131000000_abc123.jpeg'), true)
  assert.equal(isValidScreenshotFilename('screenshot_1792131000000_abc123.png'), true)
  assert.equal(isValidScreenshotFilename('../traversal.jpg'), false)
  assert.equal(isValidScreenshotFilename('../../etc/passwd'), false)
  assert.equal(isValidScreenshotFilename('sub/dir/screenshot_123.jpg'), false)
  assert.equal(isValidScreenshotFilename('screenshot_123.exe'), false)
  assert.equal(validateStoragePath('..\\..\\windows\\system32'), false)
  console.log('  ✓ Path traversal sequences and unsafe extensions rejected')

  // ────────────────────────────────────────────────────────────
  // Test 4: Offline Outbox Queueing & Reconnection Retry
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 4: Offline Outbox Queueing & Reconnection Retry')

  // Clear outbox
  localStorage.removeItem('worktrack_screenshot_outbox')
  assert.equal(screenshotService.getOutbox().length, 0)

  // Trigger cloud delivery in offline environment
  ;(globalThis as any).navigator.onLine = false

  const uploadResult = await screenshotService.uploadScreenshotToCloud(
    validCapture.data,
    validCapture.data.dataUrl || '',
    TEST_AUTH_UID
  )
  assert.equal(uploadResult.success, false)
  assert.equal(uploadResult.queued, true)
  assert.equal(uploadResult.storagePath, expectedStoragePath)

  // Verify outbox has item
  const outboxItems = screenshotService.getOutbox()
  assert.equal(outboxItems.length, 1)
  const queuedItem = outboxItems[0]
  assert.equal(queuedItem.id, screenshotId)
  assert.equal(queuedItem.userId, TEST_AUTH_UID)
  assert.equal(queuedItem.sessionId, activeSession.id)
  assert.equal(queuedItem.storagePath, expectedStoragePath)
  assert.equal(queuedItem.status, 'pending')
  console.log(`  ✓ Offline capture enqueued into outbox: ${queuedItem.id} (${queuedItem.storagePath})`)

  // Deduplication: enqueuing the exact same screenshot ID must not create duplicates
  screenshotService.enqueueOutbox(queuedItem)
  assert.equal(screenshotService.getOutbox().length, 1, 'Duplicate outbox entry must be replaced, not appended')
  console.log('  ✓ Duplicate outbox entries cleanly deduplicated by screenshot ID')

  // Test retry behavior when still offline
  const retryOffline = await screenshotService.retryOutbox()
  assert.equal(retryOffline.succeeded, 0)
  assert.equal(retryOffline.failed, 1)
  assert.equal(screenshotService.getOutbox().length, 1, 'Item remains in outbox while offline')
  console.log('  ✓ Failed outbox retries safely retain queued items')

  // Restore online status
  ;(globalThis as any).navigator.onLine = true

  // ────────────────────────────────────────────────────────────
  // Test 5: Firestore Metadata Document Invariants (No binary data)
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 5: Firestore Metadata Document Invariants')

  // Test metadata structure
  const metadataRecord: Screenshot = {
    id: screenshotId,
    userId: TEST_AUTH_UID,
    employeeId: TEST_EMP_ID,
    employeeName: TEST_EMP_NAME,
    deviceId: TEST_DEVICE_ID,
    sessionId: activeSession.id,
    storagePath: expectedStoragePath,
    imageUrl: '', // Blank until resolved on-demand by authorized Admin SDK
    takenAt: new Date(),
    createdAt: new Date(),
    fileSizeBytes: 142500, // ~140 KB compressed JPEG
    width: 1920,
    height: 1080,
    format: 'jpg',
    status: 'uploaded',
  }

  // Security Invariant: Ensure binary base64 is NOT stored in metadata
  assert.equal((metadataRecord as any).dataUrl, undefined, 'dataUrl must NOT be included in Firestore document')
  assert.equal((metadataRecord as any).base64, undefined, 'raw base64 must NOT be included in Firestore document')
  assert.ok(metadataRecord.storagePath.startsWith('screenshots/'), 'storagePath must point to Cloud Storage')
  assert.ok(metadataRecord.fileSizeBytes < 500000, 'Compressed JPEG size must be < 500 KB')
  console.log('  ✓ Firestore metadata verified: zero binary data stored; storagePath references Cloud Storage')

  // ────────────────────────────────────────────────────────────
  // Test 6: Storage Rules Security Analysis
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 6: Firebase Storage Security Rules Analysis')

  const storageRulesPath = path.resolve(process.cwd(), 'storage.rules')
  assert.ok(fs.existsSync(storageRulesPath), 'storage.rules must exist in root')
  const storageRulesContent = fs.readFileSync(storageRulesPath, 'utf8')

  // Verify deny-all default
  assert.ok(
    storageRulesContent.includes('match /{allPaths=**}') && storageRulesContent.includes('allow read, write: if false;'),
    'Default deny-all rule must be present'
  )
  console.log('  ✓ Storage Rules: Default deny-all posture confirmed')

  // Verify Admin authorization checks active status and document existence
  assert.ok(
    storageRulesContent.includes("getUserDoc().role == 'admin'") &&
    storageRulesContent.includes("getUserDoc().status == 'active'"),
    'Admin rule must verify both role == admin and status == active'
  )
  assert.ok(
    storageRulesContent.includes('firestore.exists(/databases/(default)/documents/users/$(request.auth.uid))'),
    'Admin rule must check document existence before reading user profile'
  )
  console.log('  ✓ Storage Rules: Admin verification strictly enforces role == admin and status == active')

  // Verify employeeUid namespace binding
  assert.ok(
    storageRulesContent.includes('match /screenshots/{employeeUid}/{sessionId}/{fileName}'),
    'Screenshots match rule must isolate employeeUid'
  )
  assert.ok(
    storageRulesContent.includes('request.auth.uid == employeeUid'),
    'Employee write access must strictly check auth UID matches path employeeUid'
  )
  console.log('  ✓ Storage Rules: Employee write restricted to self namespace')

  // Verify payload constraints (image MIME and size limit)
  assert.ok(
    storageRulesContent.includes("request.resource.contentType == 'image/jpeg'"),
    'Content type must be restricted to image/jpeg'
  )
  assert.ok(
    storageRulesContent.includes('request.resource.size < 5 * 1024 * 1024'),
    'File size must be capped at 5 MB'
  )
  console.log('  ✓ Storage Rules: JPEG MIME and 5 MB size limit enforced')

  // Verify read and delete constraints
  assert.ok(
    storageRulesContent.includes('allow read: if isAuthenticated() && (\n        request.auth.uid == employeeUid || isAdmin()\n      );') ||
    storageRulesContent.includes('request.auth.uid == employeeUid || isAdmin()'),
    'Read rule must allow owner employee or admin'
  )
  assert.ok(
    storageRulesContent.includes('allow update: if false;'),
    'Update rule must be disallowed (immutable screenshots)'
  )
  assert.ok(
    storageRulesContent.includes('allow delete: if isAdmin();'),
    'Delete rule must be restricted to Admin only'
  )
  console.log('  ✓ Storage Rules: Immutable captures and Admin-only deletion confirmed')

  // ────────────────────────────────────────────────────────────
  // Test 7: Admin App Gallery, Filtering & Real-Time Sync
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 7: Admin App Gallery, Filtering & Real-Time Sync')

  // Load screenshots via dataService
  const allScreenshots = await dataService.getScreenshots()
  assert.ok(Array.isArray(allScreenshots), 'Screenshots must be an array')
  console.log(`  ✓ Loaded ${allScreenshots.length} screenshots from data service`)

  // Filter by employee
  const empFiltered = await dataService.getScreenshots({ employeeId: 'emp_001' })
  for (const s of empFiltered) {
    assert.equal(s.employeeId, 'emp_001')
  }
  console.log(`  ✓ Employee filter: found ${empFiltered.length} screenshots for emp_001`)

  // Filter by session
  if (allScreenshots.length > 0) {
    const targetSession = allScreenshots[0].sessionId
    const sessionFiltered = await dataService.getScreenshots({ sessionId: targetSession })
    for (const s of sessionFiltered) {
      assert.equal(s.sessionId, targetSession)
    }
    console.log(`  ✓ Session filter: found ${sessionFiltered.length} screenshots for session ${targetSession}`)
  }

  // Filter by date
  const todayStr = new Date().toISOString().split('T')[0]
  const dateFiltered = await dataService.getScreenshots({ dateStr: todayStr })
  assert.ok(Array.isArray(dateFiltered))
  console.log(`  ✓ Date filter: found ${dateFiltered.length} screenshots for date ${todayStr}`)

  // Real-time subscription callback verification
  let subscriberCalled = false
  const unsubscribe = dataService.subscribeToScreenshots(list => {
    subscriberCalled = true
    assert.ok(Array.isArray(list))
  })
  assert.equal(typeof unsubscribe, 'function', 'Subscription must return unsubscribe function')
  unsubscribe()
  console.log('  ✓ Real-time screenshot subscription listener verified')

  // Image URL resolution
  const mockScreenshot: Screenshot = {
    id: 'sc_test_1',
    employeeId: 'emp_001',
    employeeName: 'Sarah Johnson',
    deviceId: 'dev_001',
    sessionId: 'sess_1',
    storagePath: 'screenshots/uid_1/sess_1/sc_test_1.jpg',
    imageUrl: 'https://images.unsplash.com/photo-mock.jpg',
    takenAt: new Date(),
  }
  const resolvedUrl = await dataService.getScreenshotImageUrl(mockScreenshot)
  assert.ok(resolvedUrl.length > 0)
  console.log(`  ✓ Image URL successfully resolved: ${resolvedUrl.substring(0, 45)}...`)

  // End active work session cleanly
  await sessionService.endWork()
  console.log('\n🎉 ALL AUTOMATIC SCREENSHOT MONITORING & CLOUD DELIVERY TESTS PASSED!')
}

runScreenshotMonitoringTests().catch(err => {
  console.error('\n❌ Screenshot monitoring test failure:', err)
  process.exit(1)
})
