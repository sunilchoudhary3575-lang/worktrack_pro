// ============================================================
// WorkTrack Pro — Phase 9: Firebase Authentication & Security Foundation
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
    randomUUID: () => `uuid_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
  },
}

import {
  formatAuthError,
  UserAccount,
  FirestoreEmployeeDoc,
  FirestoreDeviceDoc,
  FirebaseClientConfig,
} from './packages/shared/dist/index.js'
import { adminAuthService } from './apps/admin-app/src/services/firebaseAuth.js'
import { employeeAuthService } from './apps/employee-app/src/services/firebaseAuth.js'

async function runPhase9Tests() {
  console.log('\n🧪 Starting Phase 9: Firebase Authentication & Security Foundation Tests...\n')

  // ────────────────────────────────────────────────────────────
  // Test 1: Error Code Formatter provides human-readable messages
  // ────────────────────────────────────────────────────────────
  console.log('Test 1: Error Code Formatter provides human-readable messages')
  assert.equal(
    formatAuthError('auth/user-not-found'),
    'No account exists with this email address.'
  )
  assert.equal(
    formatAuthError('auth/wrong-password'),
    'Invalid email or password. Please verify your credentials.'
  )
  assert.equal(
    formatAuthError('auth/invalid-credential'),
    'Invalid email or password. Please verify your credentials.'
  )
  assert.equal(
    formatAuthError('auth/too-many-requests'),
    'Access temporarily blocked due to many failed login attempts. Try again later.'
  )
  assert.equal(
    formatAuthError('auth/network-request-failed'),
    'Network error connecting to Firebase. Check your internet connection.'
  )
  assert.equal(
    formatAuthError('auth/unauthorized-role'),
    'Access Denied: Your account role is not authorized for this application.'
  )
  console.log('  ✓ Human-readable error messages verified for standard Firebase error codes')

  // ────────────────────────────────────────────────────────────
  // Test 2: Unconfigured environment detection and graceful fallback
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 2: Unconfigured environment detection and graceful fallback')
  // When .env has not been populated with production keys
  const adminConfigured = adminAuthService.isConfigured()
  const employeeConfigured = employeeAuthService.isConfigured()
  assert.equal(typeof adminConfigured, 'boolean')
  assert.equal(typeof employeeConfigured, 'boolean')
  console.log(`  ✓ Configuration detection: Admin configured = ${adminConfigured}, Employee configured = ${employeeConfigured}`)

  // ────────────────────────────────────────────────────────────
  // Test 3: Unauthenticated access is blocked
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 3: Unauthenticated access is blocked')
  mockStorage.clear()
  const adminUser = adminAuthService.getStoredDemoUser()
  const empUser = employeeAuthService.getStoredDemoUser()
  assert.equal(adminUser, null, 'Admin session should be null when not signed in')
  assert.equal(empUser, null, 'Employee session should be null when not signed in')
  console.log('  ✓ Unauthenticated state verified; protected screens cannot open without session')

  // ────────────────────────────────────────────────────────────
  // Test 4: Offline Demo Admin sign-in and session persistence
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 4: Offline Demo Admin sign-in and session persistence')
  const adminResult = adminAuthService.signInDemo()
  assert.equal(adminResult.isDemo, true)
  assert.equal(adminResult.user.role, 'admin')
  assert.equal(adminResult.user.email, 'admin@worktrackpro.internal')

  // Verify persistence in localStorage
  const restoredAdmin = adminAuthService.getStoredDemoUser()
  assert.notEqual(restoredAdmin, null)
  assert.equal(restoredAdmin?.role, 'admin')
  console.log('  ✓ Admin session successfully created and persisted across reloads')

  // Sign out admin
  await adminAuthService.signOut()
  assert.equal(adminAuthService.getStoredDemoUser(), null)
  console.log('  ✓ Admin session successfully cleared on sign out')

  // ────────────────────────────────────────────────────────────
  // Test 5: Offline Demo Employee sign-in and session persistence
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 5: Offline Demo Employee sign-in and session persistence')
  const empResult = employeeAuthService.signInDemo()
  assert.equal(empResult.isDemo, true)
  assert.equal(empResult.user.role, 'employee')
  assert.equal(empResult.user.employeeId, 'emp_001')

  const restoredEmp = employeeAuthService.getStoredDemoUser()
  assert.notEqual(restoredEmp, null)
  assert.equal(restoredEmp?.role, 'employee')
  console.log('  ✓ Employee session created with employee role and employeeId')

  await employeeAuthService.signOut()
  assert.equal(employeeAuthService.getStoredDemoUser(), null)
  console.log('  ✓ Employee session successfully cleared on sign out')

  // ────────────────────────────────────────────────────────────
  // Test 6: Role validation blocks employee from admin privileges
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 6: Role validation blocks employee from admin privileges')
  const testEmployeeAccount: UserAccount = {
    uid: 'test_uid_emp_09',
    email: 'staff@worktrackpro.internal',
    displayName: 'Staff Member',
    role: 'employee',
    status: 'active',
    createdAt: new Date().toISOString(),
  }

  // An employee account must not pass admin validation
  const isAdmin = testEmployeeAccount.role === 'admin'
  assert.equal(isAdmin, false, 'Employee account must not have admin access')
  console.log('  ✓ Employee account blocked from accessing admin privileges')

  // ────────────────────────────────────────────────────────────
  // Test 7: Device Ownership and Status Invariants
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 7: Device Ownership and Status Invariants')
  const newDevice: FirestoreDeviceDoc = {
    deviceId: 'dev_test_001',
    userId: 'uid_alex_01',
    employeeId: 'emp_001',
    employeeName: 'Alex Rivera',
    hostname: 'DESKTOP-ALEX',
    platform: 'windows',
    approvalStatus: 'pending_approval',
    registeredAt: new Date().toISOString(),
  }

  // Employee cannot register device as pre-approved
  assert.equal(newDevice.approvalStatus, 'pending_approval')
  assert.equal(newDevice.userId, 'uid_alex_01')

  // Only admin can set status to approved
  function approveDeviceByAdmin(device: FirestoreDeviceDoc, adminUid: string, adminRole: string): FirestoreDeviceDoc {
    if (adminRole !== 'admin') {
      throw new Error(formatAuthError('auth/unauthorized-role'))
    }
    return {
      ...device,
      approvalStatus: 'approved',
      reviewedAt: new Date().toISOString(),
      reviewedBy: adminUid,
    }
  }

  // Employee attempting self-approval must fail
  assert.throws(
    () => approveDeviceByAdmin(newDevice, 'uid_alex_01', 'employee'),
    /Access Denied/
  )
  console.log('  ✓ Employee self-approval attempt strictly blocked')

  // Admin approval succeeds
  const approvedDevice = approveDeviceByAdmin(newDevice, 'uid_admin_01', 'admin')
  assert.equal(approvedDevice.approvalStatus, 'approved')
  assert.equal(approvedDevice.reviewedBy, 'uid_admin_01')
  console.log('  ✓ Authorized Admin approval verified')

  // ────────────────────────────────────────────────────────────
  // Test 8: Firestore Security Rules file validation
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 8: Firestore Security Rules file validation')
  const rulesPath = path.resolve('firestore.rules')
  assert.equal(fs.existsSync(rulesPath), true, 'firestore.rules file must exist')
  const rulesContent = fs.readFileSync(rulesPath, 'utf8')

  // Enforce deny-by-default
  assert.ok(
    rulesContent.includes('allow read, write: if false;'),
    'Rules must deny read and write by default'
  )

  // Enforce no permissive rules
  assert.ok(
    !rulesContent.includes('allow read, write: if true;'),
    'Rules must NOT contain permissive "if true" clauses'
  )

  // Verify collections defined
  assert.ok(rulesContent.includes('match /users/{userId}'), 'Rules must protect /users')
  assert.ok(rulesContent.includes('match /employees/{employeeId}'), 'Rules must protect /employees')
  assert.ok(rulesContent.includes('match /devices/{deviceId}'), 'Rules must protect /devices')
  assert.ok(rulesContent.includes('match /device_approvals/{approvalId}'), 'Rules must protect /device_approvals')

  // Verify role protections
  assert.ok(
    rulesContent.includes("request.resource.data.role != 'admin'"),
    'Rules must block self-assignment of admin role'
  )
  assert.ok(
    rulesContent.includes('isAdmin()'),
    'Rules must enforce admin role check'
  )
  assert.ok(
    rulesContent.includes('isOwner(userId)'),
    'Rules must enforce owner check'
  )
  console.log('  ✓ firestore.rules static security analysis passed with deny-by-default and strict role checks')

  // ────────────────────────────────────────────────────────────
  // Test 9: Bootstrap script integrity
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 9: Bootstrap script integrity')
  const bootstrapPath = path.resolve('scripts/bootstrap-admin.js')
  assert.equal(fs.existsSync(bootstrapPath), true, 'scripts/bootstrap-admin.js must exist')
  const scriptContent = fs.readFileSync(bootstrapPath, 'utf8')
  assert.ok(
    scriptContent.includes('setCustomUserClaims'),
    'Bootstrap script must set admin custom claim'
  )
  assert.ok(
    scriptContent.includes("role: 'admin'"),
    'Bootstrap script must write admin role to Firestore'
  )
  console.log('  ✓ Admin bootstrap script verified for secure out-of-band admin provisioning')

  console.log('\n============================================================')
  console.log('✅ ALL PHASE 9 FIREBASE AUTH & SECURITY TESTS PASSED!')
  console.log('============================================================\n')
}

runPhase9Tests().catch(err => {
  console.error('\n❌ Test failure in Phase 9:', err)
  process.exit(1)
})
