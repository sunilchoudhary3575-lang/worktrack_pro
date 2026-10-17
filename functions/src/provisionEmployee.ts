import { onCall, HttpsError } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'
import {
  normalizeEmployeeId,
  formatEmployeeAuthEmail,
  validatePasswordStrength,
  ProvisionEmployeePayload,
  ProvisionEmployeeResult,
} from '@worktrack-pro/shared'

// Initialize Firebase Admin with platform-managed default credentials (no service account keys required)
if (!admin.apps.length) {
  admin.initializeApp()
}

const auth = admin.auth()
const db = admin.firestore()

/**
 * Callable Cloud Function: provisionEmployeeAccount
 *
 * Secure server-side provisioning of an employee account:
 * 1. Verifies caller is an active authenticated Administrator in Firestore.
 * 2. Strictly validates Employee ID format and initial password strength.
 * 3. Enforces unique Employee ID (case-insensitive) and unique contact email.
 * 4. Creates Firebase Authentication user using deterministic synthetic alias (emp_xxx@worktrack.internal).
 * 5. Creates /users/{uid} and /employees/{employeeId} records.
 * 6. Executes compensating rollback (deleting Auth user) if Firestore record writes fail.
 * 7. Never logs or persists plaintext passwords.
 */
export const provisionEmployeeAccount = onCall(
  {
    region: 'us-central1',
    maxInstances: 10,
    cors: true,
  },
  async (request): Promise<ProvisionEmployeeResult> => {
    // ──────────────────────────────────────────────────────────
    // 1. Authenticated Caller Verification
    // ──────────────────────────────────────────────────────────
    if (!request.auth || !request.auth.uid) {
      throw new HttpsError(
        'unauthenticated',
        'Authentication required. You must be signed in as an administrator to provision accounts.'
      )
    }

    const callerUid = request.auth.uid

    // ──────────────────────────────────────────────────────────
    // 2. Verified Admin Role & Status Enforcement
    // Never trust client-supplied role claims. Check Firestore /users/{callerUid}.
    // ──────────────────────────────────────────────────────────
    const callerDocSnap = await db.collection('users').doc(callerUid).get()
    if (!callerDocSnap.exists) {
      throw new HttpsError('permission-denied', 'Administrative caller profile not found in database.')
    }

    const callerData = callerDocSnap.data()
    if (!callerData || callerData.role !== 'admin' || callerData.status !== 'active') {
      throw new HttpsError(
        'permission-denied',
        'Access Denied: Only active Administrators have permission to provision employee accounts.'
      )
    }

    // ──────────────────────────────────────────────────────────
    // 3. Payload Validation
    // ──────────────────────────────────────────────────────────
    const payload = request.data as Partial<ProvisionEmployeePayload>
    if (!payload) {
      throw new HttpsError('invalid-argument', 'Missing provisioning request payload.')
    }

    // A. Employee ID validation
    let normalizedId: string
    try {
      normalizedId = normalizeEmployeeId(payload.employeeId || '')
    } catch (err: any) {
      throw new HttpsError('invalid-argument', err.message || 'Invalid Employee ID format.')
    }

    // B. Name validation
    const name = (payload.name || '').trim()
    if (!name || name.length < 2 || name.length > 100) {
      throw new HttpsError('invalid-argument', 'Employee Full Name must be between 2 and 100 characters.')
    }

    // C. Contact Email validation
    const contactEmail = (payload.contactEmail || '').trim().toLowerCase()
    if (!contactEmail || !contactEmail.includes('@') || !contactEmail.includes('.')) {
      throw new HttpsError('invalid-argument', 'A valid corporate or personal contact email is required.')
    }

    // D. Department validation
    const department = (payload.department || 'General').trim()

    // E. Initial Password validation
    const initialPassword = payload.initialPassword || ''
    const passwordCheck = validatePasswordStrength(initialPassword)
    if (!passwordCheck.valid) {
      throw new HttpsError(
        'invalid-argument',
        `Password does not meet security requirements: ${passwordCheck.errors.join(' ')}`
      )
    }

    // F. Synthetic Auth Email calculation
    const syntheticEmail = formatEmployeeAuthEmail(normalizedId)

    // ──────────────────────────────────────────────────────────
    // 4. Collision & Duplicate Checks
    // ──────────────────────────────────────────────────────────
    // A. Check if directory record /employees/{normalizedId} already exists
    const empDocRef = db.collection('employees').doc(normalizedId)
    const existingEmpDoc = await empDocRef.get()
    if (existingEmpDoc.exists) {
      throw new HttpsError(
        'already-exists',
        `Employee ID "${normalizedId}" already exists in the employee directory.`
      )
    }

    // B. Check if contact email is already registered to another employee
    const emailQuerySnap = await db
      .collection('employees')
      .where('email', '==', contactEmail)
      .limit(1)
      .get()
    if (!emailQuerySnap.empty) {
      throw new HttpsError(
        'already-exists',
        `Contact email "${contactEmail}" is already associated with an existing employee.`
      )
    }

    // C. Check if synthetic email alias already exists in Firebase Auth
    try {
      const existingAuth = await auth.getUserByEmail(syntheticEmail)
      if (existingAuth) {
        throw new HttpsError(
          'already-exists',
          `A Firebase Authentication account for Employee ID "${normalizedId}" already exists.`
        )
      }
    } catch (authLookupErr: any) {
      // auth/user-not-found is expected and desired
      if (authLookupErr.code !== 'auth/user-not-found') {
        throw new HttpsError('internal', `Auth pre-check error: ${authLookupErr.message}`)
      }
    }

    // ──────────────────────────────────────────────────────────
    // 5. Firebase Authentication User Creation
    // ──────────────────────────────────────────────────────────
    let createdUser: admin.auth.UserRecord
    try {
      createdUser = await auth.createUser({
        email: syntheticEmail,
        password: initialPassword,
        displayName: name,
        emailVerified: true, // internal synthetic address
      })
    } catch (createErr: any) {
      if (createErr.code === 'auth/email-already-exists') {
        throw new HttpsError(
          'already-exists',
          `An authentication account with Employee ID "${normalizedId}" already exists.`
        )
      }
      throw new HttpsError('internal', `Failed to create Firebase Authentication account: ${createErr.message}`)
    }

    const newUid = createdUser.uid

    // ──────────────────────────────────────────────────────────
    // 6. Firestore Document Creation with Safe Compensation / Rollback
    // Auth and Firestore cannot be committed in a single distributed transaction.
    // If Firestore writes fail, we immediately delete the created Auth user
    // to prevent orphaned, half-provisioned accounts.
    // ──────────────────────────────────────────────────────────
    const nowIso = new Date().toISOString()

    try {
      const batch = db.batch()

      // Write /users/{uid}
      const userRef = db.collection('users').doc(newUid)
      batch.set(userRef, {
        uid: newUid,
        email: syntheticEmail,
        contactEmail,
        displayName: name,
        role: 'employee',
        employeeId: normalizedId,
        status: 'active',
        createdAt: nowIso,
        updatedAt: nowIso,
        provisionedBy: callerUid,
      })

      // Write /employees/{employeeId}
      const employeeRef = db.collection('employees').doc(normalizedId)
      batch.set(employeeRef, {
        employeeId: normalizedId,
        userId: newUid,
        name,
        email: contactEmail,
        department,
        role: 'employee',
        status: 'active',
        createdAt: nowIso,
        updatedAt: nowIso,
      })

      await batch.commit()
    } catch (firestoreErr: any) {
      // ⚠️ COMPENSATING ACTION: Rollback created Firebase Auth account
      console.error(
        `[Provisioning] Firestore write failed for ${normalizedId}. Deleting newly created Auth user ${newUid}:`,
        firestoreErr
      )
      try {
        await auth.deleteUser(newUid)
      } catch (rollbackErr) {
        console.error(
          `[Provisioning] CRITICAL: Failed to delete orphaned Auth user ${newUid} during rollback:`,
          rollbackErr
        )
      }

      throw new HttpsError(
        'internal',
        `Failed to link employee database records: ${firestoreErr.message}. The authentication account was automatically rolled back.`
      )
    }

    // ──────────────────────────────────────────────────────────
    // 7. Success Result
    // Plaintext password is NEVER logged or returned.
    // ──────────────────────────────────────────────────────────
    return {
      success: true,
      uid: newUid,
      employeeId: normalizedId,
      authEmail: syntheticEmail,
      contactEmail,
      name,
      role: 'employee',
      department,
    }
  }
)
