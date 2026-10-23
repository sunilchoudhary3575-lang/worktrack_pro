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
  const adminLog = fs.readFileSync("C:\\Users\\Owner\\AppData\\Roaming\\WorkTrack Pro Admin\\Local Storage\\leveldb\\000004.log", 'utf8')
  const adminMatch = adminLog.match(/"refreshToken":"([^"]+)"/)
  if (!adminMatch) {
    console.error('Admin refresh token not found')
    return
  }
  const token = await getAccessToken(adminMatch[1])
  const res = await listFirestore(token, 'screenshots')
  console.log('Screenshots response status:', res.status)
  if (res.data?.documents) {
    for (const doc of res.data.documents) {
      console.log('\n--- Screenshot:', doc.name)
      const fields = doc.fields
      console.log('ID:', fields.id?.stringValue)
      console.log('Employee:', fields.employeeName?.stringValue, fields.employeeId?.stringValue)
      console.log('storagePath:', fields.storagePath?.stringValue)
      const imgUrl = fields.imageUrl?.stringValue
      const downUrl = fields.downloadUrl?.stringValue
      console.log('imageUrl:', imgUrl)
      console.log('downloadUrl:', downUrl)

      // Test fetch on imgUrl
      if (imgUrl) {
        try {
          const fetchRes = await fetch(imgUrl)
          console.log('Fetch imgUrl status:', fetchRes.status, fetchRes.statusText)
          console.log('Fetch Content-Type:', fetchRes.headers.get('content-type'))
          console.log('Fetch Content-Length:', fetchRes.headers.get('content-length'))
          console.log('Fetch CORS header:', fetchRes.headers.get('access-control-allow-origin'))
        } catch (e: any) {
          console.log('Fetch imgUrl error:', e.message)
        }
      }
    }
  } else {
    console.log('No documents:', res.data)
  }
}

main().catch(console.error)
