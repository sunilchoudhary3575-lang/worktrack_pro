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
import { getFunctions, Functions } from 'firebase/functions'
import { getStorage, FirebaseStorage } from 'firebase/storage'
import { UserAccount, formatAuthError } from '@worktrack-pro/shared'

let firebaseApp: FirebaseApp | null = null
let firebaseAuth: Auth | null = null
let firestoreDb: Firestore | null = null
let firebaseFunctions: Functions | null = null
let firebaseStorage: FirebaseStorage | null = null

export function getFirebaseConfig() {
  const apiKey =
    (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env.VITE_FIREBASE_API_KEY) ||
    (typeof process !== 'undefined' && process.env && process.env.VITE_FIREBASE_API_KEY) ||
    ''
  const authDomain =
    (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env.VITE_FIREBASE_AUTH_DOMAIN) ||
    (typeof process !== 'undefined' && process.env && process.env.VITE_FIREBASE_AUTH_DOMAIN) ||
    ''
  const projectId =
    (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env.VITE_FIREBASE_PROJECT_ID) ||
    (typeof process !== 'undefined' && process.env && process.env.VITE_FIREBASE_PROJECT_ID) ||
    ''
  const storageBucket =
    (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env.VITE_FIREBASE_STORAGE_BUCKET) ||
    (typeof process !== 'undefined' && process.env && process.env.VITE_FIREBASE_STORAGE_BUCKET) ||
    ''
  const messagingSenderId =
    (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env.VITE_FIREBASE_MESSAGING_SENDER_ID) ||
    (typeof process !== 'undefined' && process.env && process.env.VITE_FIREBASE_MESSAGING_SENDER_ID) ||
    ''
  const appId =
    (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env.VITE_FIREBASE_APP_ID) ||
    (typeof process !== 'undefined' && process.env && process.env.VITE_FIREBASE_APP_ID) ||
    ''

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

export function getFirebaseInstance(): {
  app: FirebaseApp | null
  auth: Auth | null
  db: Firestore | null
  functions: Functions | null
  storage: FirebaseStorage | null
} {
  if (!isFirebaseConfigured()) {
    return { app: null, auth: null, db: null, functions: null, storage: null }
  }

  if (!firebaseApp) {
    try {
      firebaseApp = getApps().length > 0 ? getApp() : initializeApp(getFirebaseConfig())
      firebaseAuth = getAuth(firebaseApp)
      firestoreDb = getFirestore(firebaseApp)
      firebaseFunctions = getFunctions(firebaseApp, 'us-central1')
      firebaseStorage = getStorage(firebaseApp)

      // Ensure persistent login across app restarts in Electron renderer
      if (typeof window !== 'undefined') {
        setPersistence(firebaseAuth, browserLocalPersistence).catch(err => {
          console.warn('[FirebaseAuth] Could not set browserLocalPersistence:', err)
        })
      }
    } catch (err) {
      console.error('[FirebaseAuth] Initialization error:', err)
      return { app: null, auth: null, db: null, functions: null, storage: null }
    }
  }

  return { app: firebaseApp, auth: firebaseAuth, db: firestoreDb, functions: firebaseFunctions, storage: firebaseStorage }
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
        displayName: data.displayName || 'Administrator',
        role: data.role || 'employee',
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

const DEMO_ADMIN_STORAGE_KEY = 'worktrack_admin_demo_session'

export const adminAuthService = {
  isConfigured(): boolean {
    return isFirebaseConfigured()
  },

  async signIn(email: string, password: string): Promise<AuthSignInResult> {
    const { auth } = getFirebaseInstance()

    if (!auth) {
      throw new Error('Firebase configuration is missing. Configure .env or use Demo Mode.')
    }

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password)
      const fbUser = userCredential.user

      // Check custom token claim or Firestore role
      const tokenResult = await fbUser.getIdTokenResult(true)
      let role = tokenResult.claims.role as string | undefined

      let profile: UserAccount | null = null
      if (!role) {
        profile = await fetchUserProfile(fbUser.uid)
        role = profile?.role
      }

      // Strictly enforce Admin role in the Admin desktop app
      if (role !== 'admin') {
        await firebaseSignOut(auth)
        const err = new Error(formatAuthError('auth/unauthorized-role'))
        ;(err as any).code = 'auth/unauthorized-role'
        throw err
      }

      const adminUser: UserAccount = {
        uid: fbUser.uid,
        email: fbUser.email || email,
        displayName: fbUser.displayName || profile?.displayName || 'Administrator',
        role: 'admin',
        status: 'active',
        createdAt: profile?.createdAt || new Date().toISOString(),
      }

      localStorage.removeItem(DEMO_ADMIN_STORAGE_KEY)
      return { user: adminUser, isDemo: false }
    } catch (err: any) {
      console.error('[AdminAuth] Sign-in error details:', { code: err.code, message: err.message, raw: err })
      if (err.code) {
        throw new Error(formatAuthError(err.code))
      }
      throw err
    }
  },

  signInDemo(): AuthSignInResult {
    const demoAdmin: UserAccount = {
      uid: 'demo_admin_root',
      email: 'admin@worktrackpro.internal',
      displayName: 'System Admin (Offline Demo)',
      role: 'admin',
      status: 'active',
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    }
    localStorage.setItem(DEMO_ADMIN_STORAGE_KEY, JSON.stringify(demoAdmin))
    return { user: demoAdmin, isDemo: true }
  },

  getStoredDemoUser(): UserAccount | null {
    try {
      const raw = localStorage.getItem(DEMO_ADMIN_STORAGE_KEY)
      if (raw) return JSON.parse(raw)
    } catch (e) {
      localStorage.removeItem(DEMO_ADMIN_STORAGE_KEY)
    }
    return null
  },

  async signOut(): Promise<void> {
    localStorage.removeItem(DEMO_ADMIN_STORAGE_KEY)
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
        const tokenResult = await fbUser.getIdTokenResult()
        let role = tokenResult.claims.role as string | undefined
        let profile: UserAccount | null = null

        if (!role) {
          profile = await fetchUserProfile(fbUser.uid)
          role = profile?.role
        }

        if (role === 'admin') {
          callback(
            {
              uid: fbUser.uid,
              email: fbUser.email || '',
              displayName: fbUser.displayName || profile?.displayName || 'Administrator',
              role: 'admin',
              status: 'active',
              createdAt: profile?.createdAt || new Date().toISOString(),
            },
            false
          )
        } else {
          // If non-admin user is found signed in, sign out immediately
          await firebaseSignOut(auth)
          callback(null, false)
        }
      } catch (err) {
        console.error('[FirebaseAuth] State reconciliation error:', err)
        callback(null, false)
      }
    })
  },
}
