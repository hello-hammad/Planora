<script lang="ts">
  import AppIcon from '$lib/components/AppIcon.svelte';
  import { t, locale, translate, type Locale } from '$lib/i18n';
  import { projectServiceMessage } from '$lib/i18n/projectServiceMessages';
  import { templateLabels } from '$lib/i18n/templateLabels';
  import { modalDialog } from '$lib/utils/modalDialog';
  import { onMount, onDestroy, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { onAuthStateChanged, signOut } from 'firebase/auth';
  import { getPlanoraAuth } from '$lib/firebase';
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
  let account = $state<{ name: string; email: string; isAdmin: boolean } | null>(null);

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
    const auth = getPlanoraAuth();
    const stopAuthListener = auth && onAuthStateChanged(auth, async (user) => {
      if (!user) {
        account = null;
        return;
      }
      let isAdmin = false;
      try { isAdmin = (await user.getIdTokenResult()).claims.role === 'admin'; } catch {}
      account = { name: user.displayName || user.email?.split('@')[0] || 'Planora user', email: user.email || '', isAdmin };
    });
    if (stopAuthListener) onDestroy(stopAuthListener);
    void withLibraryError(async () => {
      await refreshProjects();
      const seen = localStorage.getItem('hasSeenWelcome');
      if (!seen && projects.length === 0) {
        showWelcome = true;
      }
    });
  });

  async function logOut() {
    const auth = getPlanoraAuth();
    if (!auth) return;
    try {
      await signOut(auth);
      account = null;
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
  <!-- Brand bar -->
  <header class="sticky top-0 z-20 border-b border-line bg-cream/90 backdrop-blur-md">
    <div class="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6 max-sm:px-4">
      <div class="flex items-center gap-2.5">
        <span class="flex h-9 w-9 items-center justify-center rounded-[10px] bg-walnut" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 20V5h7a4.5 4.5 0 0 1 0 9H7" /><circle cx="17.5" cy="19" r="1.6" fill="#E7A37F" stroke="none" /></svg>
        </span>
        <span class="text-lg font-bold tracking-tight">Planora</span>
      </div>
      <div class="flex items-center gap-2.5">
        <a href={`${base}/ai`}
          class="flex h-10 items-center gap-2 rounded-[10px] border border-[#E9C6B3] bg-terracotta-tint px-4 text-sm font-semibold text-terracotta-ink transition-colors hover:border-terracotta hover:bg-[#F8E2D5] max-sm:px-3">
          <AppIcon name="bot" size={16} />
          <span class="max-sm:hidden">Design with AI</span><span class="sm:hidden">AI</span>
        </a>
        <button
          onclick={() => showTemplateModal = true}
          class="flex h-10 items-center gap-2 rounded-[10px] border border-sage bg-sage-tint px-4 text-sm font-semibold text-sage-ink transition-colors hover:border-walnut hover:bg-walnut-tint max-sm:px-3"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
          {$t('library.templates')}
        </button>
        <button
          bind:this={newProjectButton}
          onclick={newProject}
          class="flex h-10 items-center gap-2 rounded-[10px] bg-walnut px-4 text-sm font-semibold text-white shadow-[0_1px_2px_rgba(50,40,30,0.2)] transition-colors hover:bg-walnut-dark max-sm:px-3"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          {$t('library.new')}
        </button>
        {#if account}
          <div class="hidden min-w-0 text-right sm:block">
            <p class="truncate text-sm font-semibold">{account.isAdmin ? 'Admin · ' : ''}{account.name}</p>
            <p class="truncate text-xs text-muted">{account.email}</p>
          </div>
          <button onclick={logOut} class="flex h-10 items-center rounded-[10px] border border-line px-3 text-sm font-semibold hover:bg-white">Log out</button>
        {:else}
          <a href={`${base}/login`} class="flex h-10 items-center rounded-[10px] border border-line px-3 text-sm font-semibold hover:bg-white">Log in</a>
        {/if}
      </div>
    </div>
  </header>

  <main class="mx-auto max-w-6xl px-6 py-10 max-sm:px-4 max-sm:py-7">
    <!-- Page heading + library utilities -->
    <div class="mb-8 flex flex-wrap items-end justify-between gap-5">
      <div>
        <h1 class="text-[34px] font-bold leading-tight tracking-tight max-sm:text-[28px]">{$t('library.title')}</h1>
        <p class="mt-1.5 text-[15px] text-muted">{loading ? $t('library.loading') : $t(projects.length === 1 ? 'library.countOne' : 'library.countMany', { count: projects.length })}</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        {#if !libraryError}
          <button class="lib-util" onclick={backupLibrary}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>
            {$t('library.backup')}
          </button>
        {/if}
        <button class="lib-util" onclick={openRestore}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"/></svg>
          {$t('library.restore')}
        </button>
        <button class="lib-util" onclick={openPackage}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 8l-9-5-9 5 9 5zM3 8v8l9 5 9-5V8M12 13v8"/></svg>
          {$t('library.package')}
        </button>
      </div>
    </div>

    <p class="mb-5 flex items-center gap-2 text-sm text-muted">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3"/></svg>
      {$t('library.local')}
    </p>

    {#if duplicating}<p role="status" class="mb-4 text-sm text-muted">{$t('library.duplicating')}</p>{/if}
    {#if libraryError}
      <div role="alert" class="mb-6 rounded-[14px] border border-[#EBCDBD] bg-terracotta-tint p-4 text-sm text-charcoal">
        <p>{projectServiceMessage(libraryError, $locale)}</p>
        <div class="mt-3 flex gap-4">
          <button class="font-semibold text-walnut underline" onclick={() => withLibraryError(refreshProjects)}>{$t('library.retry')}</button>
          <button class="font-semibold text-walnut underline" onclick={backupLibrary}>{$t('library.backup')}</button>
        </div>
      </div>
    {/if}
    {#if loading && projects.length === 0}
      <div class="h-80 overflow-hidden rounded-[20px] border border-line"><PlanoraLoader variant="inline" label={$t('library.loadingSaved')} /></div>
    {:else if projects.length === 0 && !libraryError}
      <div class="rounded-[20px] border border-line bg-cream px-6 py-20 text-center">
        <div class="mx-auto mb-5 flex h-20 w-24 items-center justify-center rounded-[14px] bg-walnut-tint">
          <svg width="56" height="42" viewBox="0 0 56 42" fill="none" stroke="#6B4636" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="50" height="36" /><path d="M24 3v20M3 23h14M31 23h22M24 30v9" /><path d="M17 23a7 7 0 0 1 7 7" stroke="#C96F4A" stroke-width="1.5" /></svg>
        </div>
        <p class="text-xl font-bold">{$t('library.empty')}</p>
        <p class="mt-1.5 ui-helper-text">{$t('library.emptyHelp')}</p>
      </div>
    {:else}
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {#each projects as project (project.id)}
          <div class="project-card group relative overflow-hidden rounded-[14px] border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(50,40,30,0.10)]">
            <!-- Thumbnail -->
            <a href={`${base}/editor?id=${encodeURIComponent(project.id)}`} aria-label={$t('library.openName', { name: project.name || $t('library.untitled') })} class="block">
              <div class="plan-paper relative aspect-[4/3] overflow-hidden border-b border-line">
                {#if Object.hasOwn(thumbnails, project.id) && thumbnails[project.id]}
                  <img src={thumbnails[project.id]} alt="" class="h-full w-full object-contain" />
                {:else}
                  <div class="flex h-full w-full items-center justify-center">
                    <svg width="72" height="54" viewBox="0 0 56 42" fill="none" stroke="#B8A898" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="50" height="36" /><path d="M24 3v20M3 23h14M31 23h22M24 30v9" /></svg>
                  </div>
                {/if}
              </div>
            </a>

            <!-- Info -->
            <div class="flex items-center justify-between gap-3 px-4 py-3.5">
              <div class="min-w-0">
                <a href={`${base}/editor?id=${encodeURIComponent(project.id)}`} class="block">
                  <h3 class="truncate ui-card-title">{project.name || $t('library.untitled')}</h3>
                </a>
                <p class="mt-0.5 flex items-center gap-1.5 ui-card-meta">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
                  {formatDate(project.updatedAt, $locale)}
                </p>
              </div>
              <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ivory text-walnut opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
              </span>
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
