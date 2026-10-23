import fs from 'node:fs'
import path from 'node:path'

const filePath = path.join(process.env.APPDATA || '', 'WorkTrack Pro Employee', 'Local Storage', 'leveldb', '000004.log')
if (!fs.existsSync(filePath)) {
  console.log('File does not exist:', filePath)
  process.exit(1)
}

const content = fs.readFileSync(filePath, 'utf8')
const uidMatches = content.match(/"uid":"([^"]+)"/g)
console.log('UID matches in Employee app local storage:', uidMatches)

const emailMatches = content.match(/"email":"([^"]+)"/g)
console.log('Email matches:', emailMatches)

const demoMatches = content.match(/worktrack_employee_demo_session/g)
console.log('Demo matches:', demoMatches)

const deviceMatches = content.match(/worktrack_device_id/g)
console.log('Device ID key matches:', deviceMatches)
