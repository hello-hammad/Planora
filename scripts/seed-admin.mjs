import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const usingEmulator = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST);
const projectId = process.env.PUBLIC_FIREBASE_PROJECT_ID?.trim()
  || process.env.GOOGLE_CLOUD_PROJECT?.trim()
  || process.env.GCLOUD_PROJECT?.trim()
  || (usingEmulator ? 'demo-planora' : undefined);
const email = process.env.PLANORA_ADMIN_EMAIL?.trim() || (usingEmulator ? 'admin@planora.local' : undefined);
const password = process.env.PLANORA_ADMIN_PASSWORD || (usingEmulator ? 'PlanoraLocalAdmin!2026' : undefined);
const displayName = process.env.PLANORA_ADMIN_NAME?.trim() || 'Admin';

async function seedAdmin() {
  if (!projectId || !email || !password) {
    throw new Error('Set PUBLIC_FIREBASE_PROJECT_ID, PLANORA_ADMIN_EMAIL, and PLANORA_ADMIN_PASSWORD in .env.');
  }
  if (password.length < 14) {
    throw new Error('PLANORA_ADMIN_PASSWORD must be at least 14 characters. Do not use a default password such as 12345.');
  }
  if (displayName.length < 2 || displayName.length > 100) {
    throw new Error('PLANORA_ADMIN_NAME must be between 2 and 100 characters.');
  }

  const options = usingEmulator ? { projectId } : { credential: applicationDefault(), projectId };
  const app = getApps().find((candidate) => candidate.name === 'planora-admin')
    ?? initializeApp(options, 'planora-admin');
  const auth = getAuth(app);
  let user;

  try {
    user = await auth.getUserByEmail(email);
    user = await auth.updateUser(user.uid, { displayName, disabled: false });
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') throw error;
    user = await auth.createUser({ email, password, displayName });
  }

  await auth.setCustomUserClaims(user.uid, { ...user.customClaims, role: 'admin' });
  console.log(`Admin account is ready for ${email} in Firebase project ${projectId}.`);
}

seedAdmin().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Could not seed the Planora admin account.');
  process.exitCode = 1;
});