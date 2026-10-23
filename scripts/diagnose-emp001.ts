import { initializeApp } from 'firebase/app'
import { getFirestore, doc, getDoc, collection, getDocs } from 'firebase/firestore'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import fs from 'node:fs'
import path from 'node:path'

// Read .env manually
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

console.log('Firebase config project ID:', firebaseConfig.projectId)

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)
const auth = getAuth(app)

async function run() {
  console.log('Checking read on Firestore...')
  try {
    const snap = await getDoc(doc(db, 'employees', 'emp_001'))
    console.log('Read success! Exists:', snap.exists())
    if (snap.exists()) {
      console.log('Data:', snap.data())
    }
  } catch (err: any) {
    console.log('Read failed:', err.code, err.message)
  }
}

run().then(() => process.exit(0)).catch(err => {
  console.error(err)
  process.exit(1)
})
