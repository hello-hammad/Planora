<script lang="ts">
  import PlanoraLogo from '$lib/components/PlanoraLogo.svelte';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { invalidateAll } from '$app/navigation';

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

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    error = '';
    if (mode === 'signup' && password !== confirmPassword) { error = 'The passwords do not match.'; return; }
    if (mode === 'signup' && password.length < 8) { error = 'Choose a password with at least 8 characters.'; return; }
    busy = true;
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        error = body?.message ?? 'Account access failed. Check your connection and try again.';
        return;
      }
      await invalidateAll();
      await goto(safeReturnPath());
    } catch {
      error = 'Account access failed. Check your connection and try again.';
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
    <a href="/" class="auth-brand" aria-label="Planora home"><PlanoraLogo /></a>
    <a href="/" class="auth-back">Back to home</a>
  </header>
  <section class="auth-panel" aria-labelledby="auth-title">
    <p class="auth-eyebrow">YOUR SPACE, IN GOOD HANDS</p>
    <h1 id="auth-title">{mode === 'login' ? 'Welcome back' : 'Make room for your ideas'}</h1>
    <p class="auth-intro">{mode === 'login' ? 'Log in to continue planning.' : 'Create an account to get started with Planora.'}</p>
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
      <button type="submit" disabled={!ready || busy}>{busy ? 'Please wait...' : mode === 'login' ? 'Log in' : 'Create account'}</button>
    </form>

    <p class="auth-switch">
      {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
      <a href={switchHref}>{mode === 'login' ? 'Sign up' : 'Log in'}</a>
    </p>
  </section>
</main>

<style>
  .auth-page { min-height: 100vh; background: #F1F6EF; color: #1F2A22; font-family: 'Plus Jakarta Sans', sans-serif; }
  .auth-header { height: 72px; display: flex; align-items: center; justify-content: space-between; max-width: 1120px; margin: auto; padding: 0 28px; }
  .auth-brand { display: inline-flex; align-items: center; gap: 10px; color: inherit; font-size: 18px; font-weight: 800; text-decoration: none; }
  .auth-back, .auth-switch a { color: #3D5B45; font-size: 14px; font-weight: 700; }
  .auth-panel { width: min(100% - 32px, 440px); margin: clamp(48px, 10vh, 100px) auto; padding: 36px; border: 1px solid #D6E1D4; border-radius: 12px; background: #FFFFFF; box-shadow: 0 18px 50px #1F2A2212; }
  .auth-eyebrow { margin: 0 0 12px; color: #52765B; font-size: 11px; font-weight: 800; }
  h1 { margin: 0; font-family: 'DM Serif Display', Georgia, serif; font-size: 34px; font-weight: 400; }
  .auth-intro { margin: 8px 0 24px; color: #66726A; font-size: 14px; }
  form { display: grid; gap: 10px; }
  label { margin-top: 7px; font-size: 13px; font-weight: 700; }
  input { min-height: 44px; padding: 10px 12px; border: 1px solid #CBD8C9; border-radius: 7px; background: white; color: inherit; font: inherit; font-size: 14px; }
  input:focus { outline: 2px solid #52765B; outline-offset: 1px; }
  button { min-height: 46px; margin-top: 12px; border: 0; border-radius: 7px; background: #52765B; color: white; font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; }
  button:disabled { cursor: not-allowed; opacity: .55; }
  .auth-error { padding: 11px 12px; border-radius: 7px; font-size: 13px; line-height: 1.5; }
  .auth-error { border: 1px solid #e9c2b9; background: #fff1ed; color: #813d2d; }
  .auth-switch { margin: 22px 0 0; color: #66726A; text-align: center; font-size: 13px; }
  .auth-switch a { margin-left: 4px; }
  @media (max-width: 520px) { .auth-header { padding: 0 18px; } .auth-panel { padding: 28px 22px; } }
</style>