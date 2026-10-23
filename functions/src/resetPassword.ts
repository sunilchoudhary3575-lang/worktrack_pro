import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'
import * as admin from 'firebase-admin'
import {
  normalizeEmployeeId,
  validatePasswordStrength,
  ResetEmployeePasswordPayload,
  ResetEmployeePasswordResult,
} from '@worktrack-pro/shared'

if (!admin.apps.length) {
  admin.initializeApp()
}

const auth = admin.auth()
const db = admin.firestore()

/**
 * Callable Cloud Function: resetEmployeePassword
 *
 * Secure server-side password reset for provisioned employee accounts:
 * 1. Verifies caller is an active authenticated Administrator in Firestore (/users/{callerUid}).
 * 2. Strictly validates Employee ID format and new password strength.
 * 3. Resolves employee's linked Auth UID via Firestore (/employees/{employeeId}.userId).
 * 4. Verifies bidirectional integrity between /employees/{employeeId} and /users/{uid}.
 * 5. Updates Firebase Authentication password via admin.auth().updateUser(uid, { password }).
 * 6. Records passwordResetAt timestamp in /users/{uid} without persisting plaintext passwords.
 * 7. Never logs or exposes plaintext passwords, tokens, or credential strings.
 */
export const resetEmployeePassword = onCall(
  {
    region: 'us-central1',
    maxInstances: 10,
    cors: true,
  },
  async (request): Promise<ResetEmployeePasswordResult> => {
    const correlationId = `pwd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    let stage = 'init'

    try {
      // ──────────────────────────────────────────────────────────
      // 1. Authenticated Caller Verification
      // ──────────────────────────────────────────────────────────
      stage = 'caller_verification'
      if (!request.auth || !request.auth.uid) {
        logger.warn('[PasswordReset] Unauthenticated caller rejected', { correlationId, stage })
        throw new HttpsError(
          'unauthenticated',
          'Authentication required. You must be signed in as an administrator to reset employee passwords.',
          { correlationId }
        )
      }

      const callerUid = request.auth.uid
      logger.info('[PasswordReset] Caller authenticated', { correlationId, callerUid, stage })

      // ──────────────────────────────────────────────────────────
      // 2. Verified Admin Role & Status Enforcement
      // Check Firestore /users/{callerUid} to ensure active admin status
      // ──────────────────────────────────────────────────────────
      stage = 'admin_verification'
      const callerDocSnap = await db.collection('users').doc(callerUid).get()
      if (!callerDocSnap.exists) {
        logger.warn('[PasswordReset] Caller profile missing in database', { correlationId, callerUid, stage })
        throw new HttpsError(
          'permission-denied',
          'Administrative caller profile not found in database.',
          { correlationId }
        )
      }

      const callerData = callerDocSnap.data()
      if (!callerData || callerData.role !== 'admin' || callerData.status !== 'active') {
        logger.warn('[PasswordReset] Caller lacks active admin status', {
          correlationId,
          callerUid,
          role: callerData?.role,
          status: callerData?.status,
          stage,
        })
        throw new HttpsError(
          'permission-denied',
          'Access Denied: Only active Administrators have permission to reset employee passwords.',
          { correlationId }
        )
      }
      logger.info('[PasswordReset] Caller verified as active administrator', { correlationId, callerUid, stage })

      // ──────────────────────────────────────────────────────────
      // 3. Payload Validation
      // ──────────────────────────────────────────────────────────
      stage = 'payload_validation'
      const payload = request.data as Partial<ResetEmployeePasswordPayload>
      if (!payload) {
        throw new HttpsError('invalid-argument', 'Missing password reset request payload.', { correlationId })
      }

      // A. Normalize Employee ID
      let normalizedId: string
      try {
        normalizedId = normalizeEmployeeId(payload.employeeId || '')
      } catch (err: any) {
        throw new HttpsError('invalid-argument', err.message || 'Invalid Employee ID format.', { correlationId })
      }

      // B. Password strength validation (Never log newPassword)
      const newPassword = payload.newPassword || ''
      const passwordCheck = validatePasswordStrength(newPassword)
      if (!passwordCheck.valid) {
        throw new HttpsError(
          'invalid-argument',
          `New password does not meet security requirements: ${passwordCheck.errors.join(' ')}`,
          { correlationId }
        )
      }

      logger.info('[PasswordReset] Payload validated successfully', {
        correlationId,
        employeeId: normalizedId,
        stage,
      })

      // ──────────────────────────────────────────────────────────
      // 4. Employee Document & Linked Account Resolution
      // ──────────────────────────────────────────────────────────
      stage = 'employee_resolution'
      const empRef = db.collection('employees').doc(normalizedId)
      const empSnap = await empRef.get()

      if (!empSnap.exists) {
        logger.warn('[PasswordReset] Employee document not found', {
          correlationId,
          employeeId: normalizedId,
          stage,
        })
        throw new HttpsError(
          'not-found',
          `Employee ID "${normalizedId}" was not found in the employee directory.`,
          { correlationId }
        )
      }

      const empData = empSnap.data()
      const targetUid = empData?.userId

      if (!targetUid || typeof targetUid !== 'string' || !targetUid.trim()) {
        logger.warn('[PasswordReset] Employee has no linked user account', {
          correlationId,
          employeeId: normalizedId,
          stage,
        })
        throw new HttpsError(
          'failed-precondition',
          `Employee ID "${normalizedId}" has not been provisioned with an active user account. Please activate the account first.`,
          { correlationId }
        )
      }

      // Verify corresponding /users/{targetUid} record
      const userRef = db.collection('users').doc(targetUid)
      const userSnap = await userRef.get()

      if (!userSnap.exists) {
        logger.error('[PasswordReset] Corrupt link: /users document missing for employee', {
          correlationId,
          employeeId: normalizedId,
          targetUid,
          stage,
        })
        throw new HttpsError(
          'failed-precondition',
          `Corrupt account link: User profile for Employee ID "${normalizedId}" was not found in database.`,
          { correlationId }
        )
      }

      const userData = userSnap.data()
      if (userData?.employeeId && userData.employeeId.toLowerCase() !== normalizedId.toLowerCase()) {
        logger.error('[PasswordReset] Mismatched employee ID in user document', {
          correlationId,
          employeeId: normalizedId,
          userEmployeeId: userData?.employeeId,
          targetUid,
          stage,
        })
        throw new HttpsError(
          'failed-precondition',
          'Integrity check failed: Linked user account does not match this employee record.',
          { correlationId }
        )
      }

      logger.info('[PasswordReset] Target account successfully resolved', {
        correlationId,
        employeeId: normalizedId,
        targetUid,
        stage,
      })

      // ──────────────────────────────────────────────────────────
      // 5. Firebase Authentication Password Update
      // ──────────────────────────────────────────────────────────
      stage = 'auth_update'
      try {
        await auth.updateUser(targetUid, {
          password: newPassword,
        })
      } catch (authErr: any) {
        logger.error('[PasswordReset] Firebase Auth updateUser failed', {
          correlationId,
          employeeId: normalizedId,
          targetUid,
          code: authErr.code,
          message: authErr.message,
          stage,
        })
        if (authErr.code === 'auth/user-not-found') {
          throw new HttpsError(
            'not-found',
            `Firebase Authentication account for Employee ID "${normalizedId}" was not found.`,
            { correlationId }
          )
        }
        throw new HttpsError(
          'internal',
          `Failed to update employee authentication credentials: ${authErr.message}`,
          { correlationId }
        )
      }

      logger.info('[PasswordReset] Firebase Auth password updated successfully', {
        correlationId,
        employeeId: normalizedId,
        targetUid,
        stage,
      })

      // ──────────────────────────────────────────────────────────
      // 6. Record Metadata Audit Timestamp
      // Record passwordResetAt and passwordResetBy on /users/{targetUid}
      // Never write plaintext passwords to Firestore or logs.
      // ──────────────────────────────────────────────────────────
      stage = 'firestore_metadata'
      const nowIso = new Date().toISOString()
      try {
        await userRef.update({
          updatedAt: nowIso,
          passwordResetAt: nowIso,
          passwordResetBy: callerUid,
        })
      } catch (dbErr: any) {
        // Non-fatal warning: Auth was updated successfully
        logger.warn('[PasswordReset] Could not update passwordResetAt metadata in Firestore', {
          correlationId,
          employeeId: normalizedId,
          targetUid,
          error: dbErr.message,
        })
      }

      // ──────────────────────────────────────────────────────────
      // 7. Success Result
      // Plaintext password is NEVER logged or returned in payload.
      // ──────────────────────────────────────────────────────────
      stage = 'completed'
      logger.info('[PasswordReset] Password reset completed successfully', {
        correlationId,
        employeeId: normalizedId,
        targetUid,
        stage,
      })

      return {
        success: true,
        employeeId: normalizedId,
        uid: targetUid,
        updatedAt: nowIso,
      }
    } catch (err: any) {
      if (err instanceof HttpsError) {
        logger.warn('[PasswordReset] Request failed with HttpsError', {
          correlationId,
          stage,
          code: err.code,
          message: err.message,
        })
        throw err
      }

      logger.error('[PasswordReset] Uncaught exception during password reset', {
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
