import {
  doc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { getFirebaseInstance } from './firebaseAuth'
import { HEARTBEAT_INTERVAL_MS } from '@worktrack-pro/shared'

export interface HeartbeatConfig {
  authUid: string
  employeeId: string
  deviceId?: string
}

class PresenceService {
  private timer: any = null
  private currentConfig: HeartbeatConfig | null = null
  private isSending = false

  /**
   * Starts sending heartbeats every 60 seconds.
   * If a heartbeat is already running, it clears the existing timer first to avoid duplicates.
   */
  startHeartbeat(config: HeartbeatConfig): void {
    if (!config.authUid) {
      console.warn('[PresenceService] Cannot start heartbeat: missing authUid.')
      return
    }

    // If already running with the exact same config and timer active, do not recreate
    if (
      this.timer &&
      this.currentConfig &&
      this.currentConfig.authUid === config.authUid &&
      this.currentConfig.deviceId === config.deviceId
    ) {
      return
    }

    this.stopHeartbeat()
    this.currentConfig = config

    // Send initial heartbeat immediately
    this.sendHeartbeat().catch(err => {
      console.warn('[PresenceService] Initial heartbeat failed:', err)
    })

    // Schedule recurring heartbeat
    this.timer = setInterval(() => {
      this.sendHeartbeat().catch(err => {
        console.warn('[PresenceService] Periodic heartbeat failed:', err)
      })
    }, HEARTBEAT_INTERVAL_MS)
  }

  /**
   * Stops the active heartbeat timer on logout or unmount.
   */
  stopHeartbeat(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.currentConfig = null
  }

  /**
   * Explicitly marks a device as offline on logout, without touching lastHeartbeat.
   */
  async markOffline(): Promise<void> {
    const config = this.currentConfig
    this.stopHeartbeat()

    if (!config || !config.deviceId) return

    try {
      const { db, auth } = getFirebaseInstance()
      if (!db || !auth || !auth.currentUser) return

      const deviceRef = doc(db, 'devices', config.deviceId)
      await updateDoc(deviceRef, {
        status: 'offline',
      })
    } catch (err) {
      console.warn('[PresenceService] Could not set device offline on logout:', err)
    }
  }

  /**
   * Sends a server-timestamped heartbeat for user and device.
   */
  async sendHeartbeat(): Promise<void> {
    if (this.isSending || !this.currentConfig) return
    this.isSending = true

    try {
      const { db, auth } = getFirebaseInstance()
      if (!db || !auth) {
        return
      }

      const currentUser = auth.currentUser
      if (!currentUser || currentUser.uid !== this.currentConfig.authUid) {
        // User logged out or changed
        this.stopHeartbeat()
        return
      }

      const now = serverTimestamp()

      // 1. Update user profile lastActiveAt (strictly in rules allowlist)
      const userRef = doc(db, 'users', this.currentConfig.authUid)
      await updateDoc(userRef, {
        lastActiveAt: now,
        updatedAt: now,
      }).catch(err => {
        // User doc may not exist in mock mode or permission denied if disabled
        console.warn('[PresenceService] Could not update user lastActiveAt:', err?.message)
      })

      // 2. Update device heartbeat if deviceId is provided
      if (this.currentConfig.deviceId) {
        const deviceRef = doc(db, 'devices', this.currentConfig.deviceId)
        await updateDoc(deviceRef, {
          lastHeartbeat: now,
          lastSeen: now,
          status: 'online',
        }).catch(err => {
          // Device may not be registered yet or permission denied if unapproved
          console.warn('[PresenceService] Could not update device heartbeat:', err?.message)
        })
      }
    } finally {
      this.isSending = false
    }
  }

  isHeartbeatActive(): boolean {
    return this.timer !== null
  }
}

export const presenceService = new PresenceService()
