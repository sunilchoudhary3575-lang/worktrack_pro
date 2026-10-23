// ============================================================
// WorkTrack Pro — Firebase Emulator Security Rules & Real App Flow Tests
// Real Employee App Persistence, Session Synchronization, and Outbox Retry
// ============================================================

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore'
import { ref, uploadBytes, deleteObject, getBytes, uploadString } from 'firebase/storage'

// Polyfill in-memory localStorage and browser globals for real app services in Node
const memoryStore = new Map<string, string>()
const mockLocalStorage = {
  getItem: (k: string) => memoryStore.get(k) ?? null,
  setItem: (k: string, v: string) => { memoryStore.set(k, String(v)) },
  removeItem: (k: string) => { memoryStore.delete(k) },
  clear: () => { memoryStore.clear() },
}

;(globalThis as any).localStorage = mockLocalStorage
;(globalThis as any).window = globalThis
;(globalThis as any).navigator = { onLine: true, platform: 'Win32' }

import { sessionService } from './apps/employee-app/src/services/sessionService'
import { screenshotService } from './apps/employee-app/src/services/screenshotService'
import { deviceService } from './apps/employee-app/src/services/deviceService'
import { permissionService } from './apps/employee-app/src/services/permissionService'
import { setTestFirebaseInstances, employeeAuthService } from './apps/employee-app/src/services/firebaseAuth'

const PROJECT_ID = 'worktrack-pro-8aa42'
const firestoreRules = fs.readFileSync(path.resolve('firestore.rules'), 'utf8')
const storageRules = fs.readFileSync(path.resolve('storage.rules'), 'utf8')

