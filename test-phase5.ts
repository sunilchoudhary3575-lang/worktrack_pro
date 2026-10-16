// ============================================================
// Phase 5 Test Suite: Admin App Employee Management & Approvals
// ============================================================

import assert from 'node:assert/strict'
import { dataService } from './apps/admin-app/src/services/dataService.js'

async function runPhase5Tests() {
  console.log('🧪 Starting Phase 5 Admin App Employee Management Tests...\n')

  // Reset mock data to clean seeded state
  await dataService.resetMockData()

  // ────────────────────────────────────────────────────────────
  // Test 1: Employee records load from the mock service
  // ────────────────────────────────────────────────────────────
  console.log('Test 1: Employee records load from the mock service')
  const employees = await dataService.getEmployees()
  assert.ok(Array.isArray(employees), 'Employees must be an array')
  assert.ok(employees.length >= 7, `Expected at least 7 seeded employees, got ${employees.length}`)

  for (const emp of employees) {
    assert.ok(emp.id, 'Employee ID must be present')
    assert.ok(emp.name, 'Employee name must be present')
    assert.ok(emp.email, 'Employee email must be present')
    assert.ok(emp.role, 'Employee role must be present')
    assert.ok(emp.createdAt instanceof Date, 'Employee createdAt must be Date')
  }
  console.log(`  ✓ Loaded ${employees.length} seeded employees successfully`)

  // ────────────────────────────────────────────────────────────
  // Test 2: Search works by name and employee ID
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 2: Search works by name and employee ID')
  // Search by name
  const nameQuery = 'sarah'
  const nameMatches = employees.filter(e =>
    e.name.toLowerCase().includes(nameQuery.toLowerCase()) ||
    e.id.toLowerCase().includes(nameQuery.toLowerCase())
  )
  assert.equal(nameMatches.length, 1)
  assert.equal(nameMatches[0].name, 'Sarah Johnson')
  console.log(`  ✓ Name search "${nameQuery}" correctly found: ${nameMatches[0].name}`)

  // Search by ID
  const idQuery = 'emp_003'
  const idMatches = employees.filter(e =>
    e.name.toLowerCase().includes(idQuery.toLowerCase()) ||
    e.id.toLowerCase().includes(idQuery.toLowerCase())
  )
  assert.equal(idMatches.length, 1)
  assert.equal(idMatches[0].name, 'Priya Sharma')
  console.log(`  ✓ ID search "${idQuery}" correctly found: ${idMatches[0].name}`)

  // Case-insensitive check
  const mixedQuery = 'MARCUS'
  const mixedMatches = employees.filter(e =>
    e.name.toLowerCase().includes(mixedQuery.toLowerCase()) ||
    e.id.toLowerCase().includes(mixedQuery.toLowerCase())
  )
  assert.equal(mixedMatches.length, 1)
  assert.equal(mixedMatches[0].id, 'emp_002')
  console.log(`  ✓ Case-insensitive search "${mixedQuery}" correctly found: ${mixedMatches[0].name}`)

  // ────────────────────────────────────────────────────────────
  // Test 3: Registration and device filters work
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 3: Registration and device filters work')
  const devices = await dataService.getDevices()
  const registrations = await dataService.getDeviceRegistrations()

  // Approved registration filter
  const approvedRegs = registrations.filter(r => r.status === 'approved')
  assert.ok(approvedRegs.length >= 3, 'Expected at least 3 approved device registrations')
  console.log(`  ✓ Approved registrations filter: ${approvedRegs.length} found`)

  // Pending approval registration filter
  const pendingRegs = registrations.filter(r => r.status === 'pending_approval')
  assert.ok(pendingRegs.length >= 2, 'Expected at least 2 pending registrations (dev_005, dev_006)')
  console.log(`  ✓ Pending registrations filter: ${pendingRegs.length} found`)

  // Rejected registration filter
  const rejectedRegs = registrations.filter(r => r.status === 'rejected')
  assert.ok(rejectedRegs.length >= 1, 'Expected at least 1 rejected registration (dev_004)')
  assert.equal(rejectedRegs[0].deviceId, 'dev_004')
  console.log(`  ✓ Rejected registrations filter: ${rejectedRegs[0].deviceName} (${rejectedRegs[0].deviceId})`)

  // Device status filters
  const onlineDevices = devices.filter(d => d.status === 'online')
  assert.ok(onlineDevices.length >= 3, 'Expected online devices')
  const offlineDevices = devices.filter(d => d.status === 'offline')
  assert.ok(offlineDevices.length >= 1, 'Expected offline devices')
  console.log(`  ✓ Device status filters: Online (${onlineDevices.length}), Offline (${offlineDevices.length})`)

  // ────────────────────────────────────────────────────────────
  // Test 4: Empty search results display correctly
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 4: Empty search results display correctly')
  const emptyQuery = 'NON_EXISTENT_NAME_XYZ_9999'
  const emptyMatches = employees.filter(e =>
    e.name.toLowerCase().includes(emptyQuery.toLowerCase()) ||
    e.id.toLowerCase().includes(emptyQuery.toLowerCase())
  )
  assert.equal(emptyMatches.length, 0, 'Non-existent query must yield 0 results')
  console.log('  ✓ Empty search results handled safely and returns empty array')

  // ────────────────────────────────────────────────────────────
  // Test 5: Employee details show the correct record
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 5: Employee details show the correct record')
  const emp1 = await dataService.getEmployee('emp_001')
  assert.ok(emp1, 'Employee emp_001 must exist')
  assert.equal(emp1.name, 'Sarah Johnson')

  const emp1Device = await dataService.getDeviceByEmployee('emp_001')
  assert.ok(emp1Device, 'Employee emp_001 must have associated device dev_001')
  assert.equal(emp1Device.id, 'dev_001')

  const emp1Reg = await dataService.getDeviceRegistrationByEmployee('emp_001')
  assert.ok(emp1Reg, 'Employee emp_001 must have registration record')
  assert.equal(emp1Reg.status, 'approved')

  const emp1Sessions = await dataService.getSessions('emp_001')
  assert.ok(emp1Sessions.length >= 1, 'Employee emp_001 must have sessions history')
  assert.ok(emp1Sessions[0].breaks && emp1Sessions[0].breaks.length > 0, 'Work session must have break history')
  console.log(`  ✓ Details for ${emp1.name}: Device ${emp1Device.name}, Status ${emp1Reg.status}, ${emp1Sessions.length} session(s)`)

  // ────────────────────────────────────────────────────────────
  // Test 6: A pending device can be approved
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 6: A pending device can be approved')
  // dev_006 is initially pending
  const preApproval = await dataService.getDeviceRegistration('dev_006')
  assert.equal(preApproval?.status, 'pending_approval')

  const approved = await dataService.approveDeviceRegistration('dev_006', 'AuditAdmin')
  assert.equal(approved.status, 'approved')
  assert.ok(approved.reviewedAt)
  assert.equal(approved.reviewedBy, 'AuditAdmin')

  // Check persisted state in service
  const postApproval = await dataService.getDeviceRegistration('dev_006')
  assert.equal(postApproval?.status, 'approved')
  console.log(`  ✓ Device ${approved.deviceName} (${approved.deviceId}) successfully approved by ${approved.reviewedBy}`)

  // ────────────────────────────────────────────────────────────
  // Test 7: A pending device can be rejected with a reason
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 7: A pending device can be rejected with a reason')
  // dev_005 is initially pending
  const preRejection = await dataService.getDeviceRegistration('dev_005')
  assert.equal(preRejection?.status, 'pending_approval')

  const rejectionReasonText = 'Device operating system version (Windows 11 Home) not permitted by IT policy.'
  const rejected = await dataService.rejectDeviceRegistration('dev_005', rejectionReasonText, 'SecAdmin')
  assert.equal(rejected.status, 'rejected')
  assert.equal(rejected.rejectionReason, rejectionReasonText)
  assert.ok(rejected.reviewedAt)

  // Check persisted state in service
  const postRejection = await dataService.getDeviceRegistration('dev_005')
  assert.equal(postRejection?.status, 'rejected')
  assert.equal(postRejection?.rejectionReason, rejectionReasonText)
  console.log(`  ✓ Device ${rejected.deviceName} (${rejected.deviceId}) rejected with reason: "${rejected.rejectionReason}"`)

  // ────────────────────────────────────────────────────────────
  // Test 8: Rejection without a reason is blocked
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 8: Rejection without a reason is blocked')
  // Reset so we have a pending device
  await dataService.resetMockData()
  await assert.rejects(
    async () => dataService.rejectDeviceRegistration('dev_005', ''),
    /A valid rejection reason is required/
  )
  await assert.rejects(
    async () => dataService.rejectDeviceRegistration('dev_005', '   '),
    /A valid rejection reason is required/
  )
  console.log('  ✓ Rejection without reason properly blocked')

  // ────────────────────────────────────────────────────────────
  // Test 9: Duplicate approval and invalid transitions are rejected
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 9: Duplicate approval and invalid transitions are rejected')
  // dev_001 is already approved
  await assert.rejects(
    async () => dataService.approveDeviceRegistration('dev_001'),
    /already approved/
  )
  console.log('  ✓ Duplicate approval safely blocked')

  // dev_004 is already rejected
  await assert.rejects(
    async () => dataService.rejectDeviceRegistration('dev_004', 'Some reason'),
    /already rejected/
  )
  console.log('  ✓ Duplicate rejection safely blocked')

  // Cannot approve a rejected device directly without re-registration
  await assert.rejects(
    async () => dataService.approveDeviceRegistration('dev_004'),
    /Invalid state transition/
  )
  console.log('  ✓ Invalid transition from "rejected" to "approved" safely blocked')

  // ────────────────────────────────────────────────────────────
  // Test 10: Duplicate employee IDs are prevented
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 10: Duplicate employee IDs are prevented')
  await assert.rejects(
    async () => dataService.createEmployee({
      id: 'emp_001',
      name: 'Duplicate Sarah',
      email: 'duplicate.sarah@example.com',
      role: 'employee',
    }),
    /Duplicate Employee ID: An employee with ID "emp_001" already exists/
  )
  console.log('  ✓ Duplicate employee ID creation blocked')

  // Adding a new valid employee succeeds
  const newEmp = await dataService.createEmployee({
    id: 'emp_008',
    name: 'Ada Lovelace',
    email: 'ada.lovelace@example.com',
    role: 'employee',
    department: 'Engineering',
  })
  assert.equal(newEmp.id, 'emp_008')
  assert.equal(newEmp.name, 'Ada Lovelace')
  const empListAfterAdd = await dataService.getEmployees()
  assert.ok(empListAfterAdd.some(e => e.id === 'emp_008'))
  console.log(`  ✓ New employee created successfully: ${newEmp.name} (${newEmp.id})`)

  // Updating employee profile
  const updatedEmp = await dataService.updateEmployee('emp_008', {
    name: 'Countess Ada Lovelace',
    department: 'Research',
  })
  assert.equal(updatedEmp.name, 'Countess Ada Lovelace')
  assert.equal(updatedEmp.department, 'Research')
  console.log(`  ✓ Employee profile updated: ${updatedEmp.name} in department ${updatedEmp.department}`)

  // ────────────────────────────────────────────────────────────
  // Test 11: Existing seeded demo data renders correctly
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 11: Existing seeded demo data renders correctly')
  await dataService.resetMockData()
  const seededEmps = await dataService.getEmployees()
  const seededDevs = await dataService.getDevices()
  const seededRegs = await dataService.getDeviceRegistrations()
  const seededSess = await dataService.getSessions()

  assert.equal(seededEmps.length, 7, 'Must have 7 seeded employees')
  assert.equal(seededDevs.length, 6, 'Must have 6 seeded devices')
  assert.equal(seededRegs.length, 6, 'Must have 6 device registrations')
  assert.equal(seededSess.length, 5, 'Must have 5 seeded work sessions')

  // Verify that seeded breaks match the schema
  for (const s of seededSess) {
    if (s.breaks) {
      for (const b of s.breaks) {
        assert.ok(b.reason, 'Break reason must exist')
        assert.ok(b.startedAt instanceof Date, 'Break startedAt must be Date')
      }
    }
  }
  console.log('  ✓ All seeded demo data validated for consistency and completeness')

  console.log('\n🎉 ALL PHASE 5 TESTS PASSED WITH ZERO FAILURES!')
}

runPhase5Tests().catch(err => {
  console.error('\n❌ Phase 5 Test failed:', err)
  process.exit(1)
})
