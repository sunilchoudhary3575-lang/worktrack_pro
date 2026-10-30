import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import { getFirestore, collection, getDocs } from 'firebase/firestore'
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

async function run() {
  await signInWithEmailAndPassword(auth, 'contact@bawraskillhouse.com', 'Bawra@123')
  const snap = await getDocs(collection(db, 'devices'))
  console.log('Total devices in Firestore:', snap.size)
  snap.forEach(d => {
    const data = d.data()
    console.log(d.id, '=>', {
      name: data.deviceName || data.name,
      hostname: data.hostname,
      empId: data.employeeId,
      empName: data.employeeName,
      status: data.status,
      appr: data.approvalStatus,
      userId: data.userId,
      lastHeartbeat: data.lastHeartbeat?.toDate ? data.lastHeartbeat.toDate().toISOString() : data.lastHeartbeat
    })
  })
}
run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); })
