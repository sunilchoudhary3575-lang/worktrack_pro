import { useState } from 'react'
import RegistrationScreen from './screens/RegistrationScreen'
import WorkScreen from './screens/WorkScreen'
import type { Device } from '@worktrack-pro/shared'

export type AppScreen = 'registration' | 'work'

export interface DeviceIdentity {
  employeeId: string
  employeeName: string
  deviceId: string
  deviceName: string
}

export default function App() {
  const [screen, setScreen] = useState<AppScreen>('registration')
  const [identity, setIdentity] = useState<DeviceIdentity | null>(null)

  const handleRegistered = (id: DeviceIdentity) => {
    setIdentity(id)
    setScreen('work')
  }

  return (
    <div className="h-full w-full overflow-hidden">
      {screen === 'registration' && (
        <RegistrationScreen onRegistered={handleRegistered} />
      )}
      {screen === 'work' && identity && (
        <WorkScreen identity={identity} onLogout={() => { setIdentity(null); setScreen('registration') }} />
      )}
    </div>
  )
}
