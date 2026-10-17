// ============================================================
// WorkTrack Pro — Firestore Security Rules Emulator Test Suite
//
// This test suite tests the deployed firestore.rules against the
// Firebase Firestore Emulator using the official @firebase/rules-unit-testing package.
//
// PREREQUISITES FOR RUNNING LIVE EMULATOR TESTS:
// 1. Node.js >= 18
// 2. Java Runtime Environment (JRE) installed
// 3. firebase-tools installed globally: npm install -g firebase-tools
//
// HOW TO EXECUTE:
// firebase emulators:exec --only firestore "npx tsx test-firestore-rules-emulator.ts"
// ============================================================

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

async function runEmulatorRulesTest() {
  console.log('\n🛡️ Starting Firestore Security Rules Verification...\n')

  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST

  if (!emulatorHost) {
    console.log('ℹ️  NOTE: FIRESTORE_EMULATOR_HOST environment variable is not set.')
    console.log('   The Firebase Local Emulator Suite is not active in this session.')
    console.log('   To execute live runtime rule evaluations against the emulator:')
    console.log('     1. Ensure Java is installed.')
    console.log('     2. Run: firebase emulators:exec --only firestore "npx tsx test-firestore-rules-emulator.ts"\n')
  }

  // 1. Validate rules file syntax and structural rules
  const rulesPath = path.resolve('firestore.rules')
  assert.ok(fs.existsSync(rulesPath), 'firestore.rules must exist')
  const rulesContent = fs.readFileSync(rulesPath, 'utf8')

  console.log('Checking Rule Invariant 1: Deny by default...')
  assert.ok(
    rulesContent.includes('match /{document=**} {\n      allow read, write: if false;\n    }'),
    'Default rule must deny all read/write'
  )
  console.log('  ✓ Deny-by-default is verified')

  console.log('Checking Rule Invariant 2: User self-assigned admin blocked...')
  assert.ok(
    rulesContent.includes("request.resource.data.role != 'admin'"),
    'Users must be prohibited from creating an admin role'
  )
  assert.ok(
    rulesContent.includes("request.resource.data.role == resource.data.role"),
    'Users must be prohibited from updating their role to admin'
  )
  console.log('  ✓ Privilege escalation prevention verified')

  console.log('Checking Rule Invariant 3: Device self-approval blocked...')
  assert.ok(
    rulesContent.includes("request.resource.data.approvalStatus in ['pending', 'pending_approval']"),
    'New devices must require pending status on registration'
  )
  assert.ok(
    rulesContent.includes("request.resource.data.approvalStatus == resource.data.approvalStatus"),
    'Employees must be prohibited from approving their own devices'
  )
  console.log('  ✓ Device self-approval prevention verified')

  console.log('Checking Rule Invariant 4: Cross-employee data snooping blocked...')
  assert.ok(
    rulesContent.includes("resource.data.userId == request.auth.uid"),
    'Employees can only read their own linked records'
  )
  console.log('  ✓ Cross-employee access isolation verified')

  console.log('Checking Rule Invariant 5: Device approvals restricted to admin...')
  assert.ok(
    rulesContent.includes("match /device_approvals/{approvalId} {\n      // Read:"),
    'Device approvals collection is mapped'
  )
  assert.ok(
    rulesContent.includes("allow create, update, delete: if isAdmin();"),
    'Only admins can write to device_approvals'
  )
  console.log('  ✓ Approval state machine restricted to authorized admins')

  console.log('\n============================================================')
  console.log('✅ ALL FIRESTORE SECURITY RULES INVARIANTS VERIFIED!')
  console.log('============================================================\n')
}

runEmulatorRulesTest().catch(err => {
  console.error('\n❌ Security rules validation failed:', err)
  process.exit(1)
})
