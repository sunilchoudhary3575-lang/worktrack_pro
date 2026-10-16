// ============================================================
// WorkTrack Pro — Phase 8: Scheduled Sessions & Windows Background Execution
// Automated Test Suite (Injectable Clock & Deterministic Schedule Engine)
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
import { deviceService } from './apps/employee-app/src/services/deviceService.js'
import { sessionService } from './apps/employee-app/src/services/sessionService.js'
import { permissionService } from './apps/employee-app/src/services/permissionService.js'
import { screenshotService } from './apps/employee-app/src/services/screenshotService.js'
import {
  ScheduleService,
  IClock,
} from './apps/employee-app/src/services/scheduleService.js'
import type { CaptureScreenshotPayload } from './packages/shared/dist/index.js'

// Deterministic Fake Clock implementation
class FakeClock implements IClock {
  private currentTime: Date
  private timers = new Map<number, { fn: () => void; type: 'timeout' | 'interval' }>()
  private nextId = 1

  constructor(initialDate: Date) {
    this.currentTime = new Date(initialDate)
  }

  now(): Date {
    return new Date(this.currentTime)
  }

  setTime(newDate: Date): void {
    this.currentTime = new Date(newDate)
  }

  advanceMinutes(mins: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + mins * 60 * 1000)
  }

  advanceHours(hours: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + hours * 3600 * 1000)
  }

  setTimeout(fn: () => void, _ms: number): any {
    const id = this.nextId++
    this.timers.set(id, { fn, type: 'timeout' })
    return id
  }

  clearTimeout(id: any): void {
    this.timers.delete(id)
  }

  setInterval(fn: () => void, _ms: number): any {
    const id = this.nextId++
    this.timers.set(id, { fn, type: 'interval' })
    return id
  }

  clearInterval(id: any): void {
    this.timers.delete(id)
  }

  getActiveTimersCount(): number {
    return this.timers.size
  }
}

