import fs from 'node:fs'
import path from 'node:path'

// Read .env
const envPath = path.resolve('.env')
const envContent = fs.readFileSync(envPath, 'utf8')
const env: Record<string, string> = {}
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/)
  if (match) {
    env[match[1]] = (match[2] || '').trim().replace(/(^['"]|['"]$)/g, '')
  }
})

const apiKey = env.VITE_FIREBASE_API_KEY
const projectId = env.VITE_FIREBASE_PROJECT_ID

async function getAccessToken(refreshToken: string) {
  const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
  })
  const data = await res.json()
  return data.access_token || data.id_token
}

async function queryFirestore(token: string, docPath: string) {
  const res = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${docPath}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  if (!res.ok) {
    return { status: res.status, statusText: res.statusText, data: await res.text() }
  }
  return { status: res.status, data: await res.json() }
}

async function listFirestore(token: string, colPath: string) {
  const res = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${colPath}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  if (!res.ok) {
    return { status: res.status, statusText: res.statusText, data: await res.text() }
  }
  return { status: res.status, data: await res.json() }
}

async function main() {
  // Read admin refresh token from Admin local storage log
  const adminLog = fs.readFileSync("C:\\Users\\Owner\\AppData\\Roaming\\WorkTrack Pro Admin\\Local Storage\\leveldb\\000004.log", 'utf8')
  const adminMatch = adminLog.match(/"refreshToken":"([^"]+)"/)
  if (!adminMatch) {
    console.error('Admin refresh token not found')
    return
  }
  const adminRefreshToken = adminMatch[1]
  console.log('Exchanging Admin refresh token for ID token...')
  const adminIdToken = await getAccessToken(adminRefreshToken)
  if (!adminIdToken) {
    console.error('Could not get admin ID token')
    return
  }
  console.log('Successfully acquired Admin ID token!')

  console.log('\n--- 1. Admin Reading /users/PLs5kUztzuNmshQyS4cWtz7Pgn83 ---')
  const adminUserDoc = await queryFirestore(adminIdToken, 'users/PLs5kUztzuNmshQyS4cWtz7Pgn83')
  console.log(JSON.stringify(adminUserDoc, null, 2))

  console.log('\n--- 2. Admin Reading /employees/emp_001 ---')
  const empDoc = await queryFirestore(adminIdToken, 'employees/emp_001')
  console.log(JSON.stringify(empDoc, null, 2))

  console.log('\n--- 3. Admin Listing All /employees ---')
  const allEmployees = await listFirestore(adminIdToken, 'employees')
  console.log(JSON.stringify(allEmployees, null, 2))

  console.log('\n--- 4. Admin Reading /users/fZVcGZFhvTOli3H3YKH4adO56UM2 (emp_001 user doc) ---')
  const empUserDoc = await queryFirestore(adminIdToken, 'users/fZVcGZFhvTOli3H3YKH4adO56UM2')
  console.log(JSON.stringify(empUserDoc, null, 2))

  console.log('\n--- 5. Admin Listing All /devices ---')
  const allDevices = await listFirestore(adminIdToken, 'devices')
  console.log(JSON.stringify(allDevices, null, 2))

  console.log('\n--- 6. Admin Listing All /work_sessions ---')
  const allSessions = await listFirestore(adminIdToken, 'work_sessions')
  console.log(JSON.stringify(allSessions, null, 2))
}

main().catch(console.error)
