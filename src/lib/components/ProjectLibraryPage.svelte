<script lang="ts">
  import AppIcon from '$lib/components/AppIcon.svelte';
  import { t, locale, translate, type Locale } from '$lib/i18n';
  import { projectServiceMessage } from '$lib/i18n/projectServiceMessages';
  import { templateLabels } from '$lib/i18n/templateLabels';
  import { modalDialog } from '$lib/utils/modalDialog';
  import { onMount, onDestroy, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { account as accountStore } from '$lib/stores/account';
  import { localStore, storageErrorMessage, downloadLibraryBackup } from '$lib/services/datastore';
  import { openProject } from '$lib/services/projectOpening';
  import { createDefaultProject } from '$lib/stores/project';
  import WelcomeScreen from '$lib/components/WelcomeScreen.svelte';
  import LibraryRestoreDialog from '$lib/components/LibraryRestoreDialog.svelte';
  import ProjectPackageDialog from '$lib/components/ProjectPackageDialog.svelte';
  import ProjectActionsMenu from '$lib/components/ProjectActionsMenu.svelte';
  import PlanoraLoader from '$lib/components/PlanoraLoader.svelte';
  import { projectSettings, formatArea } from '$lib/stores/settings';
  import { houseTemplates } from '$lib/utils/houseTemplates';

  const openingLifetime = new AbortController();
  onDestroy(() => openingLifetime.abort());

  let projects = $state<{ id: string; name: string; updatedAt: string }[]>([]);
  let thumbnails = $state<Record<string, string | null>>({});
  let showWelcome = $state(false);
  let restoreOpen = $state(false);
  let packageOpen = $state(false);
  let loading = $state(true);
  let actionDialog = $state<{ type: 'rename' | 'delete'; id: string; name: string } | null>(null);
  let renameValue = $state('');
  let actionError = $state<string | null>(null);
  let actionBusy = $state(false);
  let duplicating = $state(false);
  let newProjectButton = $state<HTMLButtonElement>();
  let showTemplateModal = $state(false);
  const account = $derived($accountStore ? { ...$accountStore, isAdmin: false } : null);
  // Dashboard view state
  let query = $state('');
  let sortBy = $state<'recent' | 'name'>('recent');
  let menuOpen = $state(false);
  let menuRef = $state<HTMLDivElement>();
  const latest = $derived(projects[0] ?? null);
  const visibleProjects = $derived(projects
    .filter(p => (p.name || '').toLowerCase().includes(query.trim().toLowerCase()))
    .toSorted((a, b) => sortBy === 'name' ? (a.name || '').localeCompare(b.name || '') : new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
  const editedThisWeek = $derived(projects.filter(p => Date.now() - new Date(p.updatedAt).getTime() < 7 * 86_400_000).length);
  const initials = $derived((account?.name || 'P').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase());
  const greeting = $derived.by(() => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; });
  $effect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => { if (menuRef && !menuRef.contains(e.target as Node)) menuOpen = false; };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') menuOpen = false; };
    document.addEventListener('click', close, true); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('click', close, true); document.removeEventListener('keydown', esc); };
  });

  let libraryError = $state<string | null>(null);

  async function withLibraryError(action: () => Promise<void>) {
    try { await action(); libraryError = null; }
    catch (error) { libraryError = storageErrorMessage(error); }
  }

  async function backupLibrary() {
    try { await downloadLibraryBackup(); }
    catch (error) { libraryError = storageErrorMessage(error); }
  }

  async function refreshProjects() {
    loading = true;
    const loader = (async () => {
      projects = await localStore.list();
      projects.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      thumbnails = await localStore.getThumbnails();
    })();
    const timeout = new Promise<never>((_, reject) => {
      const handle = setTimeout(() => {
        reject(new Error('Browser storage is taking too long to respond. Try reloading the app.'));
      }, 15000);
      void loader.finally(() => clearTimeout(handle));
    });
    try {
      await Promise.race([loader, timeout]);
    } finally { loading = false; }
  }

  function openRestore() { showWelcome = false; restoreOpen = true; }
  function openPackage() { showWelcome = false; packageOpen = true; }
  async function afterRestore() {
    await refreshProjects();
    libraryError = null;
  }

  onMount(() => {
    void withLibraryError(async () => {
      await refreshProjects();
      const seen = localStorage.getItem('hasSeenWelcome');
      if (!seen && projects.length === 0) {
        showWelcome = true;
      }
    });
  });

  async function logOut() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      accountStore.set(null);
      window.location.href = '/login';
    } catch (error) {
      libraryError = storageErrorMessage(error);
    }
  }

  async function createProject(create: () => unknown) {
    await withLibraryError(async () => {
      const project = await openProject(create, 'new', openingLifetime.signal);
      if (!project) return;
      showTemplateModal = false;
      goto(`${base}/editor?id=${encodeURIComponent(project.id)}`);
    });
  }

  function createFromTemplate(index: number) { return createProject(houseTemplates[index].create); }
  function newProject() { return createProject(() => createDefaultProject('Untitled Project')); }

  async function duplicateProject(id: string) {
    if (duplicating) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    duplicating = true;
    await withLibraryError(async () => {
      const dup = await localStore.duplicate(id);
      if (!dup) throw new Error($t('library.gone'));
    });
    // Refresh errors must not turn a completed copy into a retryable mutation.
    if (!libraryError) await withLibraryError(refreshProjects);
    duplicating = false;
    await tick();
    if (document.activeElement === document.body && previous?.isConnected) previous.focus();
  }

  function openAction(type: 'rename' | 'delete', project: { id: string; name: string }) {
    actionDialog = { type, id: project.id, name: project.name || 'Untitled Project' };
    renameValue = project.name;
    actionError = null;
  }
  function closeAction() { if (!actionBusy) actionDialog = null; }
  async function submitAction() {
    const action = actionDialog, name = renameValue.trim();
    if (!action || actionBusy || (action.type === 'rename' && !name)) return;
    actionBusy = true; actionError = null;
    try {
      if (action.type === 'delete') await localStore.delete(action.id);
      else {
        const project = await localStore.load(action.id);
        if (!project) throw new Error($t('library.goneAction'));
        project.name = name;
        project.updatedAt = new Date();
        await localStore.save(project);
      }
    } catch (error) {
      actionError = storageErrorMessage(error);
      actionBusy = false;
      return;
    }
    actionBusy = false;
    actionDialog = null;
    // Close only after the transaction commits, then refresh separately so a
    // failed list read cannot repeat a successful rename or delete.
    await withLibraryError(refreshProjects);
    await tick();
    if (action.type === 'delete' && document.activeElement === document.body) newProjectButton?.focus();
  }

  function formatDate(d: string, language: Locale) {
    const date = new Date(d);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return translate(language, 'library.justNow');
    if (diffMin < 60) return translate(language, 'library.minutes', { count: diffMin });
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return translate(language, 'library.hours', { count: diffHr });
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return translate(language, 'library.days', { count: diffDay });
    return date.toLocaleDateString(language === 'pt' ? 'pt-BR' : language === 'ur' ? 'ur-PK' : 'en');
  }
