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

async function testRegistration() {
  console.log('1. Signing in as emp_001...')
  const cred = await signInWithEmailAndPassword(auth, 'emp_001@worktrack.internal', 'Jayesh@123')
  const user = cred.user
  console.log('Signed in! UID:', user.uid)

  const machineDeviceId = 'dev_00209f57-926a-43e2-940e-08be331d0155'
  const devDocRef = doc(db, 'devices', machineDeviceId)

  console.log('\n2. Attempting to register device from Employee SDK...')
  try {
    await setDoc(devDocRef, {
      deviceId: machineDeviceId,
      name: 'DESKTOP-IE8BBRJ',
      deviceName: 'DESKTOP-IE8BBRJ',
      hostname: 'DESKTOP-IE8BBRJ',
      platform: 'win32',
      osVersion: 'Windows 11',
      employeeId: 'emp_001',
      employeeName: 'Jayesh',
      department: 'Engineering',
      userId: user.uid,
      approvalStatus: 'pending_approval',
      status: 'offline',
      registeredAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    })
    console.log('Device registration SUCCESS!')
  } catch (err: any) {
    console.error('Device registration FAILED:', err.code, err.message)
  }
}

testRegistration().catch(console.error)
