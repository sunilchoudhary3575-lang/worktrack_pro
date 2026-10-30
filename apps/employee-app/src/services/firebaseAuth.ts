import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app'
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User as FirebaseUser,
  Auth,
  browserLocalPersistence,
  setPersistence,
} from 'firebase/auth'
import {
  getFirestore,
  doc,
  getDoc,
  Firestore,
} from 'firebase/firestore'
import { getStorage, FirebaseStorage } from 'firebase/storage'
import {
  UserAccount,
  formatAuthError,
  formatEmployeeAuthEmail,
  validateEmployeeId,
} from '@worktrack-pro/shared'

let firebaseApp: FirebaseApp | null = null
let firebaseAuth: Auth | null = null
let firestoreDb: Firestore | null = null
let firebaseStorage: FirebaseStorage | null = null

export function getFirebaseConfig() {
  const apiKey =
    (import.meta.env && import.meta.env.VITE_FIREBASE_API_KEY) ||
    'AIzaSyBnWERhx5gUrvMfOdiWs4_UFjsoD1lQjOs'
  const authDomain =
    (import.meta.env && import.meta.env.VITE_FIREBASE_AUTH_DOMAIN) ||
    'worktrack-pro-8aa42.firebaseapp.com'
  const projectId =
    (import.meta.env && import.meta.env.VITE_FIREBASE_PROJECT_ID) ||
    'worktrack-pro-8aa42'
  const storageBucket =
    (import.meta.env && import.meta.env.VITE_FIREBASE_STORAGE_BUCKET) ||
    'worktrack-pro-8aa42.firebasestorage.app'
  const messagingSenderId =
    (import.meta.env && import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID) ||
    '78060939079'
  const appId =
    (import.meta.env && import.meta.env.VITE_FIREBASE_APP_ID) ||
    '1:78060939079:web:ec778f4b051854e77a8e62'

  return {
    apiKey: String(apiKey).trim(),
    authDomain: String(authDomain).trim(),
    projectId: String(projectId).trim(),
    storageBucket: String(storageBucket).trim(),
    messagingSenderId: String(messagingSenderId).trim(),
    appId: String(appId).trim(),
  }
}

export function isFirebaseConfigured(): boolean {
  const config = getFirebaseConfig()
  return (
    !!config.apiKey &&
    !config.apiKey.toLowerCase().includes('placeholder') &&
    !!config.projectId &&
    !config.projectId.toLowerCase().includes('placeholder')
  )
}

let testFirebaseOverride: any = null
export function setTestFirebaseInstances(instances: any) {
  testFirebaseOverride = instances
}

export function getFirebaseInstance(): {
  app: FirebaseApp | null
  auth: Auth | null
  db: Firestore | null
  storage: FirebaseStorage | null
} {
  if (testFirebaseOverride) {
    return testFirebaseOverride
  }
  if (!isFirebaseConfigured()) {
    return { app: null, auth: null, db: null, storage: null }
  }

  if (!firebaseApp) {
    try {
      firebaseApp = getApps().length > 0 ? getApp() : initializeApp(getFirebaseConfig())
      firebaseAuth = getAuth(firebaseApp)
      firestoreDb = getFirestore(firebaseApp)
      firebaseStorage = getStorage(firebaseApp)

      // Ensure persistent login across app restarts in Electron renderer
      if (typeof window !== 'undefined') {
        setPersistence(firebaseAuth, browserLocalPersistence).catch(err => {
          console.warn('[FirebaseAuth] Could not set browserLocalPersistence:', err)
        })
      }
    } catch (err) {
      console.error('[FirebaseAuth] Initialization error:', err)
      return { app: null, auth: null, db: null, storage: null }
    }
  }

  return { app: firebaseApp, auth: firebaseAuth, db: firestoreDb, storage: firebaseStorage }
}

export async function fetchUserProfile(uid: string): Promise<UserAccount | null> {
  const { db } = getFirebaseInstance()
  if (!db) return null

  try {
    const userRef = doc(db, 'users', uid)
    const snap = await getDoc(userRef)
    if (snap.exists()) {
      const data = snap.data()
      return {
        uid,
        email: data.email || '',
        contactEmail: data.contactEmail,
        displayName: data.displayName || 'Employee',
        role: data.role || 'employee',
        employeeId: data.employeeId,
        status: data.status || 'active',
        createdAt: data.createdAt || new Date().toISOString(),
        lastLoginAt: data.lastLoginAt,
      }
    }
  } catch (err) {
    console.error('[FirebaseAuth] Error fetching user profile:', err)
  }
  return null
}

export interface AuthSignInResult {
  user: UserAccount
  isDemo: boolean
}

const DEMO_EMPLOYEE_STORAGE_KEY = 'worktrack_employee_demo_session'

