<script lang="ts">
  import { goto } from '$app/navigation';

  let landingFrame = $state<HTMLIFrameElement>();
  const appRoutes = new Set(['/login', '/signup', '/dashboard', '/ai']);

  function copyPendingPrompt(frame: Window) {
    try {
      const prompt = frame.sessionStorage.getItem('planora-pending-prompt');
      if (prompt) window.sessionStorage.setItem('planora-pending-prompt', prompt);
    } catch { /* Storage may be unavailable in private browsing. */ }
  }

  function navigateToApp(pathname: string, search: string, hash: string) {
    const route = pathname.replace(/\/$/, '') || '/';
    if (!appRoutes.has(route)) return;
    if (landingFrame?.contentWindow) copyPendingPrompt(landingFrame.contentWindow);
    void goto(`${route}${search}${hash}`);
  }

  function handleLandingClick(event: MouseEvent) {
    const target = event.target as Element | null;
    if (!target?.closest('.lp-tool-rail button')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    navigateToApp('/login', '?returnTo=%2Fdashboard%2F', '');
  }

  function handleLandingSubmit(event: SubmitEvent) {
    const form = event.target as HTMLFormElement | null;
    if (!form?.matches('.lp-prompt-form')) return;
    const prompt = form.querySelector<HTMLTextAreaElement>('#home-prompt')?.value.trim();
    if (!prompt) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    try {
      window.sessionStorage.setItem('planora-pending-prompt', prompt);
      landingFrame?.contentWindow?.sessionStorage.setItem('planora-pending-prompt', prompt);
    } catch { /* Storage may be unavailable in private browsing. */ }
    navigateToApp('/login', '?returnTo=%2Fdashboard%2F%3Fgenerate%3D1', '');
  }

  function handleLandingLoad() {
    const frame = landingFrame?.contentWindow;
    if (!frame) return;
    try {
      const url = new URL(frame.location.href);
      if (url.pathname.startsWith('/landing/')) {
        const target = frame.document.createElement('base');
        target.target = '_top';
        frame.document.head.prepend(target);
        frame.document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((anchor) => { anchor.target = '_self'; });
        frame.document.addEventListener('click', handleLandingClick, true);
        frame.document.addEventListener('submit', handleLandingSubmit, true);
        return;
      }
      navigateToApp(url.pathname, url.search, url.hash);
    } catch { /* Ignore cross-origin or transient iframe navigation. */ }
  }
</script>

<svelte:head>
  <title>Planora | Make room for what matters</title>
  <meta name="description" content="Plan a home you can see, shape, and make your own." />
</svelte:head>

<iframe
  bind:this={landingFrame}
  src="/landing/index.html"
  title="Planora home planning"
  onload={handleLandingLoad}
  class="landing-frame"
></iframe>

<style>
  .landing-frame { display: block; width: 100%; height: 100vh; height: 100dvh; border: 0; }
</style>