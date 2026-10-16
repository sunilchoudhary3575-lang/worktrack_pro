// ============================================================
// Phase 3 Test Suite: Employee App Device Registration Lifecycle
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
    randomUUID: () => '12345678-1234-4234-8234-123456789abc',
  },
  __hostname__: 'TEST-WORKSTATION-01',
}

// Import deviceService
import { deviceService } from './apps/employee-app/src/services/deviceService.js'

async function runTests() {
  console.log('🧪 Starting Phase 3 Employee Device Registration Tests...\n')

  // Test 1: First launch creates a device ID
  console.log('Test 1: First launch creates a unique device ID')
  mockStorage.clear()
  const info1 = await deviceService.getDeviceInfo()
  assert.ok(info1.deviceId, 'Device ID should be generated')
  assert.ok(info1.deviceId.startsWith('dev_'), 'Device ID should start with dev_')
  assert.equal(info1.deviceName, 'TEST-WORKSTATION-01', 'Device name should match detected hostname')
  console.log(`  ✓ Generated Device ID: ${info1.deviceId} on machine ${info1.deviceName}`)

  // Test 2: Restart preserves the same device ID
  console.log('\nTest 2: Restart preserves the same device ID')
  const info2 = await deviceService.getDeviceInfo()
  assert.equal(info1.deviceId, info2.deviceId, 'Device ID must remain stable after restart')
  console.log(`  ✓ Device ID preserved after restart: ${info2.deviceId}`)

  // Test 3: Initial state is 'not_registered'
  console.log('\nTest 3: Initial state is "not_registered"')
  const initialRecord = await deviceService.getRegistrationRecord()
  assert.equal(initialRecord.status, 'not_registered', 'Initial registration state must be not_registered')
  console.log(`  ✓ Initial state confirmed: ${initialRecord.status}`)

  // Test 4: Validation requires Employee ID and Name
  console.log('\nTest 4: Validation prevents registration without Employee ID or Name')
  await assert.rejects(
    async () => deviceService.registerDevice({ employeeId: '', employeeName: 'Sarah Johnson' }),
    /Employee ID is required/
  )
  await assert.rejects(
    async () => deviceService.registerDevice({ employeeId: 'emp_001', employeeName: '' }),
    /Employee Name is required/
  )
  console.log('  ✓ Empty fields rejected properly')

  // Test 5: Registration changes state to 'pending_approval'
  console.log('\nTest 5: Valid registration transitions state to "pending_approval"')
  const submitted = await deviceService.registerDevice({
    employeeId: 'emp_001',
    employeeName: 'Sarah Johnson',
    department: 'Engineering',
  })
  assert.equal(submitted.status, 'pending_approval', 'Status must transition to pending_approval')
  assert.equal(submitted.employeeId, 'emp_001')
  assert.equal(submitted.employeeName, 'Sarah Johnson')
  assert.equal(submitted.department, 'Engineering')
  console.log(`  ✓ Registered: ${submitted.employeeName} -> Status: ${submitted.status}`)

  // Test 6: Duplicate registration while pending is rejected
  console.log('\nTest 6: Duplicate registration while pending is prevented')
  await assert.rejects(
    async () => deviceService.registerDevice({ employeeId: 'emp_001', employeeName: 'Sarah Johnson' }),
    /Registration is already pending/
  )
  console.log('  ✓ Duplicate pending registration safely blocked')

  // Test 7: Simulated restart preserves pending_approval state
  console.log('\nTest 7: Pending state persists across restarts')
  const recordAfterRestart = await deviceService.getRegistrationRecord()
  assert.equal(recordAfterRestart.status, 'pending_approval')
  assert.equal(recordAfterRestart.employeeId, 'emp_001')
  console.log('  ✓ Pending approval state persisted successfully')

  // Test 8: Invalid state transition is rejected
  console.log('\nTest 8: Invalid state transitions are rejected')
  // Cannot review a record that is already approved or not registered
  mockStorage.clear() // reset to not_registered
  await assert.rejects(
    async () => deviceService.simulateAdminReview('approved'),
    /Invalid state transition/
  )
  console.log('  ✓ Cannot approve a device that was never submitted')

  // Re-register for approval flow
  await deviceService.registerDevice({ employeeId: 'emp_002', employeeName: 'Marcus Chen' })

  // Test 9: Admin approval transition
  console.log('\nTest 9: Admin approval transitions state to "approved"')
  const approved = await deviceService.simulateAdminReview('approved')
  assert.equal(approved.status, 'approved', 'State must be approved')
  assert.ok(approved.reviewedAt, 'reviewedAt timestamp must be set')
  console.log(`  ✓ Device approved by: ${approved.reviewedBy} at ${approved.reviewedAt}`)

  // Test 10: Duplicate registration while approved is rejected
  console.log('\nTest 10: Duplicate registration while approved is prevented')
  await assert.rejects(
    async () => deviceService.registerDevice({ employeeId: 'emp_002', employeeName: 'Marcus Chen' }),
    /This device is already approved/
  )
  console.log('  ✓ Duplicate approved registration safely blocked')

  // Test 11: Admin rejection flow & re-registration
  console.log('\nTest 11: Rejection flow and subsequent re-registration')
  await deviceService.resetRegistration()
  await deviceService.registerDevice({ employeeId: 'emp_003', employeeName: 'Priya Sharma' })
  const rejected = await deviceService.simulateAdminReview('rejected', 'Hardware serial mismatch')
  assert.equal(rejected.status, 'rejected', 'State must be rejected')
  assert.equal(rejected.rejectionReason, 'Hardware serial mismatch')
  console.log(`  ✓ Device rejected with reason: "${rejected.rejectionReason}"`)

  // Re-registration after rejection is permitted
  const reSubmitted = await deviceService.registerDevice({
    employeeId: 'emp_003',
    employeeName: 'Priya Sharma (Corrected)',
    department: 'DevOps',
  })
  assert.equal(reSubmitted.status, 'pending_approval')
  console.log(`  ✓ Re-registration after rejection succeeded -> Status: ${reSubmitted.status}`)

  console.log('\n🎉 ALL PHASE 3 TEST SCENARIOS PASSED WITH ZERO FAILURES!')
}

runTests().catch(err => {
  console.error('\n❌ Test failed:', err)
  process.exit(1)
})