</script>

{#if showWelcome}
  <WelcomeScreen onRestoreLibrary={openRestore} onImportPackage={openPackage} onDismiss={() => { showWelcome = false; void withLibraryError(refreshProjects); }} />
{/if}

{#if restoreOpen}<LibraryRestoreDialog onclose={() => restoreOpen = false} onrestored={afterRestore} />{/if}
{#if packageOpen}<ProjectPackageDialog onclose={() => packageOpen = false} onimported={afterRestore} />{/if}

<div class="min-h-screen bg-ivory text-charcoal">
  <!-- App header -->
  <header class="sticky top-0 z-30 border-b border-line bg-cream/90 backdrop-blur-md">
    <div class="mx-auto flex h-16 max-w-7xl items-center gap-4 px-6 max-sm:px-4">
      <a href={`${base}/dashboard`} class="flex items-center gap-2.5 text-charcoal no-underline">
        <span class="flex h-9 w-9 items-center justify-center rounded-[10px] bg-walnut" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 20V5h7a4.5 4.5 0 0 1 0 9H7" /><circle cx="17.5" cy="19" r="1.6" fill="#E7A37F" stroke="none" /></svg>
        </span>
        <span class="text-lg font-bold tracking-tight">Planora</span>
      </a>
      <nav class="ml-4 hidden items-center gap-1 md:flex" aria-label="Main">
        <span class="rounded-lg bg-walnut-tint px-3 py-1.5 text-sm font-semibold text-walnut-dark">Projects</span>
        <button class="rounded-lg px-3 py-1.5 text-sm font-semibold text-muted hover:bg-hover hover:text-charcoal" onclick={() => showTemplateModal = true}>{$t('library.templates')}</button>
        <a href={`${base}/ai`} class="rounded-lg px-3 py-1.5 text-sm font-semibold text-muted no-underline hover:bg-hover hover:text-charcoal">AI studio</a>
      </nav>
      <div class="ml-auto flex items-center gap-2.5">
        <a href={`${base}/ai`} class="flex h-10 items-center gap-2 rounded-[10px] border border-[#E9C6B3] bg-terracotta-tint px-4 text-sm font-semibold text-terracotta-ink no-underline transition-colors hover:border-terracotta max-sm:px-3">
          <AppIcon name="sparkles" size={16} /><span class="max-sm:hidden">Design with AI</span>
        </a>
        <button bind:this={newProjectButton} onclick={newProject}
          class="flex h-10 items-center gap-2 rounded-[10px] bg-walnut px-4 text-sm font-semibold text-white shadow-[0_1px_2px_rgba(40,50,40,0.25)] transition-colors hover:bg-walnut-dark max-sm:px-3">
          <AppIcon name="plus" size={16} strokeWidth={2.4} />{$t('library.new')}
        </button>
        <!-- Account menu: identity and library tools live here, not in the header -->
        <div class="relative" bind:this={menuRef}>
          <button class="flex h-10 items-center gap-2 rounded-full border border-line bg-white py-1 pl-1 pr-2.5 hover:bg-hover" aria-haspopup="menu" aria-expanded={menuOpen} aria-label="Account menu" onclick={() => menuOpen = !menuOpen}>
            <span class="flex h-8 w-8 items-center justify-center rounded-full bg-walnut text-xs font-bold text-white">{initials}</span>
            <AppIcon name="chevron-down" size={14} class="text-muted" />
          </button>
          {#if menuOpen}
            <div class="menu-panel absolute right-0 top-full z-40 mt-2 w-64 py-1.5" role="menu">
              {#if account}
                <div class="border-b border-line px-3 pb-2.5 pt-1.5">
                  <p class="truncate text-sm font-bold">{account.name}</p>
                  <p class="truncate text-xs text-muted">{account.email}</p>
                </div>
              {/if}
              <p class="menu-label mt-1">Library</p>
              {#if !libraryError}<button class="menu-item" role="menuitem" onclick={() => { menuOpen = false; void backupLibrary(); }}><AppIcon name="download" size={15} class="text-muted" />{$t('library.backup')}</button>{/if}
              <button class="menu-item" role="menuitem" onclick={() => { menuOpen = false; openRestore(); }}><AppIcon name="rotate-cw" size={15} class="text-muted" />{$t('library.restore')}</button>
              <button class="menu-item" role="menuitem" onclick={() => { menuOpen = false; openPackage(); }}><AppIcon name="package" size={15} class="text-muted" />{$t('library.package')}</button>
              <div class="my-1 h-px bg-line"></div>
              {#if account}
                <button class="menu-item" role="menuitem" onclick={logOut}><AppIcon name="circle-x" size={15} class="text-muted" />Log out</button>
              {:else}
                <a class="menu-item no-underline" role="menuitem" href={`${base}/login`}><AppIcon name="lock" size={15} class="text-muted" />Log in</a>
              {/if}
            </div>
          {/if}
        </div>
      </div>
    </div>
  </header>

  <main class="mx-auto max-w-7xl px-6 py-8 max-sm:px-4">
    <!-- Welcome + ways to start -->
    <section class="dash-hero relative overflow-hidden rounded-[22px] border border-line px-8 py-7 max-sm:px-5">
      <div class="relative z-10 max-w-xl">
        <p class="text-xs font-bold uppercase tracking-[0.12em] text-walnut">{greeting}</p>
        <p class="mt-1 text-[30px] font-bold leading-tight tracking-tight max-sm:text-[24px]">{account ? `Welcome back, ${account.name.split(' ')[0]}` : 'Welcome to Planora'}</p>
        <p class="mt-1.5 text-[15px] text-muted">Pick up where you left off, or start a new home — by hand or with AI.</p>
      </div>
      <div class="relative z-10 mt-6 grid grid-cols-3 gap-3 max-md:grid-cols-1">
        <button class="start-card" onclick={newProject}>
          <span class="start-icon bg-walnut-tint text-walnut-dark"><AppIcon name="pencil" size={20} /></span>
          <span><strong>Draw it yourself</strong><small>Blank plan in the 2D/3D editor</small></span>
        </button>
        <a class="start-card no-underline" href={`${base}/ai`}>
          <span class="start-icon bg-terracotta-tint text-terracotta-ink"><AppIcon name="sparkles" size={20} /></span>
          <span><strong>Design with AI</strong><small>Describe it, Planora lays it out</small></span>
        </a>
        <button class="start-card" onclick={() => showTemplateModal = true}>
          <span class="start-icon bg-sage-tint text-sage-ink"><AppIcon name="layout-grid" size={20} /></span>
          <span><strong>Start from a template</strong><small>Ready-made homes to adapt</small></span>
        </button>
      </div>
      <svg class="dash-hero-art" viewBox="0 0 320 220" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2"><rect x="20" y="20" width="280" height="180" /><path d="M150 20v110M20 110h80M130 110h170M210 110v90" /><path d="M100 110a30 30 0 0 1 30 30" stroke-dasharray="3 4" /></g></svg>
    </section>

    {#if duplicating}<p role="status" class="mt-4 text-sm text-muted">{$t('library.duplicating')}</p>{/if}
    {#if libraryError}
      <div role="alert" class="mt-6 rounded-[14px] border border-[#EBCDBD] bg-terracotta-tint p-4 text-sm text-charcoal">
        <p>{projectServiceMessage(libraryError, $locale)}</p>
        <div class="mt-3 flex gap-4">
          <button class="font-semibold text-walnut underline" onclick={() => withLibraryError(refreshProjects)}>{$t('library.retry')}</button>
          <button class="font-semibold text-walnut underline" onclick={backupLibrary}>{$t('library.backup')}</button>
        </div>
      </div>
    {/if}

    {#if loading && projects.length === 0}
      <div class="mt-8 h-80 overflow-hidden rounded-[20px] border border-line"><PlanoraLoader variant="inline" label={$t('library.loadingSaved')} /></div>
    {:else if projects.length === 0 && !libraryError}
      <div class="mt-8 rounded-[20px] border border-dashed border-line bg-cream px-6 py-16 text-center">
        <div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-walnut-tint text-walnut"><AppIcon name="house" size={30} strokeWidth={1.6} /></div>
        <h1 class="text-xl font-bold">{$t('library.title')}</h1>
        <p class="mt-1 text-sm text-muted">{$t('library.empty')} — {$t('library.emptyHelp')}</p>
      </div>
    {:else}
      <!-- Overview -->
      <section class="mt-8 grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-5 max-lg:grid-cols-1" aria-label="Overview">
        {#if latest}
          <article class="group relative flex overflow-hidden rounded-[20px] border border-line bg-cream max-sm:flex-col">
            <a href={`${base}/editor?id=${encodeURIComponent(latest.id)}`} class="plan-paper relative block w-[46%] shrink-0 overflow-hidden border-r border-line max-sm:w-full max-sm:border-b max-sm:border-r-0" aria-label={$t('library.openName', { name: latest.name || $t('library.untitled') })}>
              {#if thumbnails[latest.id]}<img src={thumbnails[latest.id]} alt="" class="h-full max-h-56 w-full object-contain p-3 transition-transform duration-500 group-hover:scale-[1.03]" />
              {:else}<div class="flex h-48 items-center justify-center text-[#B8A898]"><AppIcon name="house" size={48} strokeWidth={1.2} /></div>{/if}
            </a>
            <div class="flex min-w-0 flex-1 flex-col justify-between gap-4 p-6">
              <div>
                <span class="inline-flex items-center gap-1.5 rounded-full bg-walnut-tint px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-walnut-dark"><span class="h-1.5 w-1.5 rounded-full bg-walnut"></span>Continue working</span>
                <h2 class="mt-3 truncate text-[22px] font-bold tracking-tight">{latest.name || $t('library.untitled')}</h2>
                <p class="mt-1 flex items-center gap-1.5 text-sm text-muted"><AppIcon name="clock" size={14} />Edited {formatDate(latest.updatedAt, $locale)}</p>
              </div>
              <div class="flex flex-wrap gap-2">
                <a href={`${base}/editor?id=${encodeURIComponent(latest.id)}`} class="flex h-10 items-center gap-2 rounded-[10px] bg-walnut px-4 text-sm font-semibold text-white no-underline hover:bg-walnut-dark"><AppIcon name="pencil" size={15} />Open editor</a>
                <a href={`${base}/ai?id=${encodeURIComponent(latest.id)}`} class="flex h-10 items-center gap-2 rounded-[10px] border border-line bg-white px-4 text-sm font-semibold text-charcoal no-underline hover:bg-hover"><AppIcon name="sparkles" size={15} class="text-terracotta" />Continue with AI</a>
              </div>
            </div>
          </article>
        {/if}
        <div class="grid grid-cols-2 gap-3">
          <div class="stat-card"><AppIcon name="folders" size={18} class="text-walnut" /><strong>{projects.length}</strong><span>{projects.length === 1 ? 'Project' : 'Projects'}</span></div>
          <div class="stat-card"><AppIcon name="zap" size={18} class="text-terracotta" /><strong>{editedThisWeek}</strong><span>Edited this week</span></div>
          <div class="stat-card col-span-2"><AppIcon name={account ? 'check' : 'lock'} size={18} class="text-sage-ink" />
            <strong class="!text-base">{account ? 'Saved to your account' : 'Saved in this browser'}</strong>
            <span>{account ? 'Open your projects from any device after logging in.' : $t('library.local')}</span></div>
        </div>
      </section>

      <!-- All projects -->
      <section class="mt-10" aria-labelledby="all-projects">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 id="all-projects" class="text-xl font-bold tracking-tight">{$t('library.title')} <span class="ml-1 text-sm font-semibold text-muted">{projects.length}</span></h1>
          <div class="flex items-center gap-2">
            <label class="flex h-10 items-center gap-2 rounded-[10px] border border-line bg-white px-3 focus-within:border-walnut">
              <AppIcon name="search" size={15} class="text-muted" />
              <input bind:value={query} placeholder="Search projects" aria-label="Search projects" class="w-44 bg-transparent text-sm outline-none max-sm:w-28" />
            </label>
            <select bind:value={sortBy} aria-label="Sort projects" class="h-10 rounded-[10px] border border-line bg-white px-2 text-sm">
              <option value="recent">Last edited</option><option value="name">Name</option>
            </select>
          </div>
        </div>
        {#if visibleProjects.length === 0}
          <p class="rounded-[14px] border border-dashed border-line p-8 text-center text-sm text-muted">No projects match “{query}”.</p>
        {/if}
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {#each visibleProjects as project (project.id)}
            <div class="project-card group relative overflow-hidden rounded-[16px] border border-line bg-cream transition-all duration-200 hover:-translate-y-1 hover:border-[#C6D3C8] hover:shadow-[0_14px_34px_rgba(40,60,45,0.12)]">
              <a href={`${base}/editor?id=${encodeURIComponent(project.id)}`} aria-label={$t('library.openName', { name: project.name || $t('library.untitled') })} class="block">
                <div class="plan-paper relative aspect-[4/3] overflow-hidden border-b border-line">
                  {#if Object.hasOwn(thumbnails, project.id) && thumbnails[project.id]}
                    <img src={thumbnails[project.id]} alt="" class="h-full w-full object-contain p-2 transition-transform duration-500 group-hover:scale-[1.04]" />
                  {:else}
                    <div class="flex h-full w-full items-center justify-center text-[#B8A898]"><AppIcon name="house" size={40} strokeWidth={1.2} /></div>
                  {/if}
                  {#if project.id === latest?.id}<span class="absolute left-2.5 top-2.5 rounded-full bg-white/95 px-2 py-0.5 text-[10.5px] font-bold text-walnut-dark shadow-sm">Latest</span>{/if}
                </div>
              </a>
              <div class="px-4 pb-3.5 pt-3">
                <a href={`${base}/editor?id=${encodeURIComponent(project.id)}`} class="block no-underline"><h3 class="truncate ui-card-title">{project.name || $t('library.untitled')}</h3></a>
                <div class="mt-1 flex items-center justify-between gap-2">
                  <p class="flex items-center gap-1.5 ui-card-meta"><AppIcon name="clock" size={12} />{formatDate(project.updatedAt, $locale)}</p>
                  <div class="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <a href={`${base}/editor?id=${encodeURIComponent(project.id)}`} class="quick-btn" title="Open in editor" aria-label={`Open ${project.name || $t('library.untitled')} in editor`}><AppIcon name="pencil" size={14} /></a>
                    <a href={`${base}/ai?id=${encodeURIComponent(project.id)}`} class="quick-btn" title="Continue with AI" aria-label={`Continue ${project.name || $t('library.untitled')} with AI`}><AppIcon name="sparkles" size={14} /></a>
                  </div>
                </div>
              </div>
              <ProjectActionsMenu name={project.name} disabled={duplicating}
                onaction={(action) => {
                  if (action === 'open') goto(`${base}/editor?id=${encodeURIComponent(project.id)}`);
                  else if (action === 'duplicate') void duplicateProject(project.id);
                  else openAction(action, project);
                }} />
            </div>
          {/each}
        </div>
      </section>
    {/if}
  </main>

  {#if actionDialog}
    <dialog use:modalDialog aria-labelledby="library-action-title" aria-describedby="library-action-description"
      oncancel={(event) => { event.preventDefault(); closeAction(); }}
      class="m-auto w-[28rem] max-w-[calc(100vw-2rem)] max-h-[85vh] overflow-y-auto rounded-[18px] bg-cream p-6 text-charcoal shadow-2xl backdrop:bg-charcoal/50">
      <form onsubmit={(event) => { event.preventDefault(); void submitAction(); }}>
        <h2 id="library-action-title" class="text-lg font-semibold">{actionDialog.type === 'rename' ? $t('library.renameTitle') : $t('library.deleteTitle')}</h2>
        <p id="library-action-description" class="mt-2 break-words text-sm text-muted">
          {#if actionDialog.type === 'rename'}{$t('library.renameHelp', { name: actionDialog.name })}
          {:else}{$t('library.deleteHelp', { name: actionDialog.name })}{/if}
        </p>
        {#if actionDialog.type === 'rename'}
          <label for="library-project-name" class="mt-4 block text-sm font-medium">{$t('library.name')}</label>
          <input id="library-project-name" type="text" bind:value={renameValue} disabled={actionBusy} required
            class="mt-1 w-full rounded-[10px] border border-line bg-white px-3 py-2 text-sm text-charcoal outline-none focus:border-walnut focus:ring-2 focus:ring-walnut/15" />
        {/if}
        {#if actionError}<p role="alert" class="mt-4 rounded-[10px] bg-terracotta-tint p-3 text-sm text-charcoal">{projectServiceMessage(actionError, $locale)}</p>{/if}
        {#if actionBusy}<p role="status" class="mt-4 text-sm text-muted">{actionDialog.type === 'rename' ? $t('library.saving') : $t('library.deleting')}</p>{/if}
        <div class="mt-5 flex justify-end gap-3">
          <button type="button" onclick={closeAction} disabled={actionBusy} class="rounded-[10px] border border-line px-4 py-2 text-sm font-semibold text-charcoal hover:bg-hover disabled:opacity-40">{$t('library.cancel')}</button>
          <button type="submit" disabled={actionBusy || (actionDialog.type === 'rename' && !renameValue.trim())}
            class="rounded-[10px] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 {actionDialog.type === 'rename' ? 'bg-walnut hover:bg-walnut-dark' : 'bg-danger hover:bg-[#9E3D3B]'}">
            {actionDialog.type === 'rename' ? $t('library.saveName') : $t('library.deleteTitle')}
          </button>
        </div>
      </form>
    </dialog>
  {/if}

  <!-- Template Modal -->
  {#if showTemplateModal}
    <dialog use:modalDialog class="modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-charcoal/40 backdrop-blur-sm" aria-label={$t('welcome.templatesTitle')} onclick={(e) => { if (e.target === e.currentTarget) showTemplateModal = false; }} oncancel={(e) => { e.preventDefault(); showTemplateModal = false; }}>
      <div class="bg-cream rounded-[20px] border border-line shadow-2xl p-8 max-sm:p-5 max-w-xl w-full mx-4 max-h-[85vh] overflow-auto">
        <div class="flex items-center justify-between mb-2">
          <h2 class="text-2xl font-bold tracking-tight text-charcoal">{$t('welcome.templatesTitle')}</h2>
          <button aria-label={$t('library.closeTemplates')} onclick={() => showTemplateModal = false} class="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-hover hover:text-charcoal text-lg"><AppIcon name="x" size={16} /></button>
        </div>
        <p class="text-sm text-muted mb-6">{$t('welcome.templatesSubtitle')}</p>
        <div class="space-y-3">
          {#each houseTemplates as template, i}
            <button
              onclick={() => createFromTemplate(i)}
              class="w-full flex items-center gap-4 p-4 rounded-[14px] border border-line bg-white hover:border-walnut hover:bg-walnut-tint transition-colors text-left"
            >
              <span class="flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] bg-ivory text-walnut"><AppIcon name={template.icon} size={22} /></span>
              <div class="flex-1 min-w-0">
                <div class="ui-card-title">{templateLabels[template.name] ? $t(templateLabels[template.name].name) : template.name}</div>
                <div class="ui-card-meta">{templateLabels[template.name] ? $t(templateLabels[template.name].description) : template.description}</div>
              </div>
              <span class="text-xs font-semibold text-walnut bg-walnut-tint px-2 py-1 rounded-lg shrink-0">~{formatArea(template.area, $projectSettings.units)}</span>
            </button>
          {/each}
        </div>
      </div>
    </dialog>
  {/if}
</div>

<style>
  .dash-hero { background: linear-gradient(120deg, #FFFFFF 0%, #F3F8F2 60%, #EAF2E9 100%); }
  .dash-hero-art { position: absolute; right: -10px; top: -6px; width: 340px; color: rgba(82, 118, 91, 0.13); pointer-events: none; }
  .start-card { display: flex; align-items: center; gap: 12px; padding: 14px; border: 1px solid var(--color-line); border-radius: 14px; background: rgba(255,255,255,.85); text-align: left; color: var(--color-charcoal); transition: transform .2s, box-shadow .2s, border-color .2s; }
  .start-card:hover { transform: translateY(-2px); border-color: #C6D3C8; box-shadow: 0 10px 26px rgba(40, 60, 45, 0.10); }
  .start-card strong { display: block; font-size: 14px; } .start-card small { display: block; font-size: 12px; color: var(--color-muted); }
  .start-icon { display: flex; height: 42px; width: 42px; flex-shrink: 0; align-items: center; justify-content: center; border-radius: 12px; }
  .stat-card { display: flex; flex-direction: column; gap: 4px; padding: 16px; border: 1px solid var(--color-line); border-radius: 16px; background: var(--color-cream); }
  .stat-card strong { font-size: 26px; font-weight: 700; letter-spacing: -0.02em; } .stat-card span { font-size: 12.5px; color: var(--color-muted); }
  .quick-btn { display: flex; height: 28px; width: 28px; align-items: center; justify-content: center; border-radius: 8px; border: 1px solid var(--color-line); background: #fff; color: var(--color-charcoal); }
  .quick-btn:hover { background: var(--color-hover); }
</style>
