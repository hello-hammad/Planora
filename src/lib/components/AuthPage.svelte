<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
  import { firebaseConfigured, getPlanoraAuth, usingFirebaseAuthEmulator } from '$lib/firebase';

  let { mode }: { mode: 'login' | 'signup' } = $props();
  let name = $state('');
  let email = $state('');
  let password = $state('');
  let confirmPassword = $state('');
  let error = $state('');
  let busy = $state(false);
  let ready = $state(false);
  const returnTo = $derived(page.url.searchParams.get('returnTo'));
  const switchHref = $derived(`${mode === 'login' ? '/signup' : '/login'}${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`);

  onMount(() => { ready = true; });

  function safeReturnPath() {
    const requested = returnTo ? new URL(returnTo, window.location.origin) : new URL('/dashboard', window.location.origin);
    if (requested.origin !== window.location.origin) return '/dashboard';
    if (requested.pathname.replace(/\/$/, '') === '/dashboard' && requested.searchParams.get('generate') === '1') {
      try {
        if (window.sessionStorage.getItem('planora-pending-prompt')) return '/ai?continue=1';
      } catch { /* Continue to the dashboard if storage is unavailable. */ }
    }
    return `${requested.pathname}${requested.search}${requested.hash}`;
  }

  function readableError(reason: unknown) {
    const code = typeof reason === 'object' && reason && 'code' in reason ? String(reason.code) : '';
    if (code === 'auth/email-already-in-use') return 'An account already exists for this email.';
    if (code === 'auth/invalid-credential' || code === 'auth/user-not-found' || code === 'auth/wrong-password') return 'Email or password is incorrect.';
    if (code === 'auth/weak-password') return 'Choose a password with at least 8 characters.';
    if (code === 'auth/invalid-email') return 'Enter a valid email address.';
    if (code === 'auth/operation-not-allowed') return 'Enable email and password sign-in in the Firebase Console.';
    return 'Account access failed. Check your connection and try again.';
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    error = '';
    if (mode === 'signup' && password !== confirmPassword) {
      error = 'The passwords do not match.';
      return;
    }
    if (mode === 'signup' && password.length < 8) {
      error = 'Choose a password with at least 8 characters.';
      return;
    }
    if (!firebaseConfigured) {
      error = 'Account access is not configured. Add the Planora Firebase settings to the environment first.';
      return;
    }

    busy = true;
    try {
      const auth = getPlanoraAuth();
      if (!auth) throw new Error('Firebase Authentication is unavailable.');
      if (mode === 'signup') {
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await updateProfile(credential.user, { displayName: name.trim() });
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
      await goto(safeReturnPath());
    } catch (reason) {
      error = readableError(reason);
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head>
  <title>{mode === 'login' ? 'Log in' : 'Create account'} | Planora</title>
</svelte:head>

<main class="auth-page">
  <header class="auth-header">
    <a href="/" class="auth-brand" aria-label="Planora home"><span aria-hidden="true">P</span> Planora</a>
    <a href="/" class="auth-back">Back to home</a>
  </header>
  <section class="auth-panel" aria-labelledby="auth-title">
    <p class="auth-eyebrow">YOUR SPACE, IN GOOD HANDS</p>
    <h1 id="auth-title">{mode === 'login' ? 'Welcome back' : 'Make room for your ideas'}</h1>
    <p class="auth-intro">{mode === 'login' ? 'Log in to continue planning.' : 'Create an account to get started with Planora.'}</p>

    {#if usingFirebaseAuthEmulator}
      <p class="auth-notice" role="status">Local development account. This account exists only in the Firebase Emulator.</p>
    {:else if !firebaseConfigured}
      <p class="auth-notice" role="status">Account access is not configured for this installation yet.</p>
    {/if}
    {#if error}<p class="auth-error" role="alert">{error}</p>{/if}

    <form method="post" onsubmit={submit}>
      {#if mode === 'signup'}
        <label for="auth-name">Name</label>
        <input id="auth-name" name="name" autocomplete="name" bind:value={name} required minlength="2" />
      {/if}
      <label for="auth-email">Email</label>
      <input id="auth-email" name="email" type="email" autocomplete="email" bind:value={email} required />
      <label for="auth-password">Password</label>
      <input id="auth-password" name="password" type="password" autocomplete={mode === 'signup' ? 'new-password' : 'current-password'} bind:value={password} required minlength={mode === 'signup' ? 8 : undefined} />
      {#if mode === 'signup'}
        <label for="auth-confirm">Confirm password</label>
        <input id="auth-confirm" name="confirm-password" type="password" autocomplete="new-password" bind:value={confirmPassword} required minlength="8" />
      {/if}
      <button type="submit" disabled={!ready || busy || !firebaseConfigured}>{busy ? 'Please wait...' : mode === 'login' ? 'Log in' : 'Create account'}</button>
    </form>

    <p class="auth-switch">
      {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
      <a href={switchHref}>{mode === 'login' ? 'Sign up' : 'Log in'}</a>
    </p>
  </section>
</main>

<style>
  .auth-page { min-height: 100vh; background: #f7f3ed; color: #302d29; font-family: 'Plus Jakarta Sans', sans-serif; }
  .auth-header { height: 72px; display: flex; align-items: center; justify-content: space-between; max-width: 1120px; margin: auto; padding: 0 28px; }
  .auth-brand { display: inline-flex; align-items: center; gap: 10px; color: inherit; font-size: 18px; font-weight: 800; text-decoration: none; }
  .auth-brand span { display: grid; width: 34px; height: 34px; place-items: center; border-radius: 9px; background: #4a3026; color: white; }
  .auth-back, .auth-switch a { color: #744632; font-size: 14px; font-weight: 700; }
  .auth-panel { width: min(100% - 32px, 440px); margin: clamp(48px, 10vh, 100px) auto; padding: 36px; border: 1px solid #e7dfd5; border-radius: 12px; background: #fffdfa; box-shadow: 0 18px 50px #302d2912; }
  .auth-eyebrow { margin: 0 0 12px; color: #8a6148; font-size: 11px; font-weight: 800; }
  h1 { margin: 0; font-family: 'DM Serif Display', Georgia, serif; font-size: 34px; font-weight: 400; }
  .auth-intro { margin: 8px 0 24px; color: #6e6a63; font-size: 14px; }
  form { display: grid; gap: 10px; }
  label { margin-top: 7px; font-size: 13px; font-weight: 700; }
  input { min-height: 44px; padding: 10px 12px; border: 1px solid #d9d1c7; border-radius: 7px; background: white; color: inherit; font: inherit; font-size: 14px; }
  input:focus { outline: 2px solid #9b6849; outline-offset: 1px; }
  button { min-height: 46px; margin-top: 12px; border: 0; border-radius: 7px; background: #4a3026; color: white; font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; }
  button:disabled { cursor: not-allowed; opacity: .55; }
  .auth-notice, .auth-error { padding: 11px 12px; border-radius: 7px; font-size: 13px; line-height: 1.5; }
  .auth-notice { border: 1px solid #e8cf9a; background: #fff8e8; color: #6b4e1b; }
  .auth-error { border: 1px solid #e9c2b9; background: #fff1ed; color: #813d2d; }
  .auth-switch { margin: 22px 0 0; color: #6e6a63; text-align: center; font-size: 13px; }
  .auth-switch a { margin-left: 4px; }
  @media (max-width: 520px) { .auth-header { padding: 0 18px; } .auth-panel { padding: 28px 22px; } }
</style>