async function runPhase8Tests() {
  console.log('🧪 Starting Phase 8: Scheduled Work Sessions & Background Execution Tests...\n')
  console.log('[Test Mode: Deterministic Fake Timer Simulation with Injectable Clock]\n')

  mockStorage.clear()
  await permissionService.resetAll()
  await screenshotService.resetMockStorage()

  const deviceInfo = await deviceService.getDeviceInfo()
  const TEST_DEVICE_ID = deviceInfo.deviceId
  const TEST_EMP_ID = 'emp_sarah_001'
  const TEST_EMP_NAME = 'Sarah Johnson'

  // Standard test day: 2026-10-16 (Friday)
  const baseDate = new Date('2026-10-16T09:00:00')
  const fakeClock = new FakeClock(baseDate)
  const scheduleService = new ScheduleService(fakeClock)

  // Register device and approve
  await deviceService.registerDevice({
    deviceId: TEST_DEVICE_ID,
    employeeId: TEST_EMP_ID,
    employeeName: TEST_EMP_NAME,
    department: 'Engineering',
  })
  await deviceService.simulateAdminReview('approved')

  // Save Onboarding Policy Acknowledgement
  await scheduleService.saveOnboardingRecord({
    employeeId: TEST_EMP_ID,
    deviceId: TEST_DEVICE_ID,
    acknowledgedAt: baseDate.toISOString(),
    policyVersion: 'v1.0-phase8',
    agreedToTerms: true,
    acknowledgedWorkingHours: '09:30 - 18:30',
    acknowledgedStoragePolicy: true,
    acknowledgedWhoHasAccess: true,
  })

  // Grant Pre-Authorization
  await permissionService.grantPreAuthorization({
    employeeId: TEST_EMP_ID,
    employeeName: TEST_EMP_NAME,
    deviceId: TEST_DEVICE_ID,
    deviceName: deviceInfo.deviceName,
    policyVersion: 'v1.0-phase8',
  })

  // ────────────────────────────────────────────────────────────
  // Test 1: Automatic session start at 9:30 AM
  // ────────────────────────────────────────────────────────────
  console.log('Test 1: Automatic session start at 9:30 AM')
  fakeClock.setTime(new Date('2026-10-16T09:30:00'))

  const resStart = await scheduleService.evaluateSchedule()
  assert.equal(resStart.action, 'started', 'Schedule should trigger automated start at 09:30')
  assert.ok(resStart.session, 'Started session object must exist')
  assert.equal(resStart.session.status, 'working', 'Session must be in working state')
  assert.equal(resStart.session.startedAt.getHours(), 9)
  assert.equal(resStart.session.startedAt.getMinutes(), 30)

  const active1 = await sessionService.getActiveSession()
  assert.ok(active1, 'Active session must be retrievable from sessionService')
  assert.equal(active1.id, resStart.session.id)
  console.log('  ✓ Automated session successfully started at 09:30 AM')

  // ────────────────────────────────────────────────────────────
  // Test 2: No duplicate session when session is already running
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 2: No duplicate session when session is already running')
  fakeClock.setTime(new Date('2026-10-16T09:35:00'))

  const resDup = await scheduleService.evaluateSchedule()
  assert.equal(resDup.action, 'none', 'Schedule must not create duplicate session')
  assert.match(resDup.reason, /already in progress/i)

  const active2 = await sessionService.getActiveSession()
  assert.equal(active2?.id, active1.id, 'Session ID must remain identical')
  console.log('  ✓ Duplicate session prevented when session is already active')

  // ────────────────────────────────────────────────────────────
  // Test 3: Automatic session end at 6:30 PM (18:30)
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 3: Automatic session end at 6:30 PM (18:30)')
  fakeClock.setTime(new Date('2026-10-16T18:30:00'))

  const resEnd = await scheduleService.evaluateSchedule()
  assert.equal(resEnd.action, 'ended', 'Schedule must automatically end session at 18:30')
  assert.ok(resEnd.session, 'Ended session must be returned')
  assert.equal(resEnd.session.status, 'ended', 'Ended session status must be "ended"')
  assert.ok(resEnd.session.endedAt, 'Ended timestamp must be recorded')

  const active3 = await sessionService.getActiveSession()
  assert.equal(active3, null, 'Active session must be cleared after 18:30')

  const history = await sessionService.getHistory()
  assert.equal(history.length, 1, 'Completed session must be in history')
  console.log('  ✓ Automated session ended safely at 6:30 PM boundary')

  // ────────────────────────────────────────────────────────────
  // Test 4: Break closure at session end
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 4: Break closure at session end')
  // Next day: 2026-10-17
  await scheduleService.saveScheduleState({
    scheduledSessionStartedDateStr: undefined,
    manualStopDateStr: undefined,
  })

  fakeClock.setTime(new Date('2026-10-17T09:30:00'))
  await scheduleService.evaluateSchedule()

  // Employee starts break at 18:00
  fakeClock.setTime(new Date('2026-10-17T18:00:00'))
  const onBreak = await sessionService.startBreak('coffee', { timestamp: fakeClock.now() })
  assert.equal(onBreak.status, 'on_break', 'Session must be on break')
  assert.equal(onBreak.breaks?.length, 1)
  assert.equal(onBreak.breaks?.[0].endedAt, undefined, 'Break must be ongoing initially')

  // Advance clock to 18:30:00 (end of day)
  fakeClock.setTime(new Date('2026-10-17T18:30:00'))
  const resEndBreak = await scheduleService.evaluateSchedule()
  assert.equal(resEndBreak.action, 'ended', 'Session must end automatically')

  const endedSession = resEndBreak.session!
  assert.equal(endedSession.status, 'ended')
  const closedBreak = endedSession.breaks![0]
  assert.ok(closedBreak.endedAt, 'Active break must be closed at session end')
  assert.equal(closedBreak.durationSeconds, 30 * 60, 'Break duration must be accurately calculated (30 mins)')
  console.log('  ✓ Open break safely closed and calculated when session ended at 18:30')

  // ────────────────────────────────────────────────────────────
  // Test 5: No session for an unapproved device
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 5: No session for an unapproved device')
  await deviceService.resetRegistration()
  await deviceService.registerDevice({
    deviceId: TEST_DEVICE_ID,
    employeeId: TEST_EMP_ID,
    employeeName: TEST_EMP_NAME,
    department: 'Engineering',
  })
  await deviceService.simulateAdminReview('rejected', 'Security compliance failed')
  fakeClock.setTime(new Date('2026-10-18T09:30:00'))

  const resUnapproved = await scheduleService.evaluateSchedule()
  assert.equal(resUnapproved.action, 'blocked')
  assert.match(resUnapproved.reason, /Device must be approved/i)

  const activeUnapproved = await sessionService.getActiveSession()
  assert.equal(activeUnapproved, null, 'No session must be started on rejected device')
  console.log('  ✓ Session blocked when device is not in approved state')

  // Restore approval for subsequent tests
  await deviceService.resetRegistration()
  await deviceService.registerDevice({
    deviceId: TEST_DEVICE_ID,
    employeeId: TEST_EMP_ID,
    employeeName: TEST_EMP_NAME,
    department: 'Engineering',
  })
  await deviceService.simulateAdminReview('approved')

  // ────────────────────────────────────────────────────────────
  // Test 6: No session without policy acknowledgement and valid authorization
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 6: No session without policy acknowledgement and valid authorization')
  // 6a. Policy acknowledgement missing
  await scheduleService.saveOnboardingRecord({
    employeeId: TEST_EMP_ID,
    deviceId: TEST_DEVICE_ID,
    acknowledgedAt: '',
    policyVersion: '',
    agreedToTerms: false,
    acknowledgedWorkingHours: '',
    acknowledgedStoragePolicy: false,
    acknowledgedWhoHasAccess: false,
  })

  const resMissingPolicy = await scheduleService.evaluateSchedule()
  assert.equal(resMissingPolicy.action, 'blocked')
  assert.match(resMissingPolicy.reason, /Onboarding policy acknowledgement is required/i)

  // Restore policy acknowledgement
  await scheduleService.saveOnboardingRecord({
    employeeId: TEST_EMP_ID,
    deviceId: TEST_DEVICE_ID,
    acknowledgedAt: new Date().toISOString(),
    policyVersion: 'v1.0-phase8',
    agreedToTerms: true,
    acknowledgedWorkingHours: '09:30 - 18:30',
    acknowledgedStoragePolicy: true,
    acknowledgedWhoHasAccess: true,
  })

  // 6b. Authorization revoked
  await permissionService.revokePreAuthorization(TEST_DEVICE_ID)
  const resRevoked = await scheduleService.evaluateSchedule()
  assert.equal(resRevoked.action, 'blocked')
  assert.match(resRevoked.reason, /Valid monitoring authorization is required/i)
  console.log('  ✓ Session blocked when onboarding missing or monitoring authorization revoked')

  // Restore authorization
  await permissionService.grantPreAuthorization({
    employeeId: TEST_EMP_ID,
    deviceId: TEST_DEVICE_ID,
  })

  // ────────────────────────────────────────────────────────────
  // Test 7: Revoked authorization during active session and manual stop same-day policy
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 7: Revoked authorization during active session and manual stop same-day policy')
  // 7a. Active session terminated when authorization revoked
  fakeClock.setTime(new Date('2026-10-19T09:30:00'))
  await scheduleService.evaluateSchedule()
  assert.ok(await sessionService.getActiveSession(), 'Session should be active')

  // Revoke authorization
  await permissionService.revokePreAuthorization(TEST_DEVICE_ID)
  const resAuthKill = await scheduleService.evaluateSchedule()
  assert.equal(resAuthKill.action, 'ended', 'Active session must be ended when authorization revoked')
  assert.equal(await sessionService.getActiveSession(), null)

  // 7b. Manual stop same-day restart policy
  await permissionService.grantPreAuthorization({
    employeeId: TEST_EMP_ID,
    deviceId: TEST_DEVICE_ID,
  })
  // Employee manually starts session at 11:00
  fakeClock.setTime(new Date('2026-10-19T11:00:00'))
  await scheduleService.recordManualStart()
  await sessionService.startWork({ deviceId: TEST_DEVICE_ID, employeeId: TEST_EMP_ID, timestamp: fakeClock.now() })

  // Employee manually ends session at 13:00
  fakeClock.setTime(new Date('2026-10-19T13:00:00'))
  await scheduleService.recordManualStop(fakeClock.now())
  await sessionService.endWork({ timestamp: fakeClock.now() })

  // Next scheduler tick at 13:15
  fakeClock.setTime(new Date('2026-10-19T13:15:00'))
  const resManualSuppress = await scheduleService.evaluateSchedule()
  assert.equal(resManualSuppress.action, 'none', 'Scheduler must suppress auto-restart after same-day manual stop')
  assert.match(resManualSuppress.reason, /manually stopped by employee/i)
  assert.equal(await sessionService.getActiveSession(), null)
  console.log('  ✓ Revoked authorization terminates active sessions and manual stop prevents automatic restart')

  // ────────────────────────────────────────────────────────────
  // Test 8: App startup between 9:30 AM and 6:30 PM records actual start time
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 8: App startup between 9:30 AM and 6:30 PM records actual start time')
  // New day: 2026-10-20, app opens at 11:15:30 AM
  await scheduleService.saveScheduleState({
    scheduledSessionStartedDateStr: undefined,
    manualStopDateStr: undefined,
  })

  const midDayTime = new Date('2026-10-20T11:15:30')
  fakeClock.setTime(midDayTime)

  const resMidDay = await scheduleService.evaluateSchedule()
  assert.equal(resMidDay.action, 'started')
  assert.equal(resMidDay.session?.startedAt.getHours(), 11, 'Start hour must be actual time (11)')
  assert.equal(resMidDay.session?.startedAt.getMinutes(), 15, 'Start minute must be actual time (15)')
  assert.equal(resMidDay.session?.startedAt.getSeconds(), 30, 'Start second must be actual time (30)')
  console.log('  ✓ Mid-day startup accurately recorded actual timestamp (11:15:30) without fabricating 09:30')

  // End mid-day session
  await sessionService.endWork()

  // ────────────────────────────────────────────────────────────
  // Test 9: Startup after 6:30 PM does not start a session
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 9: Startup after 6:30 PM does not start a session')
  // New day: 2026-10-21, app opens at 19:15:00 (7:15 PM)
  await scheduleService.saveScheduleState({
    scheduledSessionStartedDateStr: undefined,
    manualStopDateStr: undefined,
  })

  fakeClock.setTime(new Date('2026-10-21T19:15:00'))
  const resAfterHours = await scheduleService.evaluateSchedule()
  assert.equal(resAfterHours.action, 'none')
  assert.match(resAfterHours.reason, /Outside scheduled working hours/i)
  assert.equal(await sessionService.getActiveSession(), null)
  console.log('  ✓ Startup after 18:30 did not start a work session')

  // ────────────────────────────────────────────────────────────
  // Test 10: Restart and sleep/wake do not duplicate sessions
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 10: Restart and sleep/wake do not duplicate sessions')
  // Day: 2026-10-22. Session starts at 09:30
  await scheduleService.saveScheduleState({
    scheduledSessionStartedDateStr: undefined,
    manualStopDateStr: undefined,
  })

  fakeClock.setTime(new Date('2026-10-22T09:30:00'))
  await scheduleService.evaluateSchedule()
  const origSession = await sessionService.getActiveSession()
  assert.ok(origSession)

  // Simulate app restart / computer sleep-wake: advance to 10:45
  fakeClock.setTime(new Date('2026-10-22T10:45:00'))
  const restartedService = new ScheduleService(fakeClock)
  const resWake = await restartedService.evaluateSchedule()

  assert.equal(resWake.action, 'none')
  const currentSession = await sessionService.getActiveSession()
  assert.equal(currentSession?.id, origSession.id, 'Session must remain the same across restart/wake')
  console.log('  ✓ Restarts and sleep/wake cycles maintain single persistent session without duplication')

  // Clean up session
  await sessionService.endWork()

  // ────────────────────────────────────────────────────────────
  // Test 11: Scheduler background loop does not create duplicate timers
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 11: Scheduler background loop does not create duplicate timers')
  assert.equal(fakeClock.getActiveTimersCount(), 0, 'Initially 0 timers')

  scheduleService.startBackgroundLoop(10000)
  assert.equal(fakeClock.getActiveTimersCount(), 1, 'Exactly 1 timer created')

  // Call startBackgroundLoop again
  scheduleService.startBackgroundLoop(10000)
  assert.equal(fakeClock.getActiveTimersCount(), 1, 'Re-starting loop must clean up previous timer (still 1)')

  scheduleService.stopBackgroundLoop()
  assert.equal(fakeClock.getActiveTimersCount(), 0, 'Stopping loop cleans up timer (0)')
  console.log('  ✓ Scheduler safely managed timers without leaks or duplicate intervals')

  // ────────────────────────────────────────────────────────────
  // Test 12: Screenshot capture is blocked during breaks, after session end, and outside hours
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 12: Screenshot capture is blocked during breaks, after session end, and outside hours')
  // Day: 2026-10-23
  await scheduleService.saveScheduleState({
    scheduledSessionStartedDateStr: undefined,
    manualStopDateStr: undefined,
  })

  fakeClock.setTime(new Date('2026-10-23T10:00:00'))
  await scheduleService.evaluateSchedule()
  const activeSess = await sessionService.getActiveSession()
  assert.ok(activeSess, 'Active session must be started')

  const testPayload: CaptureScreenshotPayload = {
    deviceId: TEST_DEVICE_ID,
    sessionId: activeSess.id,
    employeeId: TEST_EMP_ID,
    checkScheduleHours: true,
  }

  // 12a. Valid capture during active working session
  const resValid = await screenshotService.captureScreenshot(testPayload)
  assert.equal(resValid.success, true, 'Capture must succeed during active working session')

  // 12b. Blocked during break
  await sessionService.startBreak('coffee')
  const resBreak = await screenshotService.captureScreenshot(testPayload)
  assert.equal(resBreak.success, false, 'Capture must be blocked during break')
  assert.equal(resBreak.errorCode, 'INACTIVE_SESSION')
  assert.match(resBreak.error || '', /Capture is not permitted during breaks/i)

  // 12c. Blocked after session end
  await sessionService.endWork()
  const resEnded = await screenshotService.captureScreenshot(testPayload)
  assert.equal(resEnded.success, false, 'Capture must be blocked after session ended')
  assert.equal(resEnded.errorCode, 'INACTIVE_SESSION')

  // 12d. Blocked outside schedule hours
  const payloadOutside: CaptureScreenshotPayload = {
    ...testPayload,
    timestamp: new Date('2026-10-23T19:00:00'), // 7:00 PM
  }
  const resOutside = await screenshotService.captureScreenshot(payloadOutside)
  assert.equal(resOutside.success, false, 'Capture must be blocked outside hours')
  assert.equal(resOutside.errorCode, 'INACTIVE_SESSION')
  console.log('  ✓ Screenshot capture strictly blocked during breaks, after session end, and outside hours')

  // ────────────────────────────────────────────────────────────
  // Test 13: Tray actions and startup settings work safely
  // ────────────────────────────────────────────────────────────
  console.log('\nTest 13: Tray actions and startup settings work safely')
  const defSettings = await scheduleService.getBackgroundSettings()
  assert.equal(defSettings.minimizeToTrayOnClose, false, 'Default minimizeToTrayOnClose must be false')
  assert.equal(defSettings.launchOnStartup, false, 'Default launchOnStartup must be false')

  const updatedSettings = await scheduleService.saveBackgroundSettings({
    minimizeToTrayOnClose: true,
    launchOnStartup: true,
  })
  assert.equal(updatedSettings.minimizeToTrayOnClose, true)
  assert.equal(updatedSettings.launchOnStartup, true)

  const reloadedSettings = await scheduleService.getBackgroundSettings()
  assert.equal(reloadedSettings.minimizeToTrayOnClose, true)
  assert.equal(reloadedSettings.launchOnStartup, true)

  // Status mapping
  const statusInfo = await scheduleService.getScheduleStatus(new Date('2026-10-23T20:00:00'))
  assert.equal(statusInfo.isWithinHours, false)
  assert.equal(statusInfo.deviceApproved, true)
  assert.equal(statusInfo.onboardingCompleted, true)
  assert.ok(statusInfo.statusText)
  console.log('  ✓ Background settings and system tray status mappings verified')

  console.log('\n' + '='.repeat(60))
  console.log('✅ ALL PHASE 8 AUTOMATED TESTS PASSED SUCCESSFULLY!')
  console.log('='.repeat(60) + '\n')
}

runPhase8Tests().catch(err => {
  console.error('\n❌ Phase 8 Test Suite Failed:', err)
  process.exit(1)
})
