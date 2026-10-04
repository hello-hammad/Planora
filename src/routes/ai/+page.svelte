<script lang="ts">
  import PlanoraLogo from '$lib/components/PlanoraLogo.svelte';
  import { onMount } from 'svelte';
  import { crossfade, fade, fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { base } from '$app/paths';
  import { replaceState } from '$app/navigation';
  import { page } from '$app/state';
  import { get } from 'svelte/store';
  import TopBar from '$lib/components/toolbar/TopBar.svelte';
  import FloorPlanCanvas from '$lib/components/editor/FloorPlanCanvas.svelte';
  import AssistantChat from '$lib/components/ai/AssistantChat.svelte';
  import PlanoraLoader from '$lib/components/PlanoraLoader.svelte';
  import AppIcon from '$lib/components/AppIcon.svelte';
  import { activeFloor, createDefaultProject, currentProject, loadProject, viewMode } from '$lib/stores/project';
  import { autoSave, markClean } from '$lib/stores/saveStatus';
  import { localStore, storageErrorMessage } from '$lib/services/datastore';
  import { openProject } from '$lib/services/projectOpening';
  import { resolveRoomGeometry } from '$lib/utils/roomDetection';
  import { assistantReady, assistantSettings, PROVIDERS } from '$lib/ai/assistant';
  import AssistantSettingsForm from '$lib/components/ai/AssistantSettingsForm.svelte';
  import { projectSettings, formatArea } from '$lib/stores/settings';

  /**
   * Design through AI. Starts as a full-screen prompt; after the first message the
   * chat moves to the left quarter and the design appears in 3D (auto-rotating 360°)
   * in the remaining three quarters, framed only by the top and bottom bars.
   */

  const [send, receive] = crossfade({ duration: 650, easing: cubicOut });

  let phase = $state<'loading' | 'intro' | 'studio'>('loading');
  let prompt = $state('');
  let firstPrompt = $state('');
  let error = $state('');
  let spin = $state(true);
  let setup = $state(false);
  let ThreeViewer: any = $state(null);

  const ideas = [
    'A modern 3 bedroom house on a 30 × 50 ft plot with 2 bathrooms, an open kitchen and a lounge',
    'A compact 2 bedroom home for a 10 × 15 m plot with a home office and a garage',
    'A family home: master suite, 3 kids’ bedrooms, 3 baths, dining room and a big living room',
  ];

  const stats = $derived.by(() => {
    const floor = $activeFloor;
    if (!floor) return { rooms: 0, area: 0 };
    const rooms = resolveRoomGeometry(floor);
    return { rooms: rooms.length, area: rooms.reduce((a, r) => a + r.room.area, 0) };
  });

  onMount(() => {
    const params = new URL(window.location.href).searchParams;
    const id = params.get('id');
    if (!id) {
      phase = 'intro';
      if (params.get('continue') === '1') {
        const pendingPrompt = window.sessionStorage.getItem('planora-pending-prompt');
        if (pendingPrompt) {
          window.sessionStorage.removeItem('planora-pending-prompt');
          prompt = pendingPrompt;
          void start(pendingPrompt);
        }
      }
      return;
    }
    void (async () => {
      try {
        const project = await localStore.load(id);
        if (!project) { phase = 'intro'; return; }
        loadProject(project); markClean();
        enterStudio();
      } catch (e) { error = storageErrorMessage(e); phase = 'intro'; }
    })();
  });

  function enterStudio() {
    viewMode.set('3d');
    phase = 'studio';
    if (!ThreeViewer) import('$lib/components/viewer3d/ThreeViewer.svelte').then(m => { ThreeViewer = m.default; }).catch(() => { error = 'Could not load the 3D view.'; });
  }

  async function start(text = prompt) {
    const request = text.trim();
    if (!request) return;
    if (!assistantReady(get(assistantSettings))) { setup = true; prompt = request; return; }
    error = '';
    try {
      const name = request.length > 40 ? `${request.slice(0, 38).trim()}…` : request;
      const project = await openProject(() => createDefaultProject(`AI · ${name}`), 'new');
      if (!project) return;
      await autoSave();
      replaceState(`${base}/ai?id=${encodeURIComponent(project.id)}`, page.state);
      firstPrompt = request;
      prompt = '';
      enterStudio();
    } catch (e) { error = e instanceof Error ? e.message : 'Could not start a new design.'; }
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void start(); }
  }
</script>

<svelte:head><title>Design with AI · Planora</title></svelte:head>

