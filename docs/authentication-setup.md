# Planora Authentication Setup

Planora uses Firebase Authentication for account identities and password verification. It does not store passwords in the app, Firestore, or the browser. Project plans remain in browser storage; signing in does not sync plans between devices.

## Local Development

`npm run dev` starts the Firebase Authentication Emulator, seeds the local Admin, then starts Vite. The first run may download the emulator. Local accounts are held only by the emulator and are cleared when it stops.

The emulator Admin login is `admin@planora.local` with password `PlanoraLocalAdmin!2026`. This account exists only in the local emulator and is never sent to a production Firebase project. Signup can also create local test accounts while the dev server is running.

## Configure User Registration

1. Create a Firebase project that you own.
2. In Firebase Console, enable **Authentication > Sign-in method > Email/Password**.
3. Set the Firebase password policy to require at least 8 characters, matching the signup form.
4. Copy the web app's Firebase configuration into a local `.env` file using `.env.example` as a template. Keep `PUBLIC_FIREBASE_AUTH_EMULATOR_HOST=none` to use your real Firebase project during local development.
5. Restart the development server. The login and signup buttons connect to the configured Firebase project.

## Seed the Administrator

Set `PLANORA_ADMIN_NAME`, `PLANORA_ADMIN_EMAIL`, `PLANORA_ADMIN_PASSWORD`, and `PUBLIC_FIREBASE_PROJECT_ID` in `.env`. The password must be at least 14 characters. The seeder deliberately rejects common defaults such as `12345`.

Authenticate the local machine with Application Default Credentials that have Firebase Authentication Admin permission, or set `GOOGLE_APPLICATION_CREDENTIALS` to a service-account file kept outside the repository. Then run:

```bash
npm run seed:admin
```

The script creates the user if it does not exist, otherwise updates its display name, and assigns the Firebase custom claim `role: "admin"`. Running it again is safe. It does not print or store the password. Sign out and back in after seeding an existing user so Firebase refreshes its ID token claims.

Never commit `.env` or a service-account key. Configure Firebase environment values and server credentials separately for each deployment environment.