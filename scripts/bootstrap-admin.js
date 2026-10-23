/**
 * WorkTrack Pro — Bootstrap Admin User Script
 *
 * This script runs in a secure, trusted administrative environment (such as a local terminal
 * or deployment server). It uses the Firebase Admin SDK to provision the initial Administrator.
 *
 * SECURITY NOTICE:
 * - NEVER embed this script, your serviceAccountKey.json, or private keys inside the Electron desktop apps.
 * - This script is for one-time administration setup.
 *
 * USAGE:
 * 1. Download your service account key from:
 *    Firebase Console -> Project Settings -> Service accounts -> Generate new private key
 * 2. Save it locally as serviceAccountKey.json in the scripts/ directory (already git-ignored).
 * 3. Run:
 *    node scripts/bootstrap-admin.js <user-email> [display-name]
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const keyPath = path.resolve(__dirname, 'serviceAccountKey.json');

if (!fs.existsSync(keyPath)) {
  console.error('\n❌ ERROR: serviceAccountKey.json not found in scripts/ directory!');
  console.error('Please download your private key from Firebase Console:');
  console.error('Project Settings -> Service accounts -> Generate new private key');
  console.error('Save it to:', keyPath);
  console.error('Then re-run this script.\n');
  process.exit(1);
}

const serviceAccount = require(keyPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const auth = admin.auth();
const db = admin.firestore();

async function bootstrapAdmin() {
  const args = process.argv.slice(2);
  const email = args[0];
  const displayName = args[1] || 'Primary Administrator';

  if (!email) {
    console.error('\nUsage: node scripts/bootstrap-admin.js <admin-email> [displayName]');
    console.error('Example: node scripts/bootstrap-admin.js admin@worktrackpro.internal "System Admin"\n');
    process.exit(1);
  }

  console.log(`\n🔍 Looking up user with email: ${email}...`);

  let userRecord;
  try {
    userRecord = await auth.getUserByEmail(email);
    console.log(`✓ Found existing Firebase Auth user (UID: ${userRecord.uid})`);
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      console.log(`User not found in Firebase Auth. Creating user: ${email}...`);
      const defaultPassword = 'TemporaryAdminPassword123!';
      userRecord = await auth.createUser({
        email,
        displayName,
        password: defaultPassword,
        emailVerified: true,
      });
      console.log(`✓ Created new Firebase Auth user (UID: ${userRecord.uid})`);
      console.log(`⚠️ Temporary password set: ${defaultPassword}`);
      console.log(`Please ask the administrator to change their password on first login.`);
    } else {
      throw err;
    }
  }

  // 1. Set Custom User Claims for fast token-based security rule checks
  console.log(`Setting custom claims { role: 'admin' } for UID: ${userRecord.uid}...`);
  await auth.setCustomUserClaims(userRecord.uid, { role: 'admin' });

  // 2. Write document to Firestore /users/{uid}
  console.log(`Writing Admin record to Firestore: /users/${userRecord.uid}...`);
  await db.collection('users').doc(userRecord.uid).set(
    {
      uid: userRecord.uid,
      email: userRecord.email,
      displayName: displayName || userRecord.displayName || 'Admin',
      role: 'admin',
      status: 'active',
      updatedAt: new Date().toISOString(),
      createdAt: userRecord.metadata.creationTime || new Date().toISOString(),
    },
    { merge: true }
  );

  console.log(`\n🎉 SUCCESS! User ${email} (UID: ${userRecord.uid}) is now an authorized Administrator.`);
  console.log(`They can now sign in to the WorkTrack Pro Admin Desktop App.\n`);
  process.exit(0);
}

bootstrapAdmin().catch(err => {
  console.error('\n❌ Bootstrap failed:', err);
  process.exit(1);
});
