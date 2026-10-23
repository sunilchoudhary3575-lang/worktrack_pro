import { useState, useEffect } from 'react'
import EmployeeSignInScreen from './screens/EmployeeSignInScreen'
import CleanWorkScreen from './screens/CleanWorkScreen'
import { deviceService } from './services/deviceService'
import { employeeAuthService } from './services/firebaseAuth'
import { presenceService } from './services/presenceService'
import { permissionService } from './services/permissionService'
import { UserAccount } from '@worktrack-pro/shared'
import { Loader2 } from 'lucide-react'

export interface DeviceIdentity {
  employeeId: string
  employeeName: string
  deviceId: string
  deviceName: string
  department?: string
}

export default function App() {
  const [authUser, setAuthUser] = useState<UserAccount | null>(null)
  const [identity, setIdentity] = useState<DeviceIdentity | null>(null)
  const [isDemo, setIsDemo] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Listen to Firebase / Demo auth state
    const unsubscribe = employeeAuthService.onAuthStateChanged(async (user, demo) => {
      setAuthUser(user)
      setIsDemo(demo)

      if (user) {
        try {
          const info = await deviceService.getDeviceInfo()
          // Ensure device is registered and synced with Firestore
          const reg = await deviceService.ensureRegistered({
            employeeId: user.employeeId || 'emp_001',
            employeeName: user.displayName || 'Employee',
            department: 'General',
          })

          const idObj: DeviceIdentity = {
            deviceId: info.deviceId,
            deviceName: info.hostname || 'Employee PC',
            employeeId: user.employeeId || reg?.employeeId || 'emp_001',
            employeeName: user.displayName || reg?.employeeName || 'Employee',
            department: 'Engineering',
          }
          setIdentity(idObj)

          // Ensure pre-authorization monitoring record is granted for approved devices
          if (reg && reg.status === 'approved') {
            permissionService.grantPreAuthorization({
              employeeId: idObj.employeeId,
              employeeName: idObj.employeeName,
              deviceId: idObj.deviceId,
              deviceName: idObj.deviceName,
            }).catch(() => {})
          }

          // Start continuous presence heartbeat while connected
          if (!demo) {
            presenceService.startHeartbeat({
              authUid: user.uid,
              employeeId: idObj.employeeId,
              deviceId: idObj.deviceId,
            })
          }
        } catch (err) {
          console.warn('[App] Auto-initialization warning:', err)
        }
      } else {
        setIdentity(null)
      }

      setLoading(false)
    })

    const handleBeforeUnload = () => {
      presenceService.markOffline().catch(() => {})
      presenceService.stopHeartbeat()
    }
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      unsubscribe()
      presenceService.stopHeartbeat()
    }
  }, [])

  const handleLogout = async () => {
    setLoading(true)
    try {
      await presenceService.markOffline()
      presenceService.stopHeartbeat()
      await employeeAuthService.signOut()
      setAuthUser(null)
      setIsDemo(false)
      setIdentity(null)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#080f0e] text-white select-none">
        <Loader2 className="w-8 h-8 text-emerald-400 animate-spin mb-3" />
        <p className="text-xs text-white/50 font-mono">Starting WorkTrack Pro...</p>
      </div>
    )
  }

  // Not signed in: show clean login
  if (!authUser) {
    return (
      <EmployeeSignInScreen
        onSignedIn={(user, demo) => {
          setAuthUser(user)
          setIsDemo(demo)
        }}
      />
    )
  }

  // Signed in: show clean 1-page UI
  return (
    <CleanWorkScreen
      employeeId={identity?.employeeId || authUser.employeeId || 'emp_001'}
      employeeName={identity?.employeeName || authUser.displayName || 'Employee'}
      department={identity?.department || 'Engineering'}
      deviceId={identity?.deviceId || 'dev_001'}
      deviceName={identity?.deviceName || 'Workstation'}
      onLogout={handleLogout}
    />
  )
}
