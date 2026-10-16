// ============================================================
// Phase 4 Test Suite: Employee Work Sessions Lifecycle & Time
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
    randomUUID: () => '11112222-3333-4444-5555-666677778888',
  },
  __hostname__: 'WORKSTATION-CORP-42',
}

// Import services and helpers
import { deviceService } from './apps/employee-app/src/services/deviceService.js'
import { sessionService, SessionService } from './apps/employee-app/src/services/sessionService.js'
import {
  calcSessionElapsedDuration,
  calcBreakDuration,
  calcTotalBreakDuration,
  calcWorkDuration,
  calculateSessionDurations,
} from './packages/shared/dist/index.js'

async function runPhase4Tests() {
  console.log('🧪 Starting Phase 4 Employee Work Session Tests...\n')
  mockStorage.clear()

  // ────────────────────────────────────────────────────────────
  // Test 1: An approved device can start a session
  // ────────────────────────────────────────────────────────────
  console.log('Test 1: An approved device can start a session')
  // Setup approved device
  await deviceService.registerDevice({
    employeeId: 'EMP_700',
    employeeName: 'Elena Rostova',
    department: 'Software Engineering',
  })
  await deviceService.simulateAdminReview('approved')

  const s1Start = new Date('2026-10-16T09:00:00.000Z')
  const session1 = await sessionService.startWork({ timestamp: s1Start })

  assert.ok(session1.id, 'Session ID must be generated')
  assert.equal(session1.status, 'working', 'Session state must transition to "working"')
  assert.equal(session1.employeeId, 'EMP_700')
  assert.equal(session1.startedAt.getTime(), s1Start.getTime())
  console.log(`  ✓ Session started: ${session1.id} (Status: ${session1.status}) at ${session1.startedAt.toISOString()}`)

  // ────────────────────────────────────────────────────────────
  // Test 2: An unapproved device cannot start a session
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 2: An unapproved device cannot start a session')
  await sessionService.resetAll()
  await deviceService.resetRegistration()

  // Case 2a: Not registered
  await assert.rejects(
    async () => sessionService.startWork(),
    /Device must be approved by an administrator/
  )
  console.log('  ✓ Starting session rejected when device is not_registered')

  // Case 2b: Pending approval
  await deviceService.registerDevice({
    employeeId: 'EMP_701',
    employeeName: 'David Kim',
  })
  await assert.rejects(
    async () => sessionService.startWork(),
    /Device must be approved by an administrator/
  )
  console.log('  ✓ Starting session rejected when device is pending_approval')

  // Case 2c: Rejected
  await deviceService.simulateAdminReview('rejected', 'Security policy violation')
  await assert.rejects(
    async () => sessionService.startWork(),
    /Device must be approved by an administrator/
  )
  console.log('  ✓ Starting session rejected when device is rejected')

  // Re-approve device for subsequent tests
  await deviceService.resetRegistration()
  await deviceService.registerDevice({
    employeeId: 'EMP_800',
    employeeName: 'Aiden Vance',
    department: 'Infrastructure',
  })
  await deviceService.simulateAdminReview('approved')

  // ────────────────────────────────────────────────────────────
  // Test 3: Start Work records the correct start timestamp
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 3: Start Work records the correct start timestamp')
  await sessionService.resetAll()
  const customStart = new Date('2026-10-16T08:30:00.000Z')
  const session3 = await sessionService.startWork({ timestamp: customStart })
  assert.equal(session3.startedAt.getTime(), customStart.getTime(), 'Start timestamp must match requested timestamp')
  console.log(`  ✓ Start timestamp correctly recorded: ${session3.startedAt.toISOString()}`)

  // ────────────────────────────────────────────────────────────
  // Test 4: Duplicate Start Work is rejected
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 4: Duplicate Start Work is rejected')
  await assert.rejects(
    async () => sessionService.startWork(),
    /Duplicate Start Work rejected: A work session is already in progress/
  )
  console.log('  ✓ Duplicate Start Work safely rejected')

  // ────────────────────────────────────────────────────────────
  // Test 5: Break requires a valid reason
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 5: Break requires a valid reason')
  await assert.rejects(
    async () => sessionService.startBreak('' as any),
    /Break requires a valid reason/
  )
  await assert.rejects(
    async () => sessionService.startBreak('   ' as any),
    /Break requires a valid reason/
  )
  console.log('  ✓ Empty and whitespace-only break reasons rejected')

  // ────────────────────────────────────────────────────────────
  // Test 6: Break start and end timestamps are recorded
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 6: Break start and end timestamps are recorded')
  const breakStart = new Date('2026-10-16T10:00:00.000Z')
  const breakResume = new Date('2026-10-16T10:15:00.000Z')

  const sessionOnBreak = await sessionService.startBreak('coffee', {
    customReason: 'Morning Espresso',
    timestamp: breakStart,
  })
  assert.equal(sessionOnBreak.status, 'on_break', 'Session status must transition to "on_break"')
  assert.equal(sessionOnBreak.breaks?.length, 1)
  assert.equal(sessionOnBreak.breaks![0].reason, 'coffee')
  assert.equal(sessionOnBreak.breaks![0].customReason, 'Morning Espresso')
  assert.equal(sessionOnBreak.breaks![0].startedAt.getTime(), breakStart.getTime())
  assert.equal(sessionOnBreak.breaks![0].endedAt, undefined, 'Active break must have undefined endedAt')
  console.log(`  ✓ Break started at: ${sessionOnBreak.breaks![0].startedAt.toISOString()} (status: ${sessionOnBreak.status})`)

  const sessionResumed = await sessionService.resumeWork({ timestamp: breakResume })
  assert.equal(sessionResumed.status, 'working', 'Session status must transition back to "working"')
  assert.equal(sessionResumed.breaks![0].endedAt?.getTime(), breakResume.getTime())
  console.log(`  ✓ Break ended at: ${sessionResumed.breaks![0].endedAt?.toISOString()} (status: ${sessionResumed.status})`)

  // ────────────────────────────────────────────────────────────
  // Test 7: Resuming work calculates break duration correctly
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 7: Resuming work calculates break duration correctly')
  // Break was 10:00:00 to 10:15:00 = 15 minutes = 900 seconds
  const recordedBreakDuration = sessionResumed.breaks![0].durationSeconds
  assert.equal(recordedBreakDuration, 900, 'Break duration must be precisely 900 seconds (15 minutes)')

  const liveDurationsAtResume = sessionService.calculateDurations(sessionResumed, breakResume)
  assert.equal(liveDurationsAtResume.breakSeconds, 900, 'Total break duration must reflect completed break')
  console.log(`  ✓ Break duration computed: ${recordedBreakDuration}s (15 min)`)

  // ────────────────────────────────────────────────────────────
  // Test 8: Ending a session records its end timestamp
  // ────────────────────────────────────────────────────
  console.log('\nTest 8: Ending a session records its end timestamp')
  const sessionEnd = new Date('2026-10-16T12:30:00.000Z')
  const endedSession = await sessionService.endWork({ timestamp: sessionEnd })
  assert.equal(endedSession.status, 'ended', 'Session status must be "ended"')
  assert.equal(endedSession.endedAt?.getTime(), sessionEnd.getTime())
  console.log(`  ✓ Session ended at: ${endedSession.endedAt?.toISOString()}`)

  // ────────────────────────────────────────────────────────────
  // Test 9: Ending a session during a break closes that break correctly
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 9: Ending a session during a break closes that break correctly')
  await sessionService.resetAll()
  const s9Start = new Date('2026-10-16T13:00:00.000Z')
  const s9BreakStart = new Date('2026-10-16T14:00:00.000Z')
  const s9End = new Date('2026-10-16T14:30:00.000Z') // Ending while on break!

  await sessionService.startWork({ timestamp: s9Start })
  await sessionService.startBreak('lunch', { timestamp: s9BreakStart })

  const stateWhileOnBreak = await sessionService.getSessionState()
  assert.equal(stateWhileOnBreak, 'on_break')

  // End while on break
  const s9Ended = await sessionService.endWork({ timestamp: s9End })
  assert.equal(s9Ended.status, 'ended')
  assert.equal(s9Ended.endedAt?.getTime(), s9End.getTime())

  // Verify the active lunch break was closed with s9End
  assert.equal(s9Ended.breaks?.length, 1)
  const closedLunchBreak = s9Ended.breaks![0]
  assert.equal(closedLunchBreak.endedAt?.getTime(), s9End.getTime(), 'Open break must close with session end timestamp')
  assert.equal(closedLunchBreak.durationSeconds, 1800, 'Break duration must be 30 minutes (1800s)')
  console.log(`  ✓ Active lunch break closed at ${closedLunchBreak.endedAt?.toISOString()} with duration ${closedLunchBreak.durationSeconds}s`)

  // ────────────────────────────────────────────────────────────
  // Test 10: Work duration excludes break duration
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 10: Work duration excludes break duration')
  // From Test 9:
  // Session total elapsed: 13:00:00 to 14:30:00 = 1.5 hours = 5400 seconds
  // Break duration: 14:00:00 to 14:30:00 = 0.5 hours = 1800 seconds
  // Work duration: 5400 - 1800 = 3600 seconds (1.0 hour)
  assert.equal(s9Ended.durationSeconds, 5400, 'Total elapsed duration must be 5400 seconds')
  assert.equal(s9Ended.breakDurationSeconds, 1800, 'Total break duration must be 1800 seconds')
  assert.equal(s9Ended.workDurationSeconds, 3600, 'Net work duration must be 3600 seconds')
  console.log(`  ✓ Time calculations verified: Elapsed (${s9Ended.durationSeconds}s) - Break (${s9Ended.breakDurationSeconds}s) = Work (${s9Ended.workDurationSeconds}s)`)

  // ────────────────────────────────────────────────────────────
  // Test 11: An active session survives an app restart
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 11: An active session survives an app restart')
  await sessionService.resetAll()
  const s11Start = new Date('2026-10-16T15:00:00.000Z')
  const initialSession = await sessionService.startWork({ timestamp: s11Start })

  // Simulate complete app restart by creating a fresh SessionService instance without memory cache
  const restartedService = new SessionService()
  const recoveredSession = await restartedService.getActiveSession()

  assert.ok(recoveredSession, 'Active session must be recovered after restart')
  assert.equal(recoveredSession!.id, initialSession.id, 'Session ID must remain identical')
  assert.equal(recoveredSession!.startedAt.getTime(), s11Start.getTime(), 'Start timestamp must not reset')
  assert.equal(recoveredSession!.status, 'working', 'Status must remain "working"')
  console.log(`  ✓ Session recovered after restart: ID ${recoveredSession!.id} startedAt ${recoveredSession!.startedAt.toISOString()}`)

  // ────────────────────────────────────────────────────────────
  // Test 12: An active break survives an app restart
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 12: An active break survives an app restart')
  const s12BreakStart = new Date('2026-10-16T15:45:00.000Z')
  await sessionService.startBreak('personal', {
    customReason: 'Bank visit',
    timestamp: s12BreakStart,
  })

  // Simulate app restart while on break
  const freshRestart = new SessionService()
  const recoveredBreakSession = await freshRestart.getActiveSession()

  assert.ok(recoveredBreakSession, 'Active break session must be recovered')
  assert.equal(recoveredBreakSession!.status, 'on_break', 'Session status must remain "on_break"')
  assert.equal(recoveredBreakSession!.breaks?.length, 1)
  const recoveredBreak = recoveredBreakSession!.breaks![0]
  assert.equal(recoveredBreak.reason, 'personal')
  assert.equal(recoveredBreak.customReason, 'Bank visit')
  assert.equal(recoveredBreak.startedAt.getTime(), s12BreakStart.getTime())
  assert.equal(recoveredBreak.endedAt, undefined, 'Active break must remain open after restart')
  console.log(`  ✓ Active break recovered after restart: "${recoveredBreak.reason}" startedAt ${recoveredBreak.startedAt.toISOString()}`)

  // ────────────────────────────────────────────────────────────
  // Test 13: A completed session remains in history
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 13: A completed session remains in history')
  const s13End = new Date('2026-10-16T16:30:00.000Z')
  await sessionService.endWork({ timestamp: s13End })

  const history = await sessionService.getHistory()
  assert.ok(history.length >= 1, 'History must contain the completed session')
  const archived = history[0]
  assert.equal(archived.status, 'ended')
  assert.equal(archived.endedAt?.getTime(), s13End.getTime())

  // Verify history survives app restart
  const freshHistoryService = new SessionService()
  const reloadedHistory = await freshHistoryService.getHistory()
  assert.equal(reloadedHistory.length, history.length)
  assert.equal(reloadedHistory[0].id, archived.id)
  console.log(`  ✓ Completed session confirmed in local history: ${archived.id} (Total sessions in log: ${reloadedHistory.length})`)

  // ────────────────────────────────────────────────────────────
  // Test 14: Invalid state transitions are rejected
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 14: Invalid state transitions are rejected')
  await sessionService.resetAll()

  // From 'not_started'
  assert.equal(await sessionService.getSessionState(), 'not_started')
  await assert.rejects(async () => sessionService.startBreak('coffee'), /Cannot start break: No active work session found/)
  await assert.rejects(async () => sessionService.resumeWork(), /Cannot resume work: No active session found/)
  await assert.rejects(async () => sessionService.endWork(), /Cannot end session: No active session found/)
  console.log('  ✓ Invalid transitions from "not_started" safely rejected')

  // From 'working'
  await sessionService.startWork()
  assert.equal(await sessionService.getSessionState(), 'working')
  await assert.rejects(async () => sessionService.startWork(), /Duplicate Start Work rejected/)
  await assert.rejects(async () => sessionService.resumeWork(), /Cannot resume work when session is "working"/)
  console.log('  ✓ Invalid transitions from "working" safely rejected')

  // From 'on_break'
  await sessionService.startBreak('lunch')
  assert.equal(await sessionService.getSessionState(), 'on_break')
  await assert.rejects(async () => sessionService.startWork(), /Duplicate Start Work rejected/)
  await assert.rejects(async () => sessionService.startBreak('coffee'), /Cannot take break when session is "on_break"/)
  console.log('  ✓ Invalid transitions from "on_break" safely rejected')

  // End session
  await sessionService.endWork()
  assert.equal(await sessionService.getSessionState(), 'not_started')
  await assert.rejects(async () => sessionService.endWork(), /No active session found/)
  console.log('  ✓ Duplicate end work safely rejected')

  // ────────────────────────────────────────────────────────────
  // Test 15: Phase 3 device registration still works
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 15: Phase 3 device registration still works')
  await deviceService.resetRegistration()
  const initialReg = await deviceService.getRegistrationRecord()
  assert.equal(initialReg.status, 'not_registered')

  const regAttempt = await deviceService.registerDevice({
    employeeId: 'EMP_999',
    employeeName: 'Grace Hopper',
    department: 'Computing',
  })
  assert.equal(regAttempt.status, 'pending_approval')

  const adminApproval = await deviceService.simulateAdminReview('approved')
  assert.equal(adminApproval.status, 'approved')
  assert.ok(adminApproval.reviewedAt)

  // Verify Phase 4 can start immediately after Phase 3 approval
  const phase4Session = await sessionService.startWork()
  assert.equal(phase4Session.status, 'working')
  await sessionService.endWork()
  console.log('  ✓ Phase 3 device registration flow verified and operates seamlessly with Phase 4')

  console.log('\n🎉 ALL 15 PHASE 4 SCENARIOS PASSED WITH ZERO FAILURES!')
}

runPhase4Tests().catch(err => {
  console.error('\n❌ Test execution failed:', err)
  process.exit(1)
})
