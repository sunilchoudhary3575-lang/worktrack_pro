// ============================================================
// One-Click Admin Live View & Pre-Authorization Test Suite
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
import { dataService } from './apps/admin-app/src/services/dataService.js'
import { permissionService } from './apps/employee-app/src/services/permissionService.js'
import { deviceService } from './apps/employee-app/src/services/deviceService.js'
import {
  CURRENT_PRE_AUTH_POLICY,
  isValidPermissionTransition,
} from './packages/shared/dist/index.js'

async function runOneClickTests() {
  console.log('🧪 Starting Pre-authorized One-Click Admin Live View Tests...\n')
  mockStorage.clear()
  await dataService.resetMockData()
  await permissionService.resetAll()

  // Setup approved device in employee service
  await deviceService.registerDevice({
    employeeId: 'emp_001',
    employeeName: 'Sarah Johnson',
    department: 'Engineering',
  })
  await deviceService.simulateAdminReview('approved')

  // ────────────────────────────────────────────────────────────
  // Test 1: No viewing without valid authorization
  // ────────────────────────────────────────────────────────────
  console.log('Test 1: No viewing without valid authorization')
  // dev_001 is an approved device, but has not granted pre-authorization yet
  const initialAuth = await dataService.getPreAuthorization('dev_001')
  assert.equal(initialAuth, null, 'Pre-authorization must not be present by default')

  await assert.rejects(
    async () => {
      await dataService.startPreAuthorizedSession('emp_001', 'dev_001')
    },
    /Pre-authorized viewing blocked: Employee has not granted active monitoring authorization/i,
    'Should block one-click session when authorization is not granted'
  )
  console.log('  ✓ Viewing blocked when pre-authorization has not been granted')

  // ────────────────────────────────────────────────────────────
  // Test 2: Viewing starts with valid pre-authorization without a new approval prompt
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 2: Viewing starts with valid pre-authorization without a new approval prompt')
  // Employee grants pre-authorization
  const grantT0 = new Date('2026-10-16T10:00:00.000Z')
  const grantedRecord = await permissionService.grantPreAuthorization({
    employeeId: 'emp_001',
    employeeName: 'Sarah Johnson',
    deviceId: 'dev_001',
    deviceName: 'LAPTOP-SJ-001',
    timestamp: grantT0,
  })
  assert.equal(grantedRecord.status, 'granted')
  assert.equal(grantedRecord.policyVersion, CURRENT_PRE_AUTH_POLICY.version)
  assert.ok(grantedRecord.grantedAt instanceof Date, 'grantedAt must be a Date')

  // Admin initiates one-click live view session
  const session1 = await dataService.startPreAuthorizedSession('emp_001', 'dev_001', {
    adminName: 'Security Admin',
  })
  assert.ok(session1.id.startsWith('req_oneclick_'), 'Session ID must be generated with one-click prefix')
  assert.equal(session1.status, 'approved', 'Pre-authorized session must immediately be approved')
  assert.equal(session1.isPreAuthorized, true, 'isPreAuthorized flag must be true')
  assert.equal(session1.requiresEmployeeApproval, false, 'requiresEmployeeApproval must be false')
  assert.ok(session1.requestedAt instanceof Date, 'requestedAt must be Date')
  assert.ok(session1.respondedAt instanceof Date, 'respondedAt must be Date')

  // Check that NO pending request was created
  const pendingCheck = await permissionService.getPendingRequestForDevice('dev_001')
  assert.equal(pendingCheck, null, 'No pending approval prompt should exist for pre-authorized session')
  console.log(`  ✓ One-click session started immediately without per-session prompt: ${session1.id}`)

  // ────────────────────────────────────────────────────────────
  // Test 3: Revoked authorization blocks new sessions
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 3: Revoked authorization blocks new sessions')
  // Stop session1 first
  await dataService.stopScreenView(session1.id, 'admin')

  // Employee revokes pre-authorization
  const revokeT0 = new Date('2026-10-16T11:00:00.000Z')
  const revokedRecord = await permissionService.revokePreAuthorization('dev_001', {
    revokedBy: 'employee',
    reason: 'Employee exercised right to revoke persistent authorization',
    timestamp: revokeT0,
  })
  assert.equal(revokedRecord.status, 'revoked')
  assert.equal(revokedRecord.revokedBy, 'employee')
  assert.ok(revokedRecord.revokedAt instanceof Date, 'revokedAt must be recorded')

  // Attempting to start new one-click session must be blocked
  await assert.rejects(
    async () => {
      await dataService.startPreAuthorizedSession('emp_001', 'dev_001')
    },
    /Pre-authorized viewing blocked: Employee has not granted active monitoring authorization \(status: "revoked"\)/i,
    'Should block one-click session when authorization is revoked'
  )
  console.log('  ✓ Revoked authorization correctly blocks new viewing sessions')

  // ────────────────────────────────────────────────────────────
  // Test 4: Only approved devices are eligible
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 4: Only approved devices are eligible')
  // dev_004 is rejected
  await assert.rejects(
    async () => {
      await dataService.grantPreAuthorization({
        employeeId: 'emp_004',
        deviceId: 'dev_004',
      })
    },
    /Cannot grant pre-authorization: Device registration status is "rejected"/i,
    'Cannot grant pre-authorization for rejected device'
  )

  await assert.rejects(
    async () => {
      await dataService.startPreAuthorizedSession('emp_004', 'dev_004')
    },
    /Cannot start viewing session: Device registration is "rejected"/i,
    'Cannot start pre-authorized session for rejected device'
  )
  console.log('  ✓ Unapproved devices safely blocked from authorization and viewing')

  // ────────────────────────────────────────────────────────────
  // Test 5: Duplicate viewing sessions are blocked
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 5: Duplicate viewing sessions are blocked')
  // Re-grant pre-authorization to dev_001
  await permissionService.grantPreAuthorization({
    employeeId: 'emp_001',
    deviceId: 'dev_001',
  })

  // Start active session
  const session2 = await dataService.startPreAuthorizedSession('emp_001', 'dev_001')
  assert.equal(session2.status, 'approved')

  // Try starting duplicate session for the same device
  await assert.rejects(
    async () => {
      await dataService.startPreAuthorizedSession('emp_001', 'dev_001')
    },
    /Duplicate session rejected: A screen viewing session for device "dev_001" is already active/i,
    'Should reject duplicate concurrent sessions'
  )
  console.log('  ✓ Duplicate concurrent viewing sessions blocked')

  // ────────────────────────────────────────────────────────────
  // Test 6: Employee can stop a session
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 6: Employee can stop a session')
  const empStopped = await permissionService.stopSharing(session2.id, 'dev_001', {
    stoppedBy: 'employee',
  })
  assert.equal(empStopped.status, 'stopped')
  assert.equal(empStopped.stoppedBy, 'employee')
  assert.ok(empStopped.stoppedAt instanceof Date, 'stoppedAt must be recorded')
  console.log(`  ✓ Employee stopped session immediately: ${empStopped.id}`)

  // ────────────────────────────────────────────────────────────
  // Test 7: Admin can stop a session
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 7: Admin can stop a session')
  const session3 = await dataService.startPreAuthorizedSession('emp_001', 'dev_001')
  assert.equal(session3.status, 'approved')

  const adminStopped = await dataService.stopScreenView(session3.id, 'admin')
  assert.equal(adminStopped.status, 'stopped')
  assert.equal(adminStopped.stoppedBy, 'admin')
  assert.ok(adminStopped.stoppedAt instanceof Date, 'stoppedAt must be recorded')
  console.log(`  ✓ Admin stopped session: ${adminStopped.id}`)

  // ────────────────────────────────────────────────────────────
  // Test 8: A stopped session cannot restart using the same session ID
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 8: A stopped session cannot restart using the same session ID')
  await assert.rejects(
    async () => {
      await permissionService.approveRequest(session3.id, 'dev_001')
    },
    /Invalid state transition: Cannot approve request in status "stopped"/i,
    'Stopped session cannot transition back to approved'
  )

  // A later session gets a brand new ID
  const session4 = await dataService.startPreAuthorizedSession('emp_001', 'dev_001')
  assert.notEqual(session4.id, session3.id, 'Later session must have a unique ID')
  assert.equal(session4.status, 'approved')
  console.log(`  ✓ Stopped session cannot resume; later session created with new ID: ${session4.id}`)

  // Clean up session4
  await dataService.stopScreenView(session4.id, 'admin')

  // ────────────────────────────────────────────────────────────
  // Test 9: The active monitoring indicator is displayed
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 9: The active monitoring indicator is displayed')
  // When no session is active
  const noActive = await permissionService.getActiveApprovedRequest('dev_001')
  assert.equal(noActive, null, 'Active request should be null when stopped')

  // When session is active
  const session5 = await dataService.startPreAuthorizedSession('emp_001', 'dev_001')
  const activeSession = await permissionService.getActiveApprovedRequest('dev_001')
  assert.ok(activeSession, 'Active session must be found when running')
  assert.equal(activeSession?.id, session5.id)
  assert.equal(activeSession?.isPreAuthorized, true)
  assert.equal(activeSession?.status, 'approved')
  console.log('  ✓ Active monitoring indicator presence accurately reflects session lifecycle')

  // Clean up session5
  await dataService.stopScreenView(session5.id, 'admin')

  // ────────────────────────────────────────────────────────────
  // Test 10: Authorization metadata persists in the mock service
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 10: Authorization metadata persists in the mock service')
  const testT0 = new Date('2026-10-16T14:30:00.000Z')
  await permissionService.grantPreAuthorization({
    employeeId: 'emp_001',
    employeeName: 'Sarah Johnson',
    deviceId: 'dev_001',
    deviceName: 'LAPTOP-SJ-001',
    adminName: 'Lead Admin',
    policyVersion: CURRENT_PRE_AUTH_POLICY.version,
    timestamp: testT0,
  })

  // Read back through both employee service and admin data service
  const empAuth = await permissionService.getPreAuthorization('dev_001')
  const adminAuth = await dataService.getPreAuthorization('dev_001')

  assert.ok(empAuth, 'Employee service must read persisted auth')
  assert.ok(adminAuth, 'Admin service must read persisted auth')
  assert.equal(empAuth?.status, 'granted')
  assert.equal(adminAuth?.status, 'granted')
  assert.equal(empAuth?.policyVersion, 'v1.0-standard-oversight')
  assert.equal(adminAuth?.policyVersion, 'v1.0-standard-oversight')
  assert.equal(empAuth?.grantedAt?.getTime(), testT0.getTime())
  assert.equal(adminAuth?.grantedAt?.getTime(), testT0.getTime())
  console.log('  ✓ Authorization metadata perfectly persists across mock service layers')

  console.log('\n🎉 ALL PRE-AUTHORIZED ONE-CLICK ADMIN LIVE VIEW TESTS PASSED!\n')
}

runOneClickTests().catch(err => {
  console.error('\n❌ One-Click Live View Test Failed:', err)
  process.exit(1)
})