{#if phase === 'loading'}
  <PlanoraLoader label="Opening your AI design…" />
{:else if phase === 'intro'}
  <!-- Full-screen start: one prompt box, like a chat-first builder -->
  <div class="relative flex min-h-screen flex-col bg-ivory text-charcoal" out:fade={{ duration: 200 }}>
    <header class="flex h-16 items-center justify-between px-6">
      <a href={`${base}/dashboard`} class="flex items-center gap-2.5 text-charcoal no-underline">
        <PlanoraLogo />
      </a>
      <a href={`${base}/dashboard`} class="text-sm font-semibold text-muted hover:text-charcoal">Design manually instead</a>
    </header>

    <main class="plan-paper flex flex-1 flex-col items-center justify-center px-6 pb-20">
      <span class="mb-5 inline-flex items-center gap-2 rounded-full bg-terracotta-tint px-3 py-1 text-xs font-semibold text-terracotta-ink">
        <AppIcon name="bot" size={14} />
        Design through AI
      </span>
      <h1 class="max-w-2xl text-center text-[44px] font-bold leading-[1.1] tracking-tight max-sm:text-[32px]">Describe the home you imagine.</h1>
      <p class="mt-3 max-w-xl text-center text-[16px] text-muted">Planora’s assistant lays out the rooms, doors, windows, finishes and furniture — then you refine it by chatting or by hand.</p>

      <form class="mt-8 w-full max-w-2xl" onsubmit={(e) => { e.preventDefault(); void start(); }} out:send={{ key: 'composer' }}>
        <div class="rounded-[20px] border border-line bg-cream p-2 shadow-[0_12px_40px_rgba(50,40,30,0.10)] focus-within:border-walnut">
          <textarea bind:value={prompt} onkeydown={onKey} rows="3" aria-label="Describe your home"
            placeholder="e.g. A 3 bedroom house on a 30 × 50 ft plot with 2 bathrooms and an open kitchen"
            class="w-full resize-none bg-transparent px-3 py-2 text-[15px] text-charcoal outline-none placeholder:text-muted"></textarea>
          <div class="flex items-center justify-between gap-2 px-2 pb-1">
            <button type="button" class="text-xs font-semibold text-muted hover:text-charcoal" onclick={() => setup = !setup}>
              AI: {PROVIDERS[$assistantSettings.provider].label}{assistantReady($assistantSettings) ? '' : ' · set up'}
            </button>
            <button type="submit" disabled={!prompt.trim()} class="flex h-10 items-center gap-2 rounded-[12px] bg-walnut px-4 text-sm font-semibold text-white hover:bg-walnut-dark disabled:opacity-40">
              Design it
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </button>
          </div>
        </div>
      </form>

      {#if setup}
        <div class="mt-3 w-full max-w-2xl rounded-[16px] border border-line bg-white p-4" transition:fly={{ y: -8, duration: 180 }}>
          <span class="mb-2 block text-sm font-bold">Choose a free AI model</span>
          <AssistantSettingsForm size="md" onSaved={() => { setup = false; if (prompt.trim()) void start(); }} />
        </div>
      {/if}

      <div class="mt-6 flex max-w-2xl flex-wrap justify-center gap-2">
        {#each ideas as idea}
          <button type="button" class="rounded-full border border-line bg-cream px-3.5 py-2 text-xs font-medium text-charcoal transition-colors hover:border-walnut hover:bg-walnut-tint" onclick={() => start(idea)}>{idea}</button>
        {/each}
      </div>
      {#if error}<p role="alert" class="mt-4 text-sm text-danger">{error}</p>{/if}
    </main>
  </div>
{:else}
  <!-- Studio: chat on the left quarter, the design in 3D on the rest -->
  <div class="flex h-screen flex-col overflow-hidden bg-ivory" in:fade={{ duration: 250 }}>
    <TopBar />
    <div class="grid min-h-0 flex-1 grid-cols-[minmax(300px,25%)_1fr] max-md:grid-cols-1 max-md:grid-rows-[1fr_45%]">
      <aside class="min-h-0 border-r border-line max-md:order-2 max-md:border-r-0 max-md:border-t" in:receive={{ key: 'composer' }} aria-label="AI design chat">
        <AssistantChat variant="studio" initialPrompt={firstPrompt} />
      </aside>
      <section class="relative min-h-0 isolate" in:fly={{ x: 40, duration: 500, delay: 150 }} aria-label="Design preview">
        {#if $viewMode === '2d'}
          <FloorPlanCanvas />
        {:else if ThreeViewer}
          <ThreeViewer autoRotate={spin} />
        {:else}
          <PlanoraLoader variant="inline" label="Preparing the 3D view…" />
        {/if}
      </section>
    </div>
    <!-- Bottom bar -->
    <footer class="flex h-12 shrink-0 items-center gap-3 border-t border-line bg-cream px-4 text-[12px] font-medium text-muted">
      <span>{stats.rooms} room{stats.rooms === 1 ? '' : 's'}</span>
      <span class="h-4 w-px bg-line" aria-hidden="true"></span>
      <span>{formatArea(stats.area, $projectSettings.units)}</span>
      <span class="flex-1"></span>
      {#if $viewMode === '3d'}
        <button type="button" aria-pressed={spin} onclick={() => spin = !spin}
          class="flex h-8 items-center gap-1.5 rounded-lg px-2.5 font-semibold transition-colors {spin ? 'bg-walnut-tint text-walnut-dark' : 'hover:bg-hover hover:text-charcoal'}">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 0 15 6.7M21 12A9 9 0 0 0 6 5.3M6 2v3.5h3.5M18 22v-3.5h-3.5" /></svg>
          360° spin
        </button>
      {/if}
      <a href={`${base}/editor?id=${encodeURIComponent($currentProject?.id ?? '')}`}
        class="flex h-8 items-center gap-1.5 rounded-lg border border-line bg-white px-3 font-semibold text-charcoal hover:bg-hover">Open in manual editor</a>
    </footer>
  </div>
{/if}
