import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'
import * as admin from 'firebase-admin'
import {
  normalizeEmployeeId,
  DeleteEmployeePayload,
  DeleteEmployeeResult,
} from '@worktrack-pro/shared'

if (!admin.apps.length) {
  admin.initializeApp()
}

const auth = admin.auth()
const db = admin.firestore()

/**
 * Callable Cloud Function: deleteEmployeeAccount
 *
 * Secure server-side complete deletion of an employee:
 * 1. Verifies caller is an active authenticated Administrator in Firestore.
 * 2. Deletes user from Firebase Authentication if linked.
 * 3. Deletes user document from /users/{uid}.
 * 4. Deletes employee record from /employees/{employeeId}.
 * 5. Deletes all associated device records, work sessions, screenshots, and registrations.
 */
export const deleteEmployeeAccount = onCall(
  {
    region: 'us-central1',
    maxInstances: 10,
    cors: true,
  },
  async (request): Promise<DeleteEmployeeResult> => {
    const correlationId = `del_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

    // 1. Caller verification
    if (!request.auth || !request.auth.uid) {
      throw new HttpsError('unauthenticated', 'Authentication required.', { correlationId })
    }

    const callerUid = request.auth.uid
    const callerDoc = await db.collection('users').doc(callerUid).get()
    if (!callerDoc.exists) {
      throw new HttpsError('permission-denied', 'Admin profile not found.', { correlationId })
    }
    const callerData = callerDoc.data()
    if (!callerData || callerData.role !== 'admin' || callerData.status !== 'active') {
      throw new HttpsError('permission-denied', 'Only active Administrators can delete employees.', { correlationId })
    }

    // 2. Payload validation
    const payload = request.data as Partial<DeleteEmployeePayload>
    if (!payload || !payload.employeeId) {
      throw new HttpsError('invalid-argument', 'Missing employeeId.', { correlationId })
    }

    const normalizedId = normalizeEmployeeId(payload.employeeId)

    // Cannot delete the current admin user themselves
    if (callerData.employeeId === normalizedId) {
      throw new HttpsError('failed-precondition', 'You cannot delete your own active administrator account.', { correlationId })
    }

    logger.info('[DeleteEmployee] Processing deletion request', { correlationId, employeeId: normalizedId })

    // 3. Find employee record to locate linked userId
    const empDocRef = db.collection('employees').doc(normalizedId)
    const empDocSnap = await empDocRef.get()
    let targetUid = payload.userId || (empDocSnap.exists ? empDocSnap.data()?.userId : null)

    if (!targetUid) {
      // Search /users by employeeId
      const userMatch = await db.collection('users').where('employeeId', '==', normalizedId).limit(1).get()
      if (!userMatch.empty) {
        targetUid = userMatch.docs[0].id
      }
    }

    // 4. Delete Auth User
    if (targetUid) {
      try {
        await auth.deleteUser(targetUid)
        logger.info('[DeleteEmployee] Deleted Firebase Auth user', { correlationId, uid: targetUid })
      } catch (authErr: any) {
        if (authErr.code !== 'auth/user-not-found') {
          logger.warn('[DeleteEmployee] Auth delete warning:', { correlationId, error: authErr.message })
        }
      }

      // Delete /users/{uid}
      await db.collection('users').doc(targetUid).delete().catch(() => {})
    }

    // 5. Delete /employees/{employeeId}
    if (empDocSnap.exists) {
      await empDocRef.delete().catch(() => {})
    }

    // 6. Delete related collections
    const collectionsToClean = [
      'devices',
      'device_registrations',
      'device_approvals',
      'work_sessions',
      'screenshots',
      'pre_authorizations',
      'daily_summaries',
    ]

    for (const colName of collectionsToClean) {
      try {
        const querySnap = await db.collection(colName).where('employeeId', '==', normalizedId).get()
        const batch = db.batch()
        querySnap.docs.forEach(docSnap => batch.delete(docSnap.ref))
        if (!querySnap.empty) {
          await batch.commit()
        }
      } catch (cleanErr: any) {
        logger.warn(`[DeleteEmployee] Cleanup warning on ${colName}:`, { correlationId, error: cleanErr?.message })
      }
    }

    const nowIso = new Date().toISOString()
    logger.info('[DeleteEmployee] Deletion completed successfully', { correlationId, employeeId: normalizedId })

    return {
      success: true,
      employeeId: normalizedId,
      deletedAt: nowIso,
    }
  }
)