export const employeeAuthService = {
  isConfigured(): boolean {
    return isFirebaseConfigured()
  },

  async signIn(employeeId: string, password: string): Promise<AuthSignInResult> {
    const { auth, db } = getFirebaseInstance()

    if (!auth) {
      throw new Error('Firebase configuration is missing. Configure .env or use Demo Mode.')
    }

    // 1. Validate employee ID format strictly and map to synthetic auth email
    const idValidation = validateEmployeeId(employeeId)
    if (!idValidation.valid || !idValidation.normalized) {
      // Generic error so an attacker cannot probe valid IDs
      throw new Error('Invalid Employee ID or password. Please verify your credentials.')
    }

    const syntheticEmail = formatEmployeeAuthEmail(idValidation.normalized)

    try {
      // 2. Authenticate through standard Firebase client SDK
      const userCredential = await signInWithEmailAndPassword(auth, syntheticEmail, password)
      const fbUser = userCredential.user

      // 3. Verify user profile exists in /users/{uid} and check role/status
      const profile = await fetchUserProfile(fbUser.uid)
      if (!profile) {
        await firebaseSignOut(auth)
        throw new Error('Employee account profile could not be found. Please contact your administrator.')
      }

      // Reject non-employee accounts (e.g. admin accounts cannot use Employee App)
      if (profile.role !== 'employee') {
        await firebaseSignOut(auth)
        throw new Error('Access Denied: Administrative accounts cannot sign in to the Employee App.')
      }

      if (profile.status !== 'active') {
        await firebaseSignOut(auth)
        throw new Error('This employee account has been deactivated. Please contact your administrator.')
      }

      // 4. Verify linked corporate employee directory document in /employees/{employeeId}
      const linkedEmployeeId = profile.employeeId || idValidation.normalized
      if (db && linkedEmployeeId) {
        try {
          const empRef = doc(db, 'employees', linkedEmployeeId)
          const empSnap = await getDoc(empRef)
          if (empSnap.exists()) {
            const empData = empSnap.data()
            if (empData.status && empData.status !== 'active') {
              await firebaseSignOut(auth)
              throw new Error('Employee directory record is deactivated. Please contact your administrator.')
            }
          }
        } catch (dirErr: any) {
          // If Firestore read fails due to permission denied (e.g. unlinked userId), sign out safely
          if (dirErr?.code === 'permission-denied') {
            await firebaseSignOut(auth)
            throw new Error('Employee profile is not properly linked to your credentials. Contact your administrator.')
          }
          console.warn('[EmployeeAuth] Non-fatal directory verification warning:', dirErr)
        }
      }

      const employeeUser: UserAccount = {
        uid: fbUser.uid,
        email: profile.email || fbUser.email || syntheticEmail,
        contactEmail: profile.contactEmail,
        displayName: profile.displayName || fbUser.displayName || 'Employee',
        role: 'employee',
        employeeId: linkedEmployeeId,
        status: 'active',
        createdAt: profile.createdAt || new Date().toISOString(),
      }

      localStorage.removeItem(DEMO_EMPLOYEE_STORAGE_KEY)
      return { user: employeeUser, isDemo: false }
    } catch (err: any) {
      console.error('[EmployeeAuth] Sign-in error details:', { code: err.code, message: err.message })
      // Generic errors for authentication credential mismatch to prevent user enumeration
      if (
        err.code === 'auth/invalid-credential' ||
        err.code === 'auth/invalid-login-credentials' ||
        err.code === 'auth/user-not-found' ||
        err.code === 'auth/wrong-password' ||
        err.code === 'auth/invalid-email'
      ) {
        throw new Error('Invalid Employee ID or password. Please verify your credentials.')
      }

      if (err.code) {
        throw new Error(formatAuthError(err.code))
      }
      throw err
    }
  },

  signInDemo(): AuthSignInResult {
    const demoEmployee: UserAccount = {
      uid: 'demo_emp_root',
      email: 'employee@worktrackpro.internal',
      displayName: 'Alex Rivera (Demo)',
      role: 'employee',
      employeeId: 'emp_001',
      status: 'active',
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    }
    localStorage.setItem(DEMO_EMPLOYEE_STORAGE_KEY, JSON.stringify(demoEmployee))
    return { user: demoEmployee, isDemo: true }
  },

  getStoredDemoUser(): UserAccount | null {
    try {
      const raw = localStorage.getItem(DEMO_EMPLOYEE_STORAGE_KEY)
      if (raw) return JSON.parse(raw)
    } catch (e) {
      localStorage.removeItem(DEMO_EMPLOYEE_STORAGE_KEY)
    }
    return null
  },

  getAuthUid(): string | null {
    const { auth } = getFirebaseInstance()
    if (auth?.currentUser) {
      return auth.currentUser.uid
    }
    const demo = this.getStoredDemoUser()
    return demo?.uid || null
  },

  async signOut(): Promise<void> {
    localStorage.removeItem(DEMO_EMPLOYEE_STORAGE_KEY)
    const { auth } = getFirebaseInstance()
    if (auth) {
      await firebaseSignOut(auth)
    }
  },

  onAuthStateChanged(callback: (user: UserAccount | null, isDemo: boolean) => void): () => void {
    const { auth } = getFirebaseInstance()

    // If Firebase Auth is not active, check demo session
    if (!auth) {
      const demoUser = this.getStoredDemoUser()
      callback(demoUser, !!demoUser)
      return () => {}
    }

    return onAuthStateChanged(auth, async (fbUser: FirebaseUser | null) => {
      if (!fbUser) {
        const demoUser = this.getStoredDemoUser()
        callback(demoUser, !!demoUser)
        return
      }

      try {
        const profile = await fetchUserProfile(fbUser.uid)
        callback(
          {
            uid: fbUser.uid,
            email: fbUser.email || '',
            displayName: fbUser.displayName || profile?.displayName || 'Employee',
            role: profile?.role || 'employee',
            employeeId: profile?.employeeId,
            status: profile?.status || 'active',
            createdAt: profile?.createdAt || new Date().toISOString(),
          },
          false
        )
      } catch (err) {
        console.error('[FirebaseAuth] State reconciliation error:', err)
        callback(null, false)
      }
    })
  },
}
