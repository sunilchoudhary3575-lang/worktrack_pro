import { useState, useEffect } from 'react'
import RegistrationScreen from './screens/RegistrationScreen'
import OnboardingScreen from './screens/OnboardingScreen'
import WorkScreen from './screens/WorkScreen'
import { deviceService } from './services/deviceService'
import { sessionService } from './services/sessionService'
import { scheduleService } from './services/scheduleService'

export type AppScreen = 'registration' | 'onboarding' | 'work'

export interface DeviceIdentity {
  employeeId: string
  employeeName: string
  deviceId: string
  deviceName: string
  department?: string
}

export default function App() {
  const [screen, setScreen] = useState<AppScreen>('registration')
  const [identity, setIdentity] = useState<DeviceIdentity | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function restoreIdentity() {
      try {
        const [reg, activeSession] = await Promise.all([
          deviceService.getRegistrationRecord(),
          sessionService.getActiveSession(),
        ])

        if (reg && (reg.status === 'approved' || activeSession)) {
          const idObj: DeviceIdentity = {
            deviceId: reg.deviceId,
            deviceName: reg.deviceName,
            employeeId: reg.employeeId,
            employeeName: reg.employeeName,
            department: reg.department,
          }
          setIdentity(idObj)

          const onboarding = await scheduleService.getOnboardingRecord(reg.deviceId)
          if (!onboarding || !onboarding.agreedToTerms) {
            setScreen('onboarding')
          } else {
            setScreen('work')
          }
        }
      } catch (err) {
        console.warn('[App] Failed to auto-restore session/registration identity:', err)
      } finally {
        setLoading(false)
      }
    }

    restoreIdentity()
  }, [])

  const handleRegistered = async (id: DeviceIdentity) => {
    setIdentity(id)
    const onboarding = await scheduleService.getOnboardingRecord(id.deviceId)
    if (!onboarding || !onboarding.agreedToTerms) {
      setScreen('onboarding')
    } else {
      setScreen('work')
    }
  }

  const handleOnboardingCompleted = () => {
    setScreen('work')
  }

  const handleLogout = () => {
    setIdentity(null)
    setScreen('registration')
  }

  if (loading) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-surface-950 text-white select-none">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
          <p className="text-xs text-white/50 font-mono">Initializing WorkTrack Pro...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full w-full overflow-hidden">
      {screen === 'registration' && (
        <RegistrationScreen onRegistered={handleRegistered} />
      )}
      {screen === 'onboarding' && identity && (
        <OnboardingScreen identity={identity} onCompleted={handleOnboardingCompleted} />
      )}
      {screen === 'work' && identity && (
        <WorkScreen identity={identity} onLogout={handleLogout} />
      )}
    </div>
  )
}