async function runComprehensiveEmulatorTests() {
  console.log('\n🧪 Initializing Firebase Rules & Real App Test Environment...\n')

  const testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: firestoreRules,
      host: '127.0.0.1',
      port: 8080,
    },
    storage: {
      rules: storageRules,
      host: '127.0.0.1',
      port: 9199,
    },
  })

  // Clear emulators before test execution
  await testEnv.clearFirestore()
  await testEnv.clearStorage()
  memoryStore.clear()

  // ────────────────────────────────────────────────────────────
  // Test Data Seeding using Security Rules Bypassed Context
  // ────────────────────────────────────────────────────────────
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()

    // 1. Active Admin Profile
    await setDoc(doc(db, 'users', 'admin_active_1'), {
      uid: 'admin_active_1',
      email: 'admin1@worktrack.internal',
      displayName: 'System Admin',
      role: 'admin',
      status: 'active',
      createdAt: new Date().toISOString(),
    })

    // 2. Demoted Admin Profile (Token still has stale role: 'admin', but Firestore role is 'employee')
    await setDoc(doc(db, 'users', 'admin_demoted_2'), {
      uid: 'admin_demoted_2',
      email: 'demoted@worktrack.internal',
      displayName: 'Former Admin',
      role: 'employee',
      status: 'active',
      createdAt: new Date().toISOString(),
    })

    // 3. Disabled Admin Profile (Token still has stale role: 'admin', but Firestore status is 'disabled')
    await setDoc(doc(db, 'users', 'admin_disabled_3'), {
      uid: 'admin_disabled_3',
      email: 'disabled@worktrack.internal',
      displayName: 'Locked Admin',
      role: 'admin',
      status: 'disabled',
      createdAt: new Date().toISOString(),
    })

    // 4. Active Employee 1
    await setDoc(doc(db, 'users', 'emp_active_1'), {
      uid: 'emp_active_1',
      email: 'sarah@worktrack.internal',
      displayName: 'Sarah Johnson',
      role: 'employee',
      status: 'active',
      employeeId: 'emp_001',
      createdAt: new Date().toISOString(),
    })

    // 5. Active Employee 2
    await setDoc(doc(db, 'users', 'emp_active_2'), {
      uid: 'emp_active_2',
      email: 'marcus@worktrack.internal',
      displayName: 'Marcus Chen',
      role: 'employee',
      status: 'active',
      employeeId: 'emp_002',
      createdAt: new Date().toISOString(),
    })

    // 6. Disabled Employee 3
    await setDoc(doc(db, 'users', 'emp_disabled_3'), {
      uid: 'emp_disabled_3',
      email: 'inactive@worktrack.internal',
      displayName: 'Inactive User',
      role: 'employee',
      status: 'disabled',
      employeeId: 'emp_003',
      createdAt: new Date().toISOString(),
    })

    // 7. Approved Device for Employee 1
    await setDoc(doc(db, 'devices', 'dev_emp1_001'), {
      deviceId: 'dev_emp1_001',
      userId: 'emp_active_1',
      employeeId: 'emp_001',
      deviceName: 'Sarah-Workstation',
      hostname: 'SARAH-PC',
      approvalStatus: 'approved',
      status: 'active',
      registeredAt: new Date().toISOString(),
    })

    // 8. Approved Device for Employee 2
    await setDoc(doc(db, 'devices', 'dev_emp2_002'), {
      deviceId: 'dev_emp2_002',
      userId: 'emp_active_2',
      employeeId: 'emp_002',
      deviceName: 'Marcus-Laptop',
      hostname: 'MARCUS-PC',
      approvalStatus: 'approved',
      status: 'active',
      registeredAt: new Date().toISOString(),
    })

    // 9. Pending Device for Employee 1
    await setDoc(doc(db, 'devices', 'dev_emp1_pending'), {
      deviceId: 'dev_emp1_pending',
      userId: 'emp_active_1',
      employeeId: 'emp_001',
      deviceName: 'Sarah-Tablet',
      hostname: 'SARAH-TAB',
      approvalStatus: 'pending_approval',
      status: 'offline',
      registeredAt: new Date().toISOString(),
    })

    // 10. Active Work Session for Employee 1 (dev_emp1_001)
    await setDoc(doc(db, 'work_sessions', 'sess_emp1_101'), {
      id: 'sess_emp1_101',
      userId: 'emp_active_1',
      employeeId: 'emp_001',
      deviceId: 'dev_emp1_001',
      status: 'working',
      startedAt: '2026-10-17T09:30:00.000Z',
      durationSeconds: 1200,
      workDurationSeconds: 1200,
      breakDurationSeconds: 0,
      breaks: [],
    })

    // 11. Active Work Session for Employee 2 (dev_emp2_002)
    await setDoc(doc(db, 'work_sessions', 'sess_emp2_202'), {
      id: 'sess_emp2_202',
      userId: 'emp_active_2',
      employeeId: 'emp_002',
      deviceId: 'dev_emp2_002',
      status: 'working',
      startedAt: '2026-10-17T09:30:00.000Z',
      durationSeconds: 1200,
      workDurationSeconds: 1200,
      breakDurationSeconds: 0,
      breaks: [],
    })

    // 12. Seed Screenshot in Firestore
    await setDoc(doc(db, 'screenshots', 'sc_seed_101'), {
      id: 'sc_seed_101',
      userId: 'emp_active_1',
      employeeId: 'emp_001',
      employeeName: 'Sarah Johnson',
      deviceId: 'dev_emp1_001',
      sessionId: 'sess_emp1_101',
      storagePath: 'screenshots/emp_active_1/sess_emp1_101/sc_seed_101.jpg',
      downloadUrl: '',
      takenAt: '2026-10-17T09:35:00.000Z',
      createdAt: '2026-10-17T09:35:01.000Z',
      fileSizeBytes: 145000,
      width: 1920,
      height: 1080,
      format: 'jpg',
      status: 'uploaded',
    })
  })

  // Seed Storage file for sc_seed_101
  {
    const adminStorage = testEnv.authenticatedContext('admin_active_1').storage()
    const storageRef = ref(adminStorage, 'screenshots/emp_active_1/sess_emp1_101/sc_seed_101.jpg')
    const jpegDummy = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])
    await uploadBytes(storageRef, jpegDummy, { contentType: 'image/jpeg' })
  }

  console.log('✓ Test seed documents and files initialized successfully\n')

  // ============================================================
  // Suite 1: Stale Token Claims Blocked in BOTH Services
  // ============================================================
  console.log('Suite 1: Stale Privileged Token Claims Denied in BOTH Services (Firestore + Storage)')
  {
    const demotedFirestore = testEnv.authenticatedContext('admin_demoted_2', { role: 'admin', status: 'active' }).firestore()
    const demotedStorage = testEnv.authenticatedContext('admin_demoted_2', { role: 'admin', status: 'active' }).storage()

    await assertFails(getDoc(doc(demotedFirestore, 'users', 'emp_active_1')))
    await assertFails(deleteDoc(doc(demotedFirestore, 'screenshots', 'sc_seed_101')))
    await assertFails(deleteObject(ref(demotedStorage, 'screenshots/emp_active_1/sess_emp1_101/sc_seed_101.jpg')))
    await assertFails(getBytes(ref(demotedStorage, 'screenshots/emp_active_1/sess_emp1_101/sc_seed_101.jpg')))
    console.log('  ✓ Demoted admin denied in Firestore and Storage')

    const disabledFirestore = testEnv.authenticatedContext('admin_disabled_3', { role: 'admin', status: 'active' }).firestore()
    const disabledStorage = testEnv.authenticatedContext('admin_disabled_3', { role: 'admin', status: 'active' }).storage()

    await assertFails(getDoc(doc(disabledFirestore, 'users', 'emp_active_1')))
    await assertFails(deleteDoc(doc(disabledFirestore, 'screenshots', 'sc_seed_101')))
    await assertFails(deleteObject(ref(disabledStorage, 'screenshots/emp_active_1/sess_emp1_101/sc_seed_101.jpg')))
    await assertFails(getBytes(ref(disabledStorage, 'screenshots/emp_active_1/sess_emp1_101/sc_seed_101.jpg')))
    console.log('  ✓ Disabled admin denied in Firestore and Storage')
  }

  // ============================================================
  // Suite 2: Client Profile Creation Removed & Allowlist Enforced
  // ============================================================
  console.log('\nSuite 2: Client Profile Creation Removed & Allowlist Enforced')
  {
    const ghostDb = testEnv.authenticatedContext('ghost_unprovisioned').firestore()
    await assertFails(
      setDoc(doc(ghostDb, 'users', 'ghost_unprovisioned'), {
        uid: 'ghost_unprovisioned',
        role: 'employee',
        status: 'active',
      })
    )
    console.log('  ✓ Unprovisioned user cannot create profile')

    const emp1Db = testEnv.authenticatedContext('emp_active_1').firestore()
    await assertFails(updateDoc(doc(emp1Db, 'users', 'emp_active_1'), { role: 'admin' }))
    await assertFails(updateDoc(doc(emp1Db, 'users', 'emp_active_1'), { status: 'disabled' }))
    await assertSucceeds(
      updateDoc(doc(emp1Db, 'users', 'emp_active_1'), {
        displayName: 'Sarah J. Johnson',
        contactEmail: 'sarah.j@example.com',
      })
    )
    console.log('  ✓ Privilege escalation blocked; allowlisted fields update succeeds')
  }

  // ============================================================
  // Suite 3: Devices Lifecycle & Disabled Restrictions
  // ============================================================
  console.log('\nSuite 3: Devices Lifecycle & Disabled Restrictions')
  {
    const disabledDb = testEnv.authenticatedContext('emp_disabled_3').firestore()
    await assertFails(
      setDoc(doc(disabledDb, 'devices', 'dev_emp3_new'), {
        deviceId: 'dev_emp3_new',
        userId: 'emp_disabled_3',
        employeeId: 'emp_003',
        approvalStatus: 'pending_approval',
      })
    )
    console.log('  ✓ Disabled employee cannot register device')
  }

  // ============================================================
  // Suite 4: Work Session Transitions & Reopening Prevention
  // ============================================================
  console.log('\nSuite 4: Work Session Transitions & Reopening Prevention')
  {
    const emp1Db = testEnv.authenticatedContext('emp_active_1').firestore()

    // 4a. Create a fresh working session
    await assertSucceeds(
      setDoc(doc(emp1Db, 'work_sessions', 'sess_trans_test'), {
        id: 'sess_trans_test',
        userId: 'emp_active_1',
        employeeId: 'emp_001',
        deviceId: 'dev_emp1_001',
        status: 'working',
        startedAt: '2026-10-17T10:00:00.000Z',
      })
    )

    // 4b. Transition: working -> paused (take break)
    await assertSucceeds(
      updateDoc(doc(emp1Db, 'work_sessions', 'sess_trans_test'), {
        status: 'paused',
        pausedAt: '2026-10-17T11:00:00.000Z',
      })
    )
    console.log('  ✓ Legitimate transition: working -> paused succeeds')

    // 4c. Transition: paused -> working (resume work)
    await assertSucceeds(
      updateDoc(doc(emp1Db, 'work_sessions', 'sess_trans_test'), {
        status: 'working',
      })
    )
    console.log('  ✓ Legitimate transition: paused -> working succeeds')

    // 4d. Security Check: Transition to completed WITHOUT nonempty endedAt must fail
    await assertFails(
      updateDoc(doc(emp1Db, 'work_sessions', 'sess_trans_test'), {
        status: 'completed',
      })
    )
    await assertFails(
      updateDoc(doc(emp1Db, 'work_sessions', 'sess_trans_test'), {
        status: 'completed',
        endedAt: '',
      })
    )
    console.log('  ✓ Session update to completed without nonempty endedAt is strictly blocked')

    // 4e. Transition: working -> completed WITH valid endedAt succeeds
    await assertSucceeds(
      updateDoc(doc(emp1Db, 'work_sessions', 'sess_trans_test'), {
        status: 'completed',
        endedAt: '2026-10-17T18:00:00.000Z',
      })
    )
    console.log('  ✓ Legitimate transition: working -> completed with valid endedAt succeeds')

    // 4f. CRITICAL SECURITY CHECK: Employee attempts to reopen completed session
    await assertFails(
      updateDoc(doc(emp1Db, 'work_sessions', 'sess_trans_test'), {
        status: 'working',
      })
    )
    await assertFails(
      updateDoc(doc(emp1Db, 'work_sessions', 'sess_trans_test'), {
        status: 'paused',
      })
    )
    console.log('  ✓ Reopening completed session back to working/paused is strictly blocked')

    // 4g. Idempotent retry on completed session succeeds
    await assertSucceeds(
      updateDoc(doc(emp1Db, 'work_sessions', 'sess_trans_test'), {
        status: 'completed',
        endedAt: '2026-10-17T18:00:00.000Z',
        durationSeconds: 28800,
      })
    )
    console.log('  ✓ Idempotent update on completed session succeeds')
  }

  // ============================================================
  // Suite 5: Screenshot Format & Size Validation Alignment
  // ============================================================
  console.log('\nSuite 5: Screenshot Format & Size Validation Alignment')
  {
    const emp1Db = testEnv.authenticatedContext('emp_active_1').firestore()
    const emp1Storage = testEnv.authenticatedContext('emp_active_1').storage()

    // 5a. Format 'png' with .jpg storagePath rejected by Firestore rules
    const pngPayload = {
      id: 'sc_fmt_png_test',
      userId: 'emp_active_1',
      employeeId: 'emp_001',
      deviceId: 'dev_emp1_001',
      sessionId: 'sess_emp1_101',
      storagePath: 'screenshots/emp_active_1/sess_emp1_101/sc_fmt_png_test.jpg',
      takenAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      fileSizeBytes: 120000,
      width: 1920,
      height: 1080,
      format: 'png', // Misaligned with .jpg path
      status: 'uploaded',
    }
    await assertFails(setDoc(doc(emp1Db, 'screenshots', 'sc_fmt_png_test'), pngPayload))
    console.log('  ✓ Non-jpeg format (png) rejected for .jpg storage path in Firestore')

    // 5b. File size >= 5 MB rejected by Firestore rules (< 5 * 1024 * 1024)
    const oversizedPayload = {
      ...pngPayload,
      id: 'sc_oversized_test',
      format: 'jpg',
      fileSizeBytes: 5 * 1024 * 1024, // Exactly 5 MB (must be strictly < 5MB)
      storagePath: 'screenshots/emp_active_1/sess_emp1_101/sc_oversized_test.jpg',
    }
    await assertFails(setDoc(doc(emp1Db, 'screenshots', 'sc_oversized_test'), oversizedPayload))
    console.log('  ✓ File size >= 5 MB rejected by Firestore rules (< 5 MB enforced)')

    // 5c. Valid JPEG upload accepted by Storage rules
    const validJpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])
    await assertSucceeds(
      uploadBytes(
        ref(emp1Storage, 'screenshots/emp_active_1/sess_emp1_101/sc_valid_target.jpg'),
        validJpegBytes,
        { contentType: 'image/jpeg' }
      )
    )
    console.log('  ✓ Valid JPEG upload (contentType == image/jpeg) accepted by Storage rules')

    // 5d. Non-JPEG (e.g. image/png) upload rejected by Storage rules
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    await assertFails(
      uploadBytes(
        ref(emp1Storage, 'screenshots/emp_active_1/sess_emp1_101/sc_invalid_png.jpg'),
        pngBytes,
        { contentType: 'image/png' }
      )
    )
    console.log('  ✓ Non-JPEG upload (contentType == image/png) rejected by Storage rules')

    // 5e. Oversized file (>= 5 MB) rejected by Storage rules
    const oversizedBytes = new Uint8Array(5 * 1024 * 1024)
    await assertFails(
      uploadBytes(
        ref(emp1Storage, 'screenshots/emp_active_1/sess_emp1_101/sc_oversized.jpg'),
        oversizedBytes,
        { contentType: 'image/jpeg' }
      )
    )
    console.log('  ✓ Oversized file (>= 5 MB) rejected by Storage rules')
  }

  // ============================================================
  // Suite 6: Real App Flow — Offline Session Start & Completion Sync
  // ============================================================
  console.log('\nSuite 6: Real App Flow — Offline Session Start & Completion Sync')
  {
    // Setup approved device in local storage for real deviceService
    memoryStore.set(
      'worktrack_registration_record',
      JSON.stringify({
        deviceId: 'dev_emp1_001',
        deviceName: 'Sarah Workstation',
        hostname: 'SARAH-PC',
        employeeId: 'emp_001',
        employeeName: 'Sarah Johnson',
        status: 'approved',
      })
    )

    // Set employee auth in app auth service
    memoryStore.set(
      'worktrack_current_employee',
      JSON.stringify({
        uid: 'emp_active_1',
        employeeId: 'emp_001',
        email: 'sarah@worktrack.internal',
        role: 'employee',
        status: 'active',
      })
    )

    // Grant employee monitoring pre-authorization
    await permissionService.grantPreAuthorization({
      deviceId: 'dev_emp1_001',
      employeeId: 'emp_001',
    })

    // Simulate OFFLINE: clear test Firebase instances so network writes fail
    setTestFirebaseInstances(null)
    ;(globalThis as any).navigator.onLine = false

    // 1. Employee starts work while offline
    const offlineSession = await sessionService.startWork()
    assert.ok(offlineSession.id.startsWith('sess_'), 'Offline session started with ID')
    console.log(`  ✓ Real sessionService started work session offline: ${offlineSession.id}`)

    // 2. Employee captures a screenshot while offline (queued to outbox)
    const captureResult = await screenshotService.captureScreenshot({
      deviceId: 'dev_emp1_001',
      sessionId: offlineSession.id,
      employeeId: 'emp_001',
    })
    assert.ok(captureResult.success, 'Capture succeeded locally')
    assert.ok(captureResult.data?.id, 'Capture produced local metadata')

    // Upload attempt while offline queues to outbox
    const uploadRes = await screenshotService.uploadScreenshotToCloud(
      captureResult.data!,
      captureResult.data!.dataUrl!,
      'emp_active_1'
    )
    assert.ok(uploadRes.queued, 'Upload was queued to outbox while offline')
    assert.equal(screenshotService.getOutbox().length, 1, 'Outbox contains 1 pending item')
    console.log('  ✓ Screenshot captured offline and queued into real outbox')

    // 3. Employee ends work while offline
    const endedSession = await sessionService.endWork()
    assert.equal(endedSession.status, 'ended', 'Session ended offline')
    const history = await sessionService.getHistory()
    assert.ok(history.some(s => s.id === offlineSession.id), 'Ended session archived to history')
    console.log('  ✓ Real sessionService completed and archived session offline')

    // 4. Client reconnects: Configure real app services with emulator client SDK context
    const emp1Context = testEnv.authenticatedContext('emp_active_1')
    setTestFirebaseInstances({
      app: null,
      auth: null,
      db: emp1Context.firestore(),
      storage: emp1Context.storage(),
    })
    ;(globalThis as any).navigator.onLine = true

    // 5. Trigger real retryOutbox() upon reconnection
    const retryRes = await screenshotService.retryOutbox()
    assert.equal(retryRes.failed, 0, 'No outbox failures')
    assert.equal(retryRes.succeeded, 1, '1 item delivered')
    assert.equal(screenshotService.getOutbox().length, 0, 'Outbox cleared after successful sync')
    console.log('  ✓ Real retryOutbox() executed upon reconnection: 1 succeeded, 0 failed')

    // 6. Verify in Firestore: Session document was created in 'completed' status
    const sessionDocSnap = await getDoc(doc(emp1Context.firestore(), 'work_sessions', offlineSession.id))
    assert.ok(sessionDocSnap.exists(), 'Work session document created in Firestore')
    assert.equal(sessionDocSnap.data()?.status, 'completed', 'Session status is completed in Firestore')
    assert.equal(sessionDocSnap.data()?.userId, 'emp_active_1', 'Session userId matches authenticated employee')
    console.log('  ✓ Work session document verified in Firestore with completed status and correct ownership')

    // 7. Verify in Firestore: Screenshot document exists with correct links
    const screenshotDocSnap = await getDoc(doc(emp1Context.firestore(), 'screenshots', captureResult.data!.id))
    assert.ok(screenshotDocSnap.exists(), 'Screenshot metadata document created in Firestore')
    assert.equal(screenshotDocSnap.data()?.sessionId, offlineSession.id, 'Metadata links to offline session')
    assert.equal(screenshotDocSnap.data()?.userId, 'emp_active_1', 'Metadata links to employee UID')
    console.log('  ✓ Screenshot metadata document verified in Firestore')

    // 8. Verify in Storage: Screenshot object exists
    const storageFileBytes = await getBytes(ref(emp1Context.storage(), uploadRes.storagePath!))
    assert.ok(storageFileBytes.byteLength > 0, 'Screenshot bytes stored in Firebase Storage')
    console.log('  ✓ Screenshot image verified in Firebase Storage at expected path')
  }

  // ============================================================
  // Suite 7: Real App Flow — Partial Upload Success & Safe Idempotent Retry
  // ============================================================
  console.log('\nSuite 7: Real App Flow — Partial Upload Success & Safe Idempotent Retry')
  {
    const emp1Context = testEnv.authenticatedContext('emp_active_1')
    const partialId = `sc_partial_${Date.now()}`
    const partialPath = `screenshots/emp_active_1/sess_emp1_101/${partialId}.jpg`
    const dummyJpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA='

    // Scenario 1: Storage upload succeeded in previous attempt, but Firestore failed
    const storageRef = ref(emp1Context.storage(), partialPath)
    await uploadString(storageRef, dummyJpeg, 'data_url', { contentType: 'image/jpeg' })

    // Verify object already exists in Storage
    const existingBytes = await getBytes(storageRef)
    assert.ok(existingBytes.byteLength > 0, 'Pre-existing Storage object confirmed')

    // Enqueue item into outbox (simulating partial failure where metadata write was interrupted)
    screenshotService.enqueueOutbox({
      id: partialId,
      sessionId: 'sess_emp1_101',
      employeeId: 'emp_001',
      employeeName: 'Sarah Johnson',
      userId: 'emp_active_1',
      deviceId: 'dev_emp1_001',
      takenAt: new Date().toISOString(),
      storagePath: partialPath,
      dataUrl: dummyJpeg,
      fileSizeBytes: 125000,
      width: 1920,
      height: 1080,
      format: 'jpg',
      status: 'failed',
      retryCount: 1,
    })

    // Run real retryOutbox()
    const partialRetryRes = await screenshotService.retryOutbox()
    assert.equal(partialRetryRes.failed, 0, 'Partial retry must not fail')
    assert.equal(partialRetryRes.succeeded, 1, 'Partial retry completed metadata successfully')
    assert.equal(screenshotService.getOutbox().length, 0, 'Outbox cleared after partial retry')

    // Verify metadata was written to Firestore without Storage overwrite error
    const partialDocSnap = await getDoc(doc(emp1Context.firestore(), 'screenshots', partialId))
    assert.ok(partialDocSnap.exists(), 'Metadata document created successfully on retry')
    console.log('  ✓ Partial upload retry safely reused existing Storage object and completed Firestore metadata')

    // Scenario 2: Metadata already exists in Firestore but queue was not cleared (e.g. process crashed before clear)
    screenshotService.enqueueOutbox({
      id: partialId, // Same ID already in Firestore!
      sessionId: 'sess_emp1_101',
      employeeId: 'emp_001',
      userId: 'emp_active_1',
      deviceId: 'dev_emp1_001',
      takenAt: new Date().toISOString(),
      storagePath: partialPath,
      dataUrl: dummyJpeg,
      fileSizeBytes: 125000,
      width: 1920,
      height: 1080,
      format: 'jpg',
      status: 'failed',
      retryCount: 1,
    })

    const duplicateRetryRes = await screenshotService.retryOutbox()
    assert.equal(duplicateRetryRes.failed, 0, 'Duplicate retry must not throw immutability error')
    assert.equal(duplicateRetryRes.succeeded, 1, 'Duplicate retry safely marked as complete')
    assert.equal(screenshotService.getOutbox().length, 0, 'Outbox cleared without looping')
    console.log('  ✓ Outbox retry with existing metadata safely succeeded without violating immutability or looping')
  }

  // Cleanup test environment
  await testEnv.cleanup()

  console.log('\n============================================================')
  console.log('🎉 ALL FIREBASE EMULATOR TESTS & REAL APP FLOWS PASSED!')
  console.log('============================================================\n')
}

runComprehensiveEmulatorTests().catch((err) => {
  console.error('\n❌ Security rules regression test failure:', err)
  process.exit(1)
})
