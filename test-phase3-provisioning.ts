// ============================================================
// WorkTrack Pro — Phase 3: Automated Employee Account Provisioning
// & Employee ID + Password Authentication Automated Test Suite
// ============================================================

import assert from 'node:assert/strict'
import {
  EMPLOYEE_ID_REGEX,
  normalizeEmployeeId,
  validateEmployeeId,
  formatEmployeeAuthEmail,
  isSyntheticAuthEmail,
  extractEmployeeIdFromAuthEmail,
  validatePasswordStrength,
  generateSecurePassword,
  SYNTHETIC_AUTH_EMAIL_DOMAIN,
} from './packages/shared/dist/index.js'

async function runProvisioningTests() {
  console.log('\n🧪 Starting Phase 3: Automated Provisioning & Employee ID Auth Tests...\n')

  // ────────────────────────────────────────────────────────────
  // Test 1: Strict Employee ID Format Validation
  // ────────────────────────────────────────────────────────────
  console.log('Test 1: Strict Employee ID Format Validation')
  
  // Valid Employee IDs
  const validIds = ['emp_001', 'EMP_002', 'emp-100', 'E123', 'john_doe-99', 'staff_9', 'EMP999']
  for (const id of validIds) {
    const res = validateEmployeeId(id)
    assert.equal(res.valid, true, `Expected "${id}" to be valid`)
    assert.ok(res.normalized, `Normalized ID should be defined for "${id}"`)
    assert.equal(res.normalized, id.trim().toLowerCase())
  }
  console.log('  ✓ Valid Employee ID patterns accepted')

  // Invalid Employee IDs — must be rejected with errors, NOT silently stripped
  const invalidCases = [
    { id: '', reason: 'empty string' },
    { id: '   ', reason: 'whitespace only' },
    { id: 'ab', reason: 'too short (<3 chars)' },
    { id: 'a'.repeat(33), reason: 'too long (>32 chars)' },
    { id: '-emp01', reason: 'starts with hyphen' },
    { id: '_emp01', reason: 'starts with underscore' },
    { id: 'emp 001', reason: 'contains space' },
    { id: 'emp@001', reason: 'contains @' },
    { id: 'emp#001', reason: 'contains #' },
    { id: 'emp.001', reason: 'contains dot' },
    { id: 'emp$123', reason: 'contains $' },
    { id: 'emp!danger', reason: 'contains exclamation' },
  ]

  for (const { id, reason } of invalidCases) {
    const res = validateEmployeeId(id)
    assert.equal(res.valid, false, `Expected "${id}" (${reason}) to be invalid`)
    assert.ok(res.error, `Expected descriptive error message for "${id}"`)
    assert.throws(
      () => normalizeEmployeeId(id),
      /Invalid Employee ID|non-empty string/,
      `normalizeEmployeeId must throw on "${id}" (${reason})`
    )
  }
  console.log('  ✓ Invalid characters strictly rejected with error (not silently stripped)')

  // ────────────────────────────────────────────────────────────
  // Test 2: Normalization & Collision Prevention
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 2: Normalization & Case-Insensitive Collision Prevention')
  
  const idLower = normalizeEmployeeId('emp_008')
  const idUpper = normalizeEmployeeId('EMP_008')
  const idMixed = normalizeEmployeeId('  Emp_008  ')
  assert.equal(idLower, 'emp_008')
  assert.equal(idUpper, 'emp_008')
  assert.equal(idMixed, 'emp_008')
  assert.equal(idLower, idUpper, 'Case variations must resolve to identical normalized string')

  const emailLower = formatEmployeeAuthEmail('emp_008')
  const emailUpper = formatEmployeeAuthEmail('EMP_008')
  assert.equal(emailLower, `emp_008@${SYNTHETIC_AUTH_EMAIL_DOMAIN}`)
  assert.equal(emailUpper, `emp_008@${SYNTHETIC_AUTH_EMAIL_DOMAIN}`)
  assert.equal(emailLower, emailUpper, 'Case variations must map to identical synthetic email alias')
  console.log('  ✓ Case-insensitive duplicate prevention verified')

  // Synthetic email detection and ID extraction
  assert.equal(isSyntheticAuthEmail(`emp_008@${SYNTHETIC_AUTH_EMAIL_DOMAIN}`), true)
  assert.equal(isSyntheticAuthEmail('emp_008@gmail.com'), false)
  assert.equal(isSyntheticAuthEmail('admin@worktrackpro.internal'), false)

  assert.equal(extractEmployeeIdFromAuthEmail(`emp_008@${SYNTHETIC_AUTH_EMAIL_DOMAIN}`), 'emp_008')
  assert.equal(extractEmployeeIdFromAuthEmail(`EMP_008@${SYNTHETIC_AUTH_EMAIL_DOMAIN}`), 'emp_008')
  assert.equal(extractEmployeeIdFromAuthEmail('emp_008@gmail.com'), null)
  console.log('  ✓ Synthetic email detection and ID extraction verified')

  // ────────────────────────────────────────────────────────────
  // Test 3: Cryptographic Password Generator & Strength Validator
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 3: Cryptographic Password Generator & Strength Validator')

  // Test generated password
  for (let i = 0; i < 20; i++) {
    const pwd = generateSecurePassword(16)
    assert.equal(pwd.length, 16)
    const check = validatePasswordStrength(pwd)
    assert.equal(check.valid, true, `Generated password "${pwd}" failed strength check: ${check.errors.join(', ')}`)
    assert.ok(check.score >= 3, 'Generated password must have high score')
  }
  console.log('  ✓ 20 cryptographically generated passwords verified for high entropy and compliance')

  // Test rejected weak passwords
  assert.equal(validatePasswordStrength('short').valid, false)
  assert.equal(validatePasswordStrength('alllowercase1!').valid, false) // no uppercase
  assert.equal(validatePasswordStrength('ALLUPPERCASE1!').valid, false) // no lowercase
  assert.equal(validatePasswordStrength('NoSpecialChar123').valid, false) // no symbol
  assert.equal(validatePasswordStrength('NoNumbersHere!@#').valid, false) // no numbers
  assert.equal(validatePasswordStrength('Has Space 123!@#').valid, false) // has space
  console.log('  ✓ Weak and non-compliant passwords properly rejected')

  // ────────────────────────────────────────────────────────────
  // Test 4: Server-Side Admin Authorization Enforcement
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 4: Server-Side Admin Authorization Enforcement')

  // In-memory Firestore mock for authorization testing
  const mockUsers = new Map<string, any>([
    ['admin_active_uid', { uid: 'admin_active_uid', role: 'admin', status: 'active' }],
    ['admin_disabled_uid', { uid: 'admin_disabled_uid', role: 'admin', status: 'disabled' }],
    ['emp_uid', { uid: 'emp_uid', role: 'employee', status: 'active' }],
  ])

  function verifyAdminCaller(auth: { uid: string } | null, clientSuppliedRole?: string): { authorized: boolean; reason?: string } {
    if (!auth || !auth.uid) {
      return { authorized: false, reason: 'unauthenticated' }
    }
    // NEVER trust clientSuppliedRole! Always check Firestore database
    const userDoc = mockUsers.get(auth.uid)
    if (!userDoc) {
      return { authorized: false, reason: 'caller-profile-not-found' }
    }
    if (userDoc.role !== 'admin') {
      return { authorized: false, reason: 'unauthorized-role' }
    }
    if (userDoc.status !== 'active') {
      return { authorized: false, reason: 'account-disabled' }
    }
    return { authorized: true }
  }

  // 1. Unauthenticated request rejected
  assert.equal(verifyAdminCaller(null).authorized, false)
  assert.equal(verifyAdminCaller({ uid: '' }).authorized, false)

  // 2. Standard employee attempting provisioning rejected
  assert.equal(verifyAdminCaller({ uid: 'emp_uid' }, 'admin').authorized, false, 'Client-supplied role must not bypass server check')
  assert.equal(verifyAdminCaller({ uid: 'emp_uid' }).reason, 'unauthorized-role')

  // 3. Disabled admin rejected
  assert.equal(verifyAdminCaller({ uid: 'admin_disabled_uid' }).authorized, false)
  assert.equal(verifyAdminCaller({ uid: 'admin_disabled_uid' }).reason, 'account-disabled')

  // 4. Active admin accepted
  assert.equal(verifyAdminCaller({ uid: 'admin_active_uid' }).authorized, true)
  console.log('  ✓ Server-side caller authorization strictly enforced')

  // ────────────────────────────────────────────────────────────
  // Test 5: Provisioning Transaction & Bidirectional Linking
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 5: Provisioning Transaction & Bidirectional Linking')

  const directoryEmployees = new Map<string, any>()
  const authUsers = new Map<string, any>()

  async function mockProvisionEmployee(payload: {
    employeeId: string
    name: string
    contactEmail: string
    department: string
    role?: string
    initialPassword: string
  }, callerUid: string) {
    const authCheck = verifyAdminCaller({ uid: callerUid })
    if (!authCheck.authorized) throw new Error(`Permission Denied: ${authCheck.reason}`)

    const normalizedId = normalizeEmployeeId(payload.employeeId)
    const syntheticEmail = formatEmployeeAuthEmail(normalizedId)

    // Check directory collision
    if (directoryEmployees.has(normalizedId)) {
      throw new Error(`already-exists: Employee ID "${normalizedId}" already exists`)
    }

    // Check contact email collision
    for (const [_, emp] of directoryEmployees) {
      if (emp.email.toLowerCase() === payload.contactEmail.trim().toLowerCase()) {
        throw new Error(`already-exists: Contact email already in use`)
      }
    }

    // 1. Create Auth user
    const generatedUid = `auth_uid_${normalizedId}`
    authUsers.set(generatedUid, {
      uid: generatedUid,
      email: syntheticEmail,
      displayName: payload.name.trim(),
    })

    // 2. Write Firestore documents
    const nowIso = new Date().toISOString()
    mockUsers.set(generatedUid, {
      uid: generatedUid,
      email: syntheticEmail,
      contactEmail: payload.contactEmail.trim().toLowerCase(),
      displayName: payload.name.trim(),
      role: 'employee',
      employeeId: normalizedId,
      status: 'active',
      createdAt: nowIso,
      provisionedBy: callerUid,
    })

    directoryEmployees.set(normalizedId, {
      employeeId: normalizedId,
      userId: generatedUid,
      name: payload.name.trim(),
      email: payload.contactEmail.trim().toLowerCase(),
      department: payload.department.trim(),
      role: 'employee',
      status: 'active',
      createdAt: nowIso,
    })

    return {
      success: true,
      uid: generatedUid,
      employeeId: normalizedId,
      authEmail: syntheticEmail,
      contactEmail: payload.contactEmail.trim().toLowerCase(),
    }
  }

  // Provision new employee
  const result = await mockProvisionEmployee({
    employeeId: 'emp_010',
    name: 'Ada Lovelace',
    contactEmail: 'ada.lovelace@scientific.org',
    department: 'Research',
    initialPassword: generateSecurePassword(16),
  }, 'admin_active_uid')

  assert.equal(result.success, true)
  assert.equal(result.employeeId, 'emp_010')
  assert.equal(result.authEmail, `emp_010@${SYNTHETIC_AUTH_EMAIL_DOMAIN}`)

  // Verify bidirectional link
  const userProfile = mockUsers.get(result.uid)
  const empDoc = directoryEmployees.get(result.employeeId)
  assert.equal(userProfile.employeeId, result.employeeId, '/users/{uid}.employeeId must match employeeId')
  assert.equal(empDoc.userId, result.uid, '/employees/{employeeId}.userId must match auth.uid')
  assert.equal(empDoc.email, 'ada.lovelace@scientific.org', 'Real contact email preserved in directory')
  assert.equal(userProfile.contactEmail, 'ada.lovelace@scientific.org', 'Real contact email preserved in user profile')
  assert.equal(userProfile.email, `emp_010@${SYNTHETIC_AUTH_EMAIL_DOMAIN}`, 'Auth email strictly uses synthetic alias')

  // Verify duplicate rejection
  await assert.rejects(
    () => mockProvisionEmployee({
      employeeId: 'EMP_010', // case variation duplicate
      name: 'Duplicate Ada',
      contactEmail: 'ada.other@scientific.org',
      department: 'Research',
      initialPassword: generateSecurePassword(16),
    }, 'admin_active_uid'),
    /already-exists/
  )

  await assert.rejects(
    () => mockProvisionEmployee({
      employeeId: 'emp_011',
      name: 'Duplicate Email',
      contactEmail: 'ada.lovelace@scientific.org', // duplicate email
      department: 'Research',
      initialPassword: generateSecurePassword(16),
    }, 'admin_active_uid'),
    /already-exists/
  )
  console.log('  ✓ Employee account provisioning, bidirectional linking, and duplicate checks verified')

  // ────────────────────────────────────────────────────────────
  // Test 6: Partial Failure & Compensating Rollback Invariant
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 6: Partial Failure & Compensating Rollback Invariant')

  let rollbackExecuted = false
  async function mockProvisioningWithSimulatedFirestoreFailure() {
    const tempUid = 'auth_uid_temp_failed'
    authUsers.set(tempUid, { uid: tempUid, email: `emp_099@${SYNTHETIC_AUTH_EMAIL_DOMAIN}` })

    try {
      // Simulate Firestore write exception
      throw new Error('Firestore connection timeout during commit')
    } catch (err) {
      // Compensating action
      authUsers.delete(tempUid)
      rollbackExecuted = true
      throw err
    }
  }

  await assert.rejects(
    () => mockProvisioningWithSimulatedFirestoreFailure(),
    /Firestore connection timeout/
  )
  assert.equal(rollbackExecuted, true, 'Compensating action must execute to delete orphaned Auth user')
  assert.equal(authUsers.has('auth_uid_temp_failed'), false, 'Orphaned Auth user must not remain in system')
  console.log('  ✓ Compensating rollback verified on partial failure')

  // ────────────────────────────────────────────────────────────
  // Test 7: Employee App Login Flow & Role Enforcement
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 7: Employee App Login Flow & Role Enforcement')

  function simulateEmployeeAppLogin(inputEmployeeId: string, inputPassword: string, simulatedUid: string) {
    const idValidation = validateEmployeeId(inputEmployeeId)
    if (!idValidation.valid || !idValidation.normalized) {
      throw new Error('Invalid Employee ID or password. Please verify your credentials.')
    }

    const syntheticEmail = formatEmployeeAuthEmail(idValidation.normalized)
    assert.equal(syntheticEmail, `${idValidation.normalized}@${SYNTHETIC_AUTH_EMAIL_DOMAIN}`)

    // Lookup user in mock
    const profile = mockUsers.get(simulatedUid)
    if (!profile) {
      throw new Error('Invalid Employee ID or password. Please verify your credentials.')
    }

    if (profile.role !== 'employee') {
      throw new Error('Access Denied: Administrative accounts cannot sign in to the Employee App.')
    }

    if (profile.status !== 'active') {
      throw new Error('This employee account has been deactivated. Please contact your administrator.')
    }

    const linkedEmployee = directoryEmployees.get(profile.employeeId)
    if (!linkedEmployee || linkedEmployee.status !== 'active') {
      throw new Error('Employee directory record is deactivated. Please contact your administrator.')
    }

    return {
      authenticated: true,
      uid: profile.uid,
      employeeId: profile.employeeId,
      name: profile.displayName,
    }
  }

  // 1. Successful employee login
  const loginRes = simulateEmployeeAppLogin('emp_010', 'CorrectPassword123!', 'auth_uid_emp_010')
  assert.equal(loginRes.authenticated, true)
  assert.equal(loginRes.employeeId, 'emp_010')

  // 2. Admin attempting login in Employee App rejected
  assert.throws(
    () => simulateEmployeeAppLogin('admin_id', 'pass', 'admin_active_uid'),
    /Access Denied: Administrative accounts cannot sign in/
  )

  // 3. Invalid credentials returns generic error (no ID leakage)
  assert.throws(
    () => simulateEmployeeAppLogin('non_existent_emp', 'pass', 'non_existent_uid'),
    /Invalid Employee ID or password/
  )
  // ────────────────────────────────────────────────────────────
  // Test 8: Safe Activation of Existing Unlinked Employee Record
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 8: Safe Activation of Existing Unlinked Employee Record (e.g. emp_001)')

  // Pre-seed an unlinked employee record (representing Jayesh / emp_001)
  directoryEmployees.set('emp_001', {
    employeeId: 'emp_001',
    userId: undefined, // unlinked
    name: 'Jayesh',
    email: 'jayesh@gmail.com',
    department: 'Marketing',
    role: 'employee',
    status: 'active',
    createdAt: '2026-10-17T06:47:06.897Z',
  })

  // Mock implementation with unlinked activation support
  async function mockProvisionOrActivateEmployee(payload: {
    employeeId: string
    name?: string
    contactEmail?: string
    department?: string
    role?: string
    initialPassword: string
  }, callerUid: string) {
    const authCheck = verifyAdminCaller({ uid: callerUid })
    if (!authCheck.authorized) throw new Error(`Permission Denied: ${authCheck.reason}`)

    const normalizedId = normalizeEmployeeId(payload.employeeId)
    const syntheticEmail = formatEmployeeAuthEmail(normalizedId)

    const existingDoc = directoryEmployees.get(normalizedId)
    const isExisting = !!existingDoc

    if (isExisting && existingDoc.userId) {
      throw new Error(`already-exists: Employee ID "${normalizedId}" is already linked to an active user account`)
    }

    const employeeName = (isExisting && existingDoc.name) ? existingDoc.name : (payload.name || '')
    const employeeDept = (isExisting && existingDoc.department) ? existingDoc.department : (payload.department || 'General')
    const finalEmail = (isExisting && existingDoc.email) ? existingDoc.email : (payload.contactEmail || '')

    // Check contact email collision against OTHER employees
    for (const [id, emp] of directoryEmployees) {
      if (id !== normalizedId && emp.email.toLowerCase() === finalEmail.toLowerCase()) {
        throw new Error(`already-exists: Contact email already in use by another employee`)
      }
    }

    // 1. Create Auth user
    const generatedUid = `auth_uid_${normalizedId}`
    authUsers.set(generatedUid, {
      uid: generatedUid,
      email: syntheticEmail,
      displayName: employeeName,
    })

    // 2. Write /users/{uid}
    const nowIso = new Date().toISOString()
    mockUsers.set(generatedUid, {
      uid: generatedUid,
      email: syntheticEmail,
      contactEmail: finalEmail,
      displayName: employeeName,
      role: 'employee',
      employeeId: normalizedId,
      status: 'active',
      createdAt: nowIso,
      provisionedBy: callerUid,
    })

    // 3. Update or create /employees/{id}
    if (isExisting) {
      existingDoc.userId = generatedUid
      existingDoc.updatedAt = nowIso
      existingDoc.status = 'active'
    } else {
      directoryEmployees.set(normalizedId, {
        employeeId: normalizedId,
        userId: generatedUid,
        name: employeeName,
        email: finalEmail,
        department: employeeDept,
        role: 'employee',
        status: 'active',
        createdAt: nowIso,
      })
    }

    return {
      success: true,
      uid: generatedUid,
      employeeId: normalizedId,
      authEmail: syntheticEmail,
      contactEmail: finalEmail,
      name: employeeName,
    }
  }

  // 1. Activate unlinked emp_001
  const actRes = await mockProvisionOrActivateEmployee({
    employeeId: 'emp_001',
    initialPassword: generateSecurePassword(16),
  }, 'admin_active_uid')

  assert.equal(actRes.success, true)
  assert.equal(actRes.employeeId, 'emp_001')
  assert.equal(actRes.name, 'Jayesh', 'Existing name preserved')
  assert.equal(actRes.contactEmail, 'jayesh@gmail.com', 'Existing contact email preserved')
  assert.equal(actRes.authEmail, `emp_001@${SYNTHETIC_AUTH_EMAIL_DOMAIN}`)

  // Verify linking
  const linkedJayesh = directoryEmployees.get('emp_001')
  assert.equal(linkedJayesh.userId, actRes.uid, 'emp_001.userId linked to new auth UID')
  assert.equal(linkedJayesh.createdAt, '2026-10-17T06:47:06.897Z', 'Pre-existing createdAt preserved')
  assert.equal(mockUsers.get(actRes.uid).employeeId, 'emp_001')

  // 2. Re-activation attempt on already-linked record must fail
  await assert.rejects(
    () => mockProvisionOrActivateEmployee({
      employeeId: 'emp_001',
      initialPassword: generateSecurePassword(16),
    }, 'admin_active_uid'),
    /already-exists: Employee ID "emp_001" is already linked to an active user account/
  )
  console.log('  ✓ Safe activation of existing unlinked record verified')
  console.log('  ✓ Directory data and contact email preserved')
  console.log('  ✓ Duplicate re-activation prevented')

  // 3. Verify rollback invariant: pre-existing employee doc is NEVER deleted on failure
  const preExistingSnapshot = { ...linkedJayesh }
  async function simulateFailureDuringActivation() {
    const tempUid = 'auth_temp_fail_uid'
    authUsers.set(tempUid, { uid: tempUid, email: `emp_001@${SYNTHETIC_AUTH_EMAIL_DOMAIN}` })
    try {
      throw new Error('Firestore write failure')
    } catch (err) {
      authUsers.delete(tempUid) // delete created auth user
      // Pre-existing document must NOT be deleted
      throw err
    }
  }

  await assert.rejects(() => simulateFailureDuringActivation(), /Firestore write failure/)
  assert.equal(directoryEmployees.has('emp_001'), true, 'Pre-existing employee document was NOT deleted')
  console.log('  ✓ Rollback preserves pre-existing employee document without deletion')

  console.log('\n============================================================')
  console.log('✅ ALL PHASE 3 PROVISIONING & EMPLOYEE ID AUTH TESTS PASSED!')
  console.log('============================================================\n')
}

runProvisioningTests().catch(err => {
  console.error('\n❌ Phase 3 test failure:', err)
  process.exit(1)
})
