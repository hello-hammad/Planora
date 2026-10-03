import { getApps, initializeApp } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import { env } from '$env/dynamic/public';

const requiredCloudConfig = Boolean(env.PUBLIC_FIREBASE_API_KEY && env.PUBLIC_FIREBASE_AUTH_DOMAIN && env.PUBLIC_FIREBASE_PROJECT_ID && env.PUBLIC_FIREBASE_APP_ID);
const configuredEmulatorHost = env.PUBLIC_FIREBASE_AUTH_EMULATOR_HOST;
const emulatorHost = configuredEmulatorHost === 'none'
  ? (!requiredCloudConfig && import.meta.env.DEV ? '127.0.0.1:9099' : '')
  : configuredEmulatorHost || (!requiredCloudConfig && import.meta.env.DEV ? '127.0.0.1:9099' : '');
const firebaseConfig = {
  apiKey: env.PUBLIC_FIREBASE_API_KEY || (emulatorHost ? 'demo-api-key' : undefined),
  authDomain: env.PUBLIC_FIREBASE_AUTH_DOMAIN || (emulatorHost ? 'localhost' : undefined),
  projectId: env.PUBLIC_FIREBASE_PROJECT_ID || (emulatorHost ? 'demo-planora' : undefined),
  storageBucket: env.PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.PUBLIC_FIREBASE_APP_ID || (emulatorHost ? '1:000000000000:web:planora-emulator' : undefined),
  measurementId: env.PUBLIC_FIREBASE_MEASUREMENT_ID,
};

export const firebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId);
export const usingFirebaseAuthEmulator = Boolean(emulatorHost);
export const app = firebaseConfigured
  ? getApps().find((candidate) => candidate.name === 'planora') ?? initializeApp(firebaseConfig, 'planora')
  : null;

let authInstance: Auth | null = null;
export function getPlanoraAuth() {
  if (!app) return null;
  if (!authInstance) {
    authInstance = getAuth(app);
    if (emulatorHost) connectAuthEmulator(authInstance, `http://${emulatorHost}`, { disableWarnings: true });
  }
  return authInstance;
}

// Only init analytics in browser (not during SSR/build)
export const analytics = app && !emulatorHost ? isSupported().then((yes) => (yes ? getAnalytics(app) : null)) : Promise.resolve(null);
