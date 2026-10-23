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

async function approveAndTestSession() {
  console.log('1. Signing in as Admin...')
  const adminCred = await signInWithEmailAndPassword(auth, 'contact@bawraskillhouse.com', 'Bawra@123')
  console.log('Admin signed in! UID:', adminCred.user.uid)

  const machineDeviceId = 'dev_00209f57-926a-43e2-940e-08be331d0155'
  const devDocRef = doc(db, 'devices', machineDeviceId)

  console.log('2. Admin approving device in Firestore...')
  await updateDoc(devDocRef, {
    approvalStatus: 'approved',
    status: 'online',
    lastHeartbeat: serverTimestamp(),
    lastSeen: serverTimestamp(),
    reviewedAt: new Date().toISOString(),
    reviewedBy: 'Admin User',
  })
  console.log('Device approved successfully in Firestore!')

  console.log('\n3. Signing in as Employee emp_001...')
  const empCred = await signInWithEmailAndPassword(auth, 'emp_001@worktrack.internal', 'Jayesh@123')
  console.log('Employee signed in! UID:', empCred.user.uid)

  console.log('\n4. Employee writing active work session to Firestore...')
  const testSessionId = `sess_live_verified_${Date.now()}`
  const sessionRef = doc(db, 'work_sessions', testSessionId)
  await setDoc(sessionRef, {
    id: testSessionId,
    sessionId: testSessionId,
    userId: empCred.user.uid,
    employeeId: 'emp_001',
    deviceId: machineDeviceId,
    status: 'working',
    startedAt: new Date().toISOString(),
    durationSeconds: 15,
    workDurationSeconds: 15,
    breakDurationSeconds: 0,
    breaks: [],
  })
  console.log('Session write SUCCESS!! Session ID:', testSessionId)
}

approveAndTestSession().catch(console.error)
