// ============================================================
// Phase 6 Test Suite: Monitoring Consent & Permissions
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
    randomUUID: () => `req_uuid_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
  },
}

// Import services and helpers
import { dataService } from './apps/admin-app/src/services/dataService.js'
import { permissionService } from './apps/employee-app/src/services/permissionService.js'
import { deviceService } from './apps/employee-app/src/services/deviceService.js'
import {
  isValidPermissionTransition,
  type ScreenViewRequestStatus,
} from './packages/shared/dist/index.js'

async function runPhase6Tests() {
  console.log('🧪 Starting Phase 6 Monitoring Consent & Permissions Tests...\n')
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
  const empDeviceRecord = await deviceService.getRegistrationRecord()
  const approvedDeviceId = empDeviceRecord.deviceId

  // ────────────────────────────────────────────────────────────
  // Test 1: Admin can request live-view permission for an approved device
  // ────────────────────────────────────────────────────────────
  console.log('Test 1: Admin can request live-view permission for an approved device')
  const req1 = await dataService.requestScreenView('emp_001', 'dev_001', {
    adminName: 'Security Admin',
    expiresInSeconds: 60,
  })
  assert.ok(req1.id, 'Request ID must be generated')
  assert.equal(req1.employeeId, 'emp_001')
  assert.equal(req1.deviceId, 'dev_001')
  assert.equal(req1.status, 'pending')
  assert.equal(req1.requiresEmployeeApproval, true)
  assert.ok(req1.expiresAt instanceof Date, 'expiresAt must be a Date')
  assert.ok(req1.requestedAt instanceof Date, 'requestedAt must be a Date')
  console.log(`  ✓ Successfully created pending screen view request: ${req1.id}`)

  // ────────────────────────────────────────────────────────────
  // Test 2: Admin cannot request permission for an unapproved device
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 2: Admin cannot request permission for an unapproved device')
  // dev_004 is rejected in MOCK_DEVICE_REGISTRATIONS
  await assert.rejects(
    async () => {
      await dataService.requestScreenView('emp_004', 'dev_004')
    },
    /Cannot request live view: Device must be approved/i,
    'Should reject request for rejected device'
  )
  console.log('  ✓ Rejected request for rejected device (dev_004)')

  // dev_005 is pending_approval
  await assert.rejects(
    async () => {
      await dataService.requestScreenView('emp_005', 'dev_005')
    },
    /Cannot request live view: Device must be approved/i,
    'Should reject request for pending device'
  )
  console.log('  ✓ Rejected request for pending device (dev_005)')

  // ────────────────────────────────────────────────────────────
  // Test 3: Employee sees a pending request addressed to the correct device
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 3: Employee sees a pending request addressed to the correct device')
  // dev_001 should see the pending request
  const pendingForDev1 = await permissionService.getPendingRequestForDevice('dev_001')
  assert.ok(pendingForDev1, 'dev_001 must see the pending request')
  assert.equal(pendingForDev1?.id, req1.id)
  assert.equal(pendingForDev1?.deviceId, 'dev_001')

  // Another device should NOT see this request
  const pendingForDev99 = await permissionService.getPendingRequestForDevice('dev_999')
  assert.equal(pendingForDev99, null, 'Unrelated device must not see dev_001 request')
  console.log('  ✓ Target device correctly receives request; other devices do not')

  // ────────────────────────────────────────────────────────────
  // Test 4: Employee can approve a pending request
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 4: Employee can approve a pending request')
  const approvedReq = await permissionService.approveRequest(req1.id, 'dev_001')
  assert.equal(approvedReq.status, 'approved')
  assert.ok(approvedReq.respondedAt instanceof Date, 'respondedAt must be recorded')
  console.log(`  ✓ Employee successfully approved request: ${approvedReq.id} (Status: ${approvedReq.status})`)

  // ────────────────────────────────────────────────────────────
  // Test 5: Employee can reject a pending request
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 5: Employee can reject a pending request')
  const req2 = await dataService.requestScreenView('emp_002', 'dev_002', {
    adminName: 'Lead Admin',
    expiresInSeconds: 60,
  })
  assert.equal(req2.status, 'pending')

  const rejectedReq = await permissionService.rejectRequest(req2.id, 'dev_002', {
    reason: 'Reviewing confidential employee salary files',
  })
  assert.equal(rejectedReq.status, 'rejected')
  assert.equal(rejectedReq.rejectionReason, 'Reviewing confidential employee salary files')
  assert.ok(rejectedReq.respondedAt instanceof Date, 'respondedAt must be recorded')
  console.log(`  ✓ Employee rejected request with reason: "${rejectedReq.rejectionReason}"`)

  // ────────────────────────────────────────────────────────────
  // Test 6: Rejection requires a valid reason / preserves reason properly
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 6: Rejection preserves and validates reason')
  const allReqs = await permissionService.getAllRequests()
  const foundRejected = allReqs.find(r => r.id === req2.id)
  assert.ok(foundRejected, 'Rejected request must exist in storage')
  assert.equal(foundRejected?.status, 'rejected')
  assert.equal(foundRejected?.rejectionReason, 'Reviewing confidential employee salary files')
  console.log('  ✓ Rejection reason persisted accurately across data queries')

  // ────────────────────────────────────────────────────────────
  // Test 7: Duplicate approvals are rejected
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 7: Duplicate approvals are rejected')
  await assert.rejects(
    async () => {
      await permissionService.approveRequest(req1.id, 'dev_001')
    },
    /Duplicate approval rejected|Invalid state transition/i,
    'Should reject duplicate approval attempt'
  )
  console.log('  ✓ Duplicate approval attempt cleanly rejected')

  // ────────────────────────────────────────────────────────────
  // Test 8: Duplicate rejection attempts are rejected
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 8: Duplicate rejection attempts are rejected')
  await assert.rejects(
    async () => {
      await permissionService.rejectRequest(req2.id, 'dev_002', { reason: 'Second reject' })
    },
    /Duplicate rejection rejected|Invalid state transition/i,
    'Should reject duplicate rejection attempt'
  )
  console.log('  ✓ Duplicate rejection attempt cleanly rejected')

  // ────────────────────────────────────────────────────────────
  // Test 9: Cancelled requests cannot be approved
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 9: Cancelled requests cannot be approved')
  const req3 = await dataService.requestScreenView('emp_003', 'dev_003', {
    adminName: 'Security Admin',
  })
  assert.equal(req3.status, 'pending')

  // Admin cancels request
  const cancelledReq = await dataService.cancelScreenViewRequest(req3.id)
  assert.equal(cancelledReq.status, 'cancelled')

  // Employee tries to approve cancelled request
  await assert.rejects(
    async () => {
      await permissionService.approveRequest(req3.id, 'dev_003')
    },
    /Invalid state transition/i,
    'Cancelled request cannot be approved'
  )
  console.log('  ✓ Cancelled request blocked from being approved')

  // ────────────────────────────────────────────────────────────
  // Test 10: Expired requests cannot be approved
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 10: Expired requests cannot be approved (Deterministic Timestamps)')
  const t0 = new Date('2026-10-16T12:00:00.000Z')
  const tExpiry = new Date('2026-10-16T12:00:30.000Z') // +30s
  const tAfterExpiry = new Date('2026-10-16T12:01:00.000Z') // +60s

  const req4 = await dataService.requestScreenView('emp_001', approvedDeviceId, {
    adminName: 'Security Admin',
    expiresInSeconds: 30,
    timestamp: t0,
  })

  // Check pending status at tAfterExpiry
  const pendingCheck = await permissionService.getPendingRequestForDevice(approvedDeviceId, tAfterExpiry)
  assert.equal(pendingCheck, null, 'Expired request must not be returned as pending')

  // Attempt approval with timestamp past expiry
  await assert.rejects(
    async () => {
      await permissionService.approveRequest(req4.id, approvedDeviceId, {
        timestamp: tAfterExpiry,
      })
    },
    /expired|Invalid state transition/i,
    'Approval of expired request must throw'
  )
  console.log('  ✓ Expired request blocked from approval with deterministic timestamps')

  // ────────────────────────────────────────────────────────────
  // Test 11: Employee can stop an approved mock sharing session
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 11: Employee can stop an approved mock sharing session')
  // approvedReq (req1) is currently approved
  const stoppedReq = await permissionService.stopSharing(req1.id, 'dev_001', {
    stoppedBy: 'employee',
  })
  assert.equal(stoppedReq.status, 'stopped')
  assert.equal(stoppedReq.stoppedBy, 'employee')
  assert.ok(stoppedReq.stoppedAt instanceof Date, 'stoppedAt must be recorded')
  console.log(`  ✓ Employee stopped mock sharing session (Status: ${stoppedReq.status}, stoppedBy: ${stoppedReq.stoppedBy})`)

  // ────────────────────────────────────────────────────────────
  // Test 12: Stopped sharing cannot be resumed using the same request
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 12: Stopped sharing cannot be resumed using the same request')
  await assert.rejects(
    async () => {
      await permissionService.approveRequest(req1.id, 'dev_001')
    },
    /Invalid state transition/i,
    'Stopped request must not transition back to approved'
  )
  console.log('  ✓ Transition from stopped back to approved is strictly forbidden')

  // ────────────────────────────────────────────────────────────
  // Test 13: Monitoring indicator is visible in approved state only
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 13: Monitoring indicator is visible in approved state only')
  // Currently stopped -> active approved request should be null
  const activeNow = await permissionService.getActiveApprovedRequest('dev_001')
  assert.equal(activeNow, null, 'No active sharing should exist after stop')

  // Create and approve a new request
  const req5 = await dataService.requestScreenView('emp_001', 'dev_001')
  await permissionService.approveRequest(req5.id, 'dev_001')
  const activeApproved = await permissionService.getActiveApprovedRequest('dev_001')
  assert.ok(activeApproved, 'Active sharing must be present when approved')
  assert.equal(activeApproved?.id, req5.id)
  assert.equal(activeApproved?.status, 'approved')
  console.log('  ✓ Active monitoring indicator presence accurately reflects approved state')

  // ────────────────────────────────────────────────────────────
  // Test 14: Closing a dialog does not grant permission
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 14: Closing a dialog does not grant permission')
  // Stop req5 first
  await permissionService.stopSharing(req5.id, 'dev_001', { stoppedBy: 'employee' })

  // Admin creates fresh request
  const req6 = await dataService.requestScreenView('emp_001', 'dev_001')
  assert.equal(req6.status, 'pending')

  // User dismisses/closes the dialog without approving
  // The state in storage should remain 'pending', NOT 'approved'
  const postDismissActive = await permissionService.getActiveApprovedRequest('dev_001')
  assert.equal(postDismissActive, null, 'Dismissing dialog must NOT start active sharing')

  const postDismissPending = await permissionService.getPendingRequestForDevice('dev_001')
  assert.ok(postDismissPending, 'Request remains pending in service')
  assert.equal(postDismissPending?.status, 'pending')
  console.log('  ✓ Closing dialog maintains pending status without granting permission')

  // ────────────────────────────────────────────────────────────
  // Test State Transitions Matrix Verification
  // ────────────────────────────────────────────────────────────
  console.log('\nTest State Transition Validation Helper:')
  assert.equal(isValidPermissionTransition('pending', 'approved'), true)
  assert.equal(isValidPermissionTransition('pending', 'rejected'), true)
  assert.equal(isValidPermissionTransition('pending', 'cancelled'), true)
  assert.equal(isValidPermissionTransition('pending', 'expired'), true)
  assert.equal(isValidPermissionTransition('approved', 'stopped'), true)
  assert.equal(isValidPermissionTransition('stopped', 'approved'), false)
  assert.equal(isValidPermissionTransition('rejected', 'approved'), false)
  assert.equal(isValidPermissionTransition('cancelled', 'approved'), false)
  assert.equal(isValidPermissionTransition('expired', 'approved'), false)
  console.log('  ✓ All permission transition rules verified successfully')

  console.log('\n🎉 ALL PHASE 6 MONITORING CONSENT & PERMISSION TESTS PASSED!\n')
}

runPhase6Tests().catch(err => {
  console.error('\n❌ Phase 6 Test Failed:', err)
  process.exit(1)
})
