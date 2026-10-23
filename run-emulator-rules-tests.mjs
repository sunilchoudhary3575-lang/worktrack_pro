// ============================================================
// WorkTrack Pro — Firestore Emulator Rules Test Runner
// Configures Java environment and executes tests inside emulator
// ============================================================

import { spawn } from 'node:child_process'
import path from 'node:path'

import fs from 'node:fs'

function findJava21() {
  const microsoftDir = 'C:\\Program Files\\Microsoft'
  if (fs.existsSync(microsoftDir)) {
    const entries = fs.readdirSync(microsoftDir)
    const jdk21 = entries.find((e) => e.startsWith('jdk-21'))
    if (jdk21) {
      return path.join(microsoftDir, jdk21)
    }
  }
  return 'C:\\Program Files\\Microsoft\\jdk-21.0.12.101-hotspot'
}

const javaHome = findJava21()
const javaBin = path.join(javaHome, 'bin')

const env = {
  ...process.env,
  JAVA_HOME: javaHome,
  PATH: `${javaBin};${process.env.PATH || ''}`,
}

console.log('🚀 Launching Firestore & Storage Emulators with Security Rules...\n')

const isWindows = process.platform === 'win32'
const child = spawn('npx', ['firebase-tools', 'emulators:exec', '--only', 'firestore,storage', 'run-test.bat'], {
  shell: true,
  env,
  stdio: 'inherit',
})

child.on('exit', (code) => {
  if (code !== 0) {
    console.error(`\n❌ Emulator test run failed with exit code ${code}`)
  }
  process.exit(code || 0)
})
