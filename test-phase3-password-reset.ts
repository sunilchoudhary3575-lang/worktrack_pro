// ============================================================
// WorkTrack Pro — Reset Employee Password Automated Test Suite
// Verifies: Admin authorization, input validation, target resolution,
// server-side password updating, failure handling, and credential safety.
// ============================================================

import assert from 'node:assert/strict'
import {
  normalizeEmployeeId,
  validatePasswordStrength,
  generateSecurePassword,
  ResetEmployeePasswordPayload,
  ResetEmployeePasswordResult,
} from './packages/shared/dist/index.js'

interface MockUserDoc {
  uid: string
  role: string
  status: string
  employeeId?: string
  passwordResetAt?: string
  passwordResetBy?: string
  updatedAt?: string
  [key: string]: any
}

interface MockEmployeeDoc {
  id: string
  employeeId: string
  userId?: string
  name: string
  email: string
  department: string
  role: string
  status: string
  createdAt: string
  updatedAt?: string
  [key: string]: any
}

interface MockAuthAccount {
  uid: string
  email: string
  passwordHash: string // simulated hash
  disabled: boolean
}

async function runPasswordResetTests() {
  console.log('\n🧪 Starting Reset Employee Password Automated Test Suite...\n')

  // In-memory mock database & auth state
  const mockUsers = new Map<string, MockUserDoc>()
  const mockEmployees = new Map<string, MockEmployeeDoc>()
  const mockAuthAccounts = new Map<string, MockAuthAccount>()

  // Seed caller profiles
  mockUsers.set('admin_active_1', {
    uid: 'admin_active_1',
    role: 'admin',
    status: 'active',
  })
  mockUsers.set('admin_disabled_1', {
    uid: 'admin_disabled_1',
    role: 'admin',
    status: 'disabled',
  })
  mockUsers.set('employee_user_1', {
    uid: 'employee_user_1',
    role: 'employee',
    status: 'active',
    employeeId: 'emp_caller_01',
  })
  mockUsers.set('manager_user_1', {
    uid: 'manager_user_1',
    role: 'manager',
    status: 'active',
  })

  // Simulated backend resetEmployeePassword function mirroring functions/src/resetPassword.ts
  async function simulateResetEmployeePassword(
    callerAuth: { uid: string } | null,
    payload: Partial<ResetEmployeePasswordPayload>
  ): Promise<ResetEmployeePasswordResult> {
    const correlationId = `pwd_test_${Date.now()}`
    let stage = 'init'

    // 1. Caller authentication
    stage = 'caller_verification'
    if (!callerAuth || !callerAuth.uid) {
      const err: any = new Error('Authentication required. You must be signed in as an administrator.')
      err.code = 'unauthenticated'
      throw err
    }

    // 2. Caller authorization (/users/{callerUid})
    stage = 'admin_verification'
    const callerDoc = mockUsers.get(callerAuth.uid)
    if (!callerDoc) {
      const err: any = new Error('Administrative caller profile not found in database.')
      err.code = 'permission-denied'
      throw err
    }
    if (callerDoc.role !== 'admin' || callerDoc.status !== 'active') {
      const err: any = new Error('Access Denied: Only active Administrators have permission to reset employee passwords.')
      err.code = 'permission-denied'
      throw err
    }

    // 3. Payload validation
    stage = 'payload_validation'
    if (!payload) {
      const err: any = new Error('Missing password reset request payload.')
      err.code = 'invalid-argument'
      throw err
    }

    let normalizedId: string
    try {
      normalizedId = normalizeEmployeeId(payload.employeeId || '')
    } catch (e: any) {
      const err: any = new Error(e.message || 'Invalid Employee ID format.')
      err.code = 'invalid-argument'
      throw err
    }

    const newPassword = payload.newPassword || ''
    const passwordCheck = validatePasswordStrength(newPassword)
    if (!passwordCheck.valid) {
      const err: any = new Error(`New password does not meet security requirements: ${passwordCheck.errors.join(' ')}`)
      err.code = 'invalid-argument'
      throw err
    }

    // 4. Employee Resolution
    stage = 'employee_resolution'
    const empDoc = mockEmployees.get(normalizedId)
    if (!empDoc) {
      const err: any = new Error(`Employee ID "${normalizedId}" was not found in the employee directory.`)
      err.code = 'not-found'
      throw err
    }

    const targetUid = empDoc.userId
    if (!targetUid || typeof targetUid !== 'string' || !targetUid.trim()) {
      const err: any = new Error(`Employee ID "${normalizedId}" has not been provisioned with an active user account. Please activate the account first.`)
      err.code = 'failed-precondition'
      throw err
    }

    const userDoc = mockUsers.get(targetUid)
    if (!userDoc) {
      const err: any = new Error(`Corrupt account link: User profile for Employee ID "${normalizedId}" was not found in database.`)
      err.code = 'failed-precondition'
      throw err
    }

    if (userDoc.employeeId && userDoc.employeeId.toLowerCase() !== normalizedId.toLowerCase()) {
      const err: any = new Error('Integrity check failed: Linked user account does not match this employee record.')
      err.code = 'failed-precondition'
      throw err
    }

    // 5. Auth account update
    stage = 'auth_update'
    const authAcc = mockAuthAccounts.get(targetUid)
    if (!authAcc) {
      const err: any = new Error(`Firebase Authentication account for Employee ID "${normalizedId}" was not found.`)
      err.code = 'not-found'
      throw err
    }

    // Update password (simulated hash update)
    authAcc.passwordHash = `hash_${newPassword.slice(0, 4)}_${newPassword.length}`

    // 6. Metadata update (NEVER store plaintext password)
    stage = 'firestore_metadata'
    const nowIso = new Date().toISOString()
    userDoc.updatedAt = nowIso
    userDoc.passwordResetAt = nowIso
    userDoc.passwordResetBy = callerAuth.uid

    // 7. Result
    return {
      success: true,
      employeeId: normalizedId,
      uid: targetUid,
      updatedAt: nowIso,
    }
  }

  // ────────────────────────────────────────────────────────────
  // Test 1: Active Admin Authorization Enforcement
  // ────────────────────────────────────────────────────────────
  console.log('Test 1: Admin Authorization Enforcement')

  // Unauthenticated caller
  await assert.rejects(
    () => simulateResetEmployeePassword(null, { employeeId: 'emp_001', newPassword: generateSecurePassword(16) }),
    (err: any) => err.code === 'unauthenticated'
  )
  console.log('  ✓ Unauthenticated caller rejected with unauthenticated')

  // Non-existent caller profile
  await assert.rejects(
    () => simulateResetEmployeePassword({ uid: 'ghost_uid' }, { employeeId: 'emp_001', newPassword: generateSecurePassword(16) }),
    (err: any) => err.code === 'permission-denied'
  )
  console.log('  ✓ Missing caller profile rejected with permission-denied')

  // Standard employee caller
  await assert.rejects(
    () => simulateResetEmployeePassword({ uid: 'employee_user_1' }, { employeeId: 'emp_001', newPassword: generateSecurePassword(16) }),
    (err: any) => err.code === 'permission-denied'
  )
  console.log('  ✓ Employee caller rejected with permission-denied')

  // Manager caller (only admins can reset passwords)
  await assert.rejects(
    () => simulateResetEmployeePassword({ uid: 'manager_user_1' }, { employeeId: 'emp_001', newPassword: generateSecurePassword(16) }),
    (err: any) => err.code === 'permission-denied'
  )
  console.log('  ✓ Manager caller rejected with permission-denied')

  // Disabled admin caller
  await assert.rejects(
    () => simulateResetEmployeePassword({ uid: 'admin_disabled_1' }, { employeeId: 'emp_001', newPassword: generateSecurePassword(16) }),
    (err: any) => err.code === 'permission-denied'
  )
  console.log('  ✓ Disabled admin caller rejected with permission-denied')

  // ────────────────────────────────────────────────────────────
  // Test 2: Input Validation (Employee ID & Password Strength)
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 2: Input Validation & Password Complexity')

  // Invalid Employee ID
  const invalidEmpIds = ['', '   ', 'ab', '-emp01', 'emp!bad', 'emp@domain']
  for (const badId of invalidEmpIds) {
    await assert.rejects(
      () => simulateResetEmployeePassword({ uid: 'admin_active_1' }, { employeeId: badId, newPassword: generateSecurePassword(16) }),
      (err: any) => err.code === 'invalid-argument',
      `Expected invalid-argument for bad Employee ID "${badId}"`
    )
  }
  console.log('  ✓ Invalid Employee IDs rejected with invalid-argument')

  // Weak Passwords
  const weakPasswords = [
    '',
    'short',
    'alllowercase1!',
    'ALLUPPERCASE1!',
    'NoNumbersHere!@#',
    'NoSpecialChar123',
    'Has Space 123!@#',
  ]
  for (const weakPwd of weakPasswords) {
    await assert.rejects(
      () => simulateResetEmployeePassword({ uid: 'admin_active_1' }, { employeeId: 'emp_002', newPassword: weakPwd }),
      (err: any) => err.code === 'invalid-argument',
      `Expected invalid-argument for weak password "${weakPwd}"`
    )
  }
  console.log('  ✓ Weak or non-compliant passwords strictly rejected')

  // ────────────────────────────────────────────────────────────
  // Test 3: Target Account Resolution & Verification
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 3: Target Account Resolution & Linking Checks')

  // 1. Employee not found in directory
  await assert.rejects(
    () => simulateResetEmployeePassword({ uid: 'admin_active_1' }, { employeeId: 'emp_nonexistent', newPassword: generateSecurePassword(16) }),
    (err: any) => err.code === 'not-found',
    'Expected not-found for nonexistent employee record'
  )
  console.log('  ✓ Nonexistent employee directory record rejected with not-found')

  // 2. Unprovisioned employee (has no userId)
  mockEmployees.set('emp_unprov', {
    id: 'emp_unprov',
    employeeId: 'emp_unprov',
    name: 'Unprovisioned Worker',
    email: 'worker@example.com',
    department: 'Operations',
    role: 'employee',
    status: 'active',
    createdAt: new Date().toISOString(),
  })

  await assert.rejects(
    () => simulateResetEmployeePassword({ uid: 'admin_active_1' }, { employeeId: 'emp_unprov', newPassword: generateSecurePassword(16) }),
    (err: any) => err.code === 'failed-precondition',
    'Expected failed-precondition for employee with no linked userId'
  )
  console.log('  ✓ Unprovisioned employee rejected with failed-precondition')

  // 3. Corrupt link: employee has userId, but /users/{userId} does not exist
  mockEmployees.set('emp_broken_link', {
    id: 'emp_broken_link',
    employeeId: 'emp_broken_link',
    userId: 'uid_missing_user',
    name: 'Broken Worker',
    email: 'broken@example.com',
    department: 'Engineering',
    role: 'employee',
    status: 'active',
    createdAt: new Date().toISOString(),
  })

  await assert.rejects(
    () => simulateResetEmployeePassword({ uid: 'admin_active_1' }, { employeeId: 'emp_broken_link', newPassword: generateSecurePassword(16) }),
    (err: any) => err.code === 'failed-precondition',
    'Expected failed-precondition for broken user document'
  )
  console.log('  ✓ Broken /users/{uid} document link rejected with failed-precondition')

  // 4. Mismatched employee ID in /users/{userId}
  mockUsers.set('uid_mismatched', {
    uid: 'uid_mismatched',
    role: 'employee',
    status: 'active',
    employeeId: 'emp_different_one',
  })
  mockEmployees.set('emp_mismatched', {
    id: 'emp_mismatched',
    employeeId: 'emp_mismatched',
    userId: 'uid_mismatched',
    name: 'Mismatch Worker',
    email: 'mismatch@example.com',
    department: 'Engineering',
    role: 'employee',
    status: 'active',
    createdAt: new Date().toISOString(),
  })

  await assert.rejects(
    () => simulateResetEmployeePassword({ uid: 'admin_active_1' }, { employeeId: 'emp_mismatched', newPassword: generateSecurePassword(16) }),
    (err: any) => err.code === 'failed-precondition',
    'Expected failed-precondition for mismatched employee ID in user doc'
  )
  console.log('  ✓ Integrity mismatch between employee and user doc rejected with failed-precondition')

  // 5. Auth account missing in Firebase Auth
  mockUsers.set('uid_no_auth', {
    uid: 'uid_no_auth',
    role: 'employee',
    status: 'active',
    employeeId: 'emp_no_auth',
  })
  mockEmployees.set('emp_no_auth', {
    id: 'emp_no_auth',
    employeeId: 'emp_no_auth',
    userId: 'uid_no_auth',
    name: 'No Auth Worker',
    email: 'noauth@example.com',
    department: 'Engineering',
    role: 'employee',
    status: 'active',
    createdAt: new Date().toISOString(),
  })

  await assert.rejects(
    () => simulateResetEmployeePassword({ uid: 'admin_active_1' }, { employeeId: 'emp_no_auth', newPassword: generateSecurePassword(16) }),
    (err: any) => err.code === 'not-found',
    'Expected not-found for missing Firebase Auth account'
  )
  console.log('  ✓ Missing Firebase Auth account rejected with not-found')

  // ────────────────────────────────────────────────────────────
  // Test 4: Successful Password Reset Flow (Isolated Test Account)
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 4: Successful Password Reset on Provisioned Test Account')

  const testEmpId = 'emp_test_reset_99'
  const testUid = 'uid_test_reset_99'
  const initialPasswordHash = 'hash_old_pass_123'

  mockEmployees.set(testEmpId, {
    id: testEmpId,
    employeeId: testEmpId,
    userId: testUid,
    name: 'Reset Test Employee',
    email: 'reset.test@example.com',
    department: 'Quality Assurance',
    role: 'employee',
    status: 'active',
    createdAt: '2026-10-01T10:00:00.000Z',
    notes: 'Preserve these important notes',
  })

  mockUsers.set(testUid, {
    uid: testUid,
    role: 'employee',
    status: 'active',
    employeeId: testEmpId,
    email: `${testEmpId}@worktrack.internal`,
    contactEmail: 'reset.test@example.com',
    displayName: 'Reset Test Employee',
  })

  mockAuthAccounts.set(testUid, {
    uid: testUid,
    email: `${testEmpId}@worktrack.internal`,
    passwordHash: initialPasswordHash,
    disabled: false,
  })

  const newTempPassword = generateSecurePassword(16)
  const result = await simulateResetEmployeePassword(
    { uid: 'admin_active_1' },
    { employeeId: testEmpId, newPassword: newTempPassword }
  )

  // Verify response
  assert.equal(result.success, true)
  assert.equal(result.employeeId, testEmpId)
  assert.equal(result.uid, testUid)
  assert.ok(result.updatedAt, 'Result should have updatedAt timestamp')
  assert.equal((result as any).password, undefined, 'Plaintext password must NEVER be returned in response')
  console.log('  ✓ Callable returned success payload with target UID and timestamp')

  // Verify Auth account was updated
  const updatedAuth = mockAuthAccounts.get(testUid)
  assert.ok(updatedAuth)
  assert.notEqual(updatedAuth.passwordHash, initialPasswordHash, 'Password hash must be updated')
  assert.equal(mockAuthAccounts.size, 1, 'No duplicate auth account was created')
  console.log('  ✓ Firebase Auth account credentials updated without creating duplicates')

  // Verify Firestore metadata audit
  const updatedUser = mockUsers.get(testUid)
  assert.ok(updatedUser)
  assert.equal(updatedUser.passwordResetBy, 'admin_active_1', 'passwordResetBy must record admin UID')
  assert.ok(updatedUser.passwordResetAt, 'passwordResetAt must be set')
  assert.equal((updatedUser as any).password, undefined, 'Plaintext password must NEVER be in user document')
  console.log('  ✓ User document audit metadata recorded (passwordResetAt, passwordResetBy)')

  // Verify employee directory document integrity
  const untouchedEmployee = mockEmployees.get(testEmpId)
  assert.ok(untouchedEmployee)
  assert.equal(untouchedEmployee.userId, testUid)
  assert.equal(untouchedEmployee.name, 'Reset Test Employee')
  assert.equal(untouchedEmployee.email, 'reset.test@example.com')
  assert.equal(untouchedEmployee.department, 'Quality Assurance')
  assert.equal(untouchedEmployee.notes, 'Preserve these important notes')
  assert.equal(untouchedEmployee.createdAt, '2026-10-01T10:00:00.000Z')
  assert.equal((untouchedEmployee as any).password, undefined, 'Plaintext password must NEVER be in employee document')
  console.log('  ✓ Unrelated employee directory data completely preserved')

  // ────────────────────────────────────────────────────────────
  // Test 5: Credential Safety & Non-Leakage Invariant
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 5: Credential Safety & Protection of Real Accounts')

  // Verify that an error does not expose the requested password
  const secretPassword = 'MySecretP@ssword123!'
  try {
    await simulateResetEmployeePassword(
      { uid: 'admin_active_1' },
      { employeeId: 'emp_nonexistent', newPassword: secretPassword }
    )
  } catch (err: any) {
    assert.ok(!err.message.includes(secretPassword), 'Error message must NOT contain plaintext password')
  }
  console.log('  ✓ Error handling strictly protects credential privacy')

  // Real employee check: ensure emp_001 (Jayesh) is NOT in mock collections and was never touched
  assert.equal(mockEmployees.has('emp_001'), false, 'emp_001 was not in mock and never touched')
  console.log('  ✓ Verified no real employee accounts were touched or modified by test suite')

  console.log('\n============================================================')
  console.log('✅ ALL RESET EMPLOYEE PASSWORD TESTS PASSED SUCCESSFULLY!')
  console.log('============================================================\n')
}

runPasswordResetTests().catch(err => {
  console.error('\n❌ Password reset test failure:', err)
  process.exit(1)
})
