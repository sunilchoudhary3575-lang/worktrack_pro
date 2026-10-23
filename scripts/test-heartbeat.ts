import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import { getFirestore, doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import fs from 'node:fs'
import path from 'node:path'

const envPath = path.resolve('.env')
const envContent = fs.readFileSync(envPath, 'utf8')
const env: Record<string, string> = {}
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/)
  if (match) {
    env[match[1]] = (match[2] || '').trim().replace(/(^['"]|['"]$)/g, '')
  }
})

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getFirestore(app)

async function testHeartbeatAndSession() {
  console.log('1. Signing in as emp_001...')
  const cred = await signInWithEmailAndPassword(auth, 'emp_001@worktrack.internal', 'Jayesh@123')
  const user = cred.user
  console.log('Signed in! UID:', user.uid)

  const machineDeviceId = 'dev_00209f57-926a-43e2-940e-08be331d0155'
  const devDocRef = doc(db, 'devices', machineDeviceId)

  console.log('\n2. Testing getDoc on device...')
  const snap = await getDoc(devDocRef)
  console.log('getDoc success! Device exists:', snap.exists(), 'approvalStatus:', snap.data()?.approvalStatus)

  console.log('\n3. Testing heartbeat updateDoc...')
  try {
    await updateDoc(devDocRef, {
      lastHeartbeat: serverTimestamp(),
      lastSeen: serverTimestamp(),
      status: 'online',
    })
    console.log('Heartbeat updateDoc SUCCESS!')
  } catch (err: any) {
    console.error('Heartbeat updateDoc FAILED:', err.code, err.message)
  }

  console.log('\n4. Testing work session write with pending_approval device...')
  const testSessionId = `sess_test_${Date.now()}`
  const sessionRef = doc(db, 'work_sessions', testSessionId)
  try {
    await setDoc(sessionRef, {
      id: testSessionId,
      sessionId: testSessionId,
      userId: user.uid,
      employeeId: 'emp_001',
      deviceId: machineDeviceId,
      status: 'working',
      startedAt: new Date().toISOString(),
      durationSeconds: 10,
      workDurationSeconds: 10,
      breakDurationSeconds: 0,
      breaks: [],
    })
    console.log('Session write SUCCESS!')
  } catch (err: any) {
    console.error('Session write FAILED (as expected if pending):', err.code, err.message)
  }
}

testHeartbeatAndSession().catch(console.error)
