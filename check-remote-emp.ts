import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import { getFirestore, doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore'
import fs from 'node:fs'

const envContent = fs.readFileSync('.env', 'utf8')
const env: Record<string, string> = {}
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/)
  if (match) env[match[1]] = (match[2] || '').trim().replace(/(^['"]|['"]$)/g, '')
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

function toIso(val: any): string {
  if (!val) return 'null'
  if (val.toDate) return val.toDate().toISOString()
  if (val instanceof Date) return val.toISOString()
  return String(val)
}

async function run() {
  await signInWithEmailAndPassword(auth, 'contact@bawraskillhouse.com', 'Bawra@123')
  console.log('=== 1. DEVICES FOR EMP_002 ===')
  const devSnap = await getDocs(query(collection(db, 'devices'), where('employeeId', '==', 'emp_002')))
  devSnap.forEach(d => {
    const data = d.data()
    console.log(d.id, '=>', {
      name: data.deviceName || data.name || data.hostname,
      hostname: data.hostname,
      status: data.status,
      approvalStatus: data.approvalStatus,
      userId: data.userId,
      lastHeartbeat: toIso(data.lastHeartbeat),
      lastSeen: toIso(data.lastSeen),
    })
  })

  console.log('\n=== 2. WORK SESSIONS FOR EMP_002 ===')
  const sessSnap = await getDocs(query(collection(db, 'work_sessions'), where('employeeId', '==', 'emp_002')))
  sessSnap.forEach(d => {
    const data = d.data()
    console.log(d.id, '=>', {
      status: data.status,
      deviceId: data.deviceId,
      userId: data.userId,
      startedAt: toIso(data.startedAt),
      endedAt: toIso(data.endedAt),
      pausedAt: toIso(data.pausedAt),
      notes: data.notes,
    })
  })

  console.log('\n=== 3. SCREENSHOTS FOR EMP_002 (Today) ===')
  const scrSnap = await getDocs(query(collection(db, 'screenshots'), where('employeeId', '==', 'emp_002')))
  const scrs: any[] = []
  scrSnap.forEach(d => {
    const data = d.data()
    scrs.push({
      id: d.id,
      sessionId: data.sessionId,
      deviceId: data.deviceId,
      userId: data.userId,
      takenAt: toIso(data.takenAt),
      createdAt: toIso(data.createdAt),
      storagePath: data.storagePath,
      hasImageUrl: !!data.imageUrl,
    })
  })
  scrs.sort((a, b) => new Date(b.takenAt).getTime() - new Date(a.takenAt).getTime())
  console.log('Total screenshots for emp_002:', scrs.length)
  console.log('Latest 5:', scrs.slice(0, 5))
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); })
