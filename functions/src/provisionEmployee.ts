import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'
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
    const correlationId = `prov_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    let stage = 'init'

    try {
      // ──────────────────────────────────────────────────────────
      // 1. Authenticated Caller Verification
      // ──────────────────────────────────────────────────────────
      stage = 'caller_verification'
      if (!request.auth || !request.auth.uid) {
        logger.warn('[Provisioning] Unauthenticated caller rejected', { correlationId, stage })
        throw new HttpsError(
          'unauthenticated',
          'Authentication required. You must be signed in as an administrator to provision accounts.',
          { correlationId }
        )
      }

      const callerUid = request.auth.uid
      logger.info('[Provisioning] Caller authenticated', { correlationId, callerUid, stage })

      // ──────────────────────────────────────────────────────────
      // 2. Verified Admin Role & Status Enforcement
      // Never trust client-supplied role claims. Check Firestore /users/{callerUid}.
      // ──────────────────────────────────────────────────────────
      stage = 'admin_verification'
      const callerDocSnap = await db.collection('users').doc(callerUid).get()
      if (!callerDocSnap.exists) {
        logger.warn('[Provisioning] Caller profile missing in database', { correlationId, callerUid, stage })
        throw new HttpsError(
          'permission-denied',
          'Administrative caller profile not found in database.',
          { correlationId }
        )
      }

      const callerData = callerDocSnap.data()
      if (!callerData || callerData.role !== 'admin' || callerData.status !== 'active') {
        logger.warn('[Provisioning] Caller lacks active admin status', {
          correlationId,
          callerUid,
          role: callerData?.role,
          status: callerData?.status,
          stage,
        })
        throw new HttpsError(
          'permission-denied',
          'Access Denied: Only active Administrators have permission to provision employee accounts.',
          { correlationId }
        )
      }
      logger.info('[Provisioning] Caller verified as active administrator', { correlationId, callerUid, stage })

      // ──────────────────────────────────────────────────────────
      // 3. Payload Validation
      // ──────────────────────────────────────────────────────────
      stage = 'payload_validation'
      const payload = request.data as Partial<ProvisionEmployeePayload>
      if (!payload) {
        throw new HttpsError('invalid-argument', 'Missing provisioning request payload.', { correlationId })
      }

      // A. Employee ID validation
      let normalizedId: string
      try {
        normalizedId = normalizeEmployeeId(payload.employeeId || '')
      } catch (err: any) {
        throw new HttpsError('invalid-argument', err.message || 'Invalid Employee ID format.', { correlationId })
      }

      // B. Name validation
      const name = (payload.name || '').trim()
      if (!name || name.length < 2 || name.length > 100) {
        throw new HttpsError('invalid-argument', 'Employee Full Name must be between 2 and 100 characters.', { correlationId })
      }

      // C. Contact Email validation
      const contactEmail = (payload.contactEmail || '').trim().toLowerCase()
      if (!contactEmail || !contactEmail.includes('@') || !contactEmail.includes('.')) {
        throw new HttpsError('invalid-argument', 'A valid corporate or personal contact email is required.', { correlationId })
      }

      // D. Department validation
      const department = (payload.department || 'General').trim()

      // E. Initial Password validation (Never log initialPassword)
      const initialPassword = payload.initialPassword || ''
      const passwordCheck = validatePasswordStrength(initialPassword)
      if (!passwordCheck.valid) {
        throw new HttpsError(
          'invalid-argument',
          `Password does not meet security requirements: ${passwordCheck.errors.join(' ')}`,
          { correlationId }
        )
      }

      // F. Synthetic Auth Email calculation
      const syntheticEmail = formatEmployeeAuthEmail(normalizedId)
      logger.info('[Provisioning] Payload validated successfully', {
        correlationId,
        employeeId: normalizedId,
        authEmail: syntheticEmail,
        department,
        stage,
      })

      // ──────────────────────────────────────────────────────────
      // 4. Collision & Duplicate Checks
      // ──────────────────────────────────────────────────────────
      stage = 'collision_checks'

      // A. Check if directory record /employees/{normalizedId} already exists
      const empDocRef = db.collection('employees').doc(normalizedId)
      const existingEmpDoc = await empDocRef.get()
      const isExistingRecord = existingEmpDoc.exists
      const existingData = isExistingRecord ? existingEmpDoc.data() : null

      // If employee already has a linked Auth user, block re-provisioning
      if (isExistingRecord && existingData?.userId) {
        logger.warn('[Provisioning] Employee ID already linked to active user', {
          correlationId,
          employeeId: normalizedId,
          existingUserId: existingData.userId,
          stage,
        })
        throw new HttpsError(
          'already-exists',
          `Employee ID "${normalizedId}" is already linked to an active user account.`,
          { correlationId }
        )
      }

      // Preserve existing directory data if unlinked record is being activated
      const employeeName = isExistingRecord && existingData?.name ? existingData.name : name
      const employeeDepartment = isExistingRecord && existingData?.department ? existingData.department : department
      const finalContactEmail =
        isExistingRecord && existingData?.email ? existingData.email.trim().toLowerCase() : contactEmail
      const employeeRole = isExistingRecord && existingData?.role ? existingData.role : payload.role || 'employee'

      // B. Check if contact email is already registered to another employee
      const emailQuerySnap = await db
        .collection('employees')
        .where('email', '==', finalContactEmail)
        .limit(5)
        .get()
      const isEmailUsedByOther = emailQuerySnap.docs.some(doc => doc.id !== normalizedId)
      if (isEmailUsedByOther) {
        logger.warn('[Provisioning] Contact email already associated with another employee', {
          correlationId,
          contactEmail: finalContactEmail,
          stage,
        })
        throw new HttpsError(
          'already-exists',
          `Contact email "${finalContactEmail}" is already associated with an existing employee.`,
          { correlationId }
        )
      }

      // C. Check if synthetic email alias already exists in Firebase Auth
      try {
        const existingAuth = await auth.getUserByEmail(syntheticEmail)
        if (existingAuth) {
          logger.warn('[Provisioning] Synthetic auth alias already exists in Auth', {
            correlationId,
            authEmail: syntheticEmail,
            stage,
          })
          throw new HttpsError(
            'already-exists',
            `A Firebase Authentication account for Employee ID "${normalizedId}" already exists.`,
            { correlationId }
          )
        }
      } catch (authLookupErr: any) {
        // auth/user-not-found is expected and desired
        if (authLookupErr.code !== 'auth/user-not-found') {
          logger.error('[Provisioning] Auth pre-check lookup error', {
            correlationId,
            code: authLookupErr.code,
            message: authLookupErr.message,
            stage,
          })
          throw new HttpsError('internal', `Auth pre-check error: ${authLookupErr.message}`, { correlationId })
        }
      }

      logger.info('[Provisioning] Collision checks passed', {
        correlationId,
        employeeId: normalizedId,
        isExistingRecord,
        stage,
      })

      // ──────────────────────────────────────────────────────────
      // 5. Firebase Authentication User Creation
      // ──────────────────────────────────────────────────────────
      stage = 'auth_user_creation'
      let createdUser: admin.auth.UserRecord
      try {
        createdUser = await auth.createUser({
          email: syntheticEmail,
          password: initialPassword,
          displayName: employeeName,
          emailVerified: true, // internal synthetic address
        })
      } catch (createErr: any) {
        if (createErr.code === 'auth/email-already-exists') {
          throw new HttpsError(
            'already-exists',
            `An authentication account with Employee ID "${normalizedId}" already exists.`,
            { correlationId }
          )
        }
        logger.error('[Provisioning] Failed to create Firebase Auth user', {
          correlationId,
          code: createErr.code,
          message: createErr.message,
          stage,
        })
        throw new HttpsError('internal', `Failed to create Firebase Authentication account: ${createErr.message}`, {
          correlationId,
        })
      }

      const newUid = createdUser.uid
      logger.info('[Provisioning] Created Auth user successfully', {
        correlationId,
        employeeId: normalizedId,
        uid: newUid,
        stage,
      })

      // ──────────────────────────────────────────────────────────
      // 6. Firestore Document Creation with Safe Compensation / Rollback
      // Auth and Firestore cannot be committed in a single distributed transaction.
      // If Firestore writes fail, we immediately delete the created Auth user
      // to prevent orphaned, half-provisioned accounts.
      // Pre-existing employee directory records are NEVER deleted on rollback.
      // ──────────────────────────────────────────────────────────
      stage = 'firestore_commit'
      const nowIso = new Date().toISOString()

      try {
        const batch = db.batch()

        // Write /users/{uid}
        const userRef = db.collection('users').doc(newUid)
        batch.set(userRef, {
          uid: newUid,
          email: syntheticEmail,
          contactEmail: finalContactEmail,
          displayName: employeeName,
          role: employeeRole,
          employeeId: normalizedId,
          status: 'active',
          createdAt: nowIso,
          updatedAt: nowIso,
          provisionedBy: callerUid,
        })

        // Link /employees/{employeeId}
        if (isExistingRecord) {
          // Activate existing unlinked record: preserve all existing fields, update userId and updatedAt
          batch.update(empDocRef, {
            userId: newUid,
            status: 'active',
            updatedAt: nowIso,
          })
        } else {
          // Create brand-new employee record
          batch.set(empDocRef, {
            employeeId: normalizedId,
            userId: newUid,
            name: employeeName,
            email: finalContactEmail,
            department: employeeDepartment,
            role: employeeRole,
            status: 'active',
            createdAt: nowIso,
            updatedAt: nowIso,
          })
        }

        await batch.commit()
      } catch (firestoreErr: any) {
        // ⚠️ COMPENSATING ACTION: Rollback created Firebase Auth account
        // Note: Pre-existing employee document in /employees is NEVER deleted
        logger.error(
          `[Provisioning] Firestore write failed for ${normalizedId}. Deleting newly created Auth user ${newUid}:`,
          {
            correlationId,
            stage,
            uidToDelete: newUid,
            error: firestoreErr.message,
            code: firestoreErr.code,
          }
        )
        try {
          await auth.deleteUser(newUid)
          logger.info('[Provisioning] Compensating rollback: Auth user successfully deleted', {
            correlationId,
            uidDeleted: newUid,
          })
        } catch (rollbackErr: any) {
          logger.error(
            `[Provisioning] CRITICAL: Failed to delete orphaned Auth user ${newUid} during rollback:`,
            {
              correlationId,
              uid: newUid,
              error: rollbackErr?.message,
            }
          )
        }

        throw new HttpsError(
          'internal',
          `Failed to link employee database records: ${firestoreErr.message}. The authentication account was automatically rolled back.`,
          { correlationId }
        )
      }

      // ──────────────────────────────────────────────────────────
      // 7. Success Result
      // Plaintext password is NEVER logged or returned.
      // ──────────────────────────────────────────────────────────
      stage = 'completed'
      logger.info('[Provisioning] Employee account provisioning completed successfully', {
        correlationId,
        employeeId: normalizedId,
        uid: newUid,
        isExistingRecord,
        stage,
      })

      return {
        success: true,
        uid: newUid,
        employeeId: normalizedId,
        authEmail: syntheticEmail,
        contactEmail: finalContactEmail,
        name: employeeName,
        role: employeeRole,
        department: employeeDepartment,
      }
    } catch (err: any) {
      if (err instanceof HttpsError) {
        logger.warn(`[Provisioning] Request failed with HttpsError`, {
          correlationId,
          stage,
          code: err.code,
          message: err.message,
        })
        throw err
      }

      logger.error(`[Provisioning] Uncaught exception during provisioning`, {
        correlationId,
        stage,
        name: err?.name,
        message: err?.message,
        code: err?.code,
      })
      throw new HttpsError(
        'internal',
        `Internal error at stage [${stage}]: ${err?.message || 'Unknown error'}`,
        { correlationId }
      )
    }
  }
)
