import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import { getFirestore, collection, getDocs } from 'firebase/firestore'
import { derivePresenceStatus, deriveEmployeePresence } from '@worktrack-pro/shared'
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

function toDate(val: any): Date {
  if (!val) return new Date(0)
  if (val.toDate && typeof val.toDate === 'function') return val.toDate()
  if (val instanceof Date) return val
  return new Date(val)
}

async function verifyDashboard() {
  console.log('Admin signing in...')
  await signInWithEmailAndPassword(auth, 'contact@bawraskillhouse.com', 'Bawra@123')

  console.log('Fetching devices...')
  const devSnap = await getDocs(collection(db, 'devices'))
  const devices = devSnap.docs.map(d => {
    const data = d.data()
    const lastHb = data.lastHeartbeat ? toDate(data.lastHeartbeat) : (data.lastSeen ? toDate(data.lastSeen) : undefined)
    const isOnline = data.approvalStatus === 'approved' && data.status !== 'offline' && derivePresenceStatus(lastHb) === 'online'
    return {
      id: d.id,
      employeeId: data.employeeId || '',
      name: data.deviceName || data.hostname,
      status: isOnline ? 'online' : 'offline',
      approvalStatus: data.approvalStatus || 'pending_approval',
      lastHeartbeat: lastHb,
      lastSeen: toDate(data.lastSeen || data.lastHeartbeat),
    }
  })

  console.log('Devices:', devices)

  console.log('Fetching active sessions...')
  const sessSnap = await getDocs(collection(db, 'work_sessions'))
  const sessions = sessSnap.docs.map(d => d.data())
  const activeSessions = sessions.filter((s: any) => {
    if (s.status !== 'working' && s.status !== 'active' && s.status !== 'on_break' && s.status !== 'paused') {
      return false
    }
    if (s.endedAt) return false
    const empDevices = devices.filter(d => d.employeeId === s.employeeId)
    return deriveEmployeePresence(empDevices as any) === 'online'
  })

  console.log('Active Sessions Count:', activeSessions.length)
  console.log('Active Sessions:', activeSessions.map((s: any) => ({ id: s.id, employeeId: s.employeeId, status: s.status })))

  const now = new Date()
  const onlineDevicesCount = devices.filter(d => {
    if (d.approvalStatus !== 'approved') return false
    return derivePresenceStatus(d.lastHeartbeat || d.lastSeen, now) === 'online'
  }).length

  console.log('Online Devices Count:', onlineDevicesCount)
}

verifyDashboard().catch(console.error)
