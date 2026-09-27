<script lang="ts">
  import AppIcon from '$lib/components/AppIcon.svelte';
  import { t, locale, translate, type Locale } from '$lib/i18n';
  import { projectServiceMessage } from '$lib/i18n/projectServiceMessages';
  import { templateLabels } from '$lib/i18n/templateLabels';
  import { modalDialog } from '$lib/utils/modalDialog';
  import { onMount, onDestroy, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { localStore, storageErrorMessage, downloadLibraryBackup } from '$lib/services/datastore';
  import { openProject } from '$lib/services/projectOpening';
  import { createDefaultProject } from '$lib/stores/project';
  import WelcomeScreen from '$lib/components/WelcomeScreen.svelte';
  import LibraryRestoreDialog from '$lib/components/LibraryRestoreDialog.svelte';
  import ProjectPackageDialog from '$lib/components/ProjectPackageDialog.svelte';
  import ProjectActionsMenu from '$lib/components/ProjectActionsMenu.svelte';
  import PlanoraLoader from '$lib/components/PlanoraLoader.svelte';
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
    try {
      projects = await localStore.list();
      projects.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      thumbnails = await localStore.getThumbnails();
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
    return date.toLocaleDateString(language === 'pt' ? 'pt-BR' : 'en');
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
          class="flex h-10 items-center gap-2 rounded-[10px] border border-[#E9C6B3] bg-terracotta-tint px-4 text-sm font-semibold text-terracotta-ink transition-colors hover:border-terracotta max-sm:px-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /></svg>
          <span class="max-sm:hidden">Design with AI</span><span class="sm:hidden">AI</span>
        </a>
        <button
          onclick={() => showTemplateModal = true}
          class="flex h-10 items-center gap-2 rounded-[10px] border border-line bg-cream px-4 text-sm font-semibold text-charcoal transition-colors hover:bg-hover max-sm:px-3"
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
        <p class="mt-1.5 text-sm text-muted">{$t('library.emptyHelp')}</p>
        <div class="mt-7 flex flex-wrap items-center justify-center gap-3">
          <button onclick={newProject} class="h-10 rounded-[10px] bg-walnut px-5 text-sm font-semibold text-white transition-colors hover:bg-walnut-dark">
            {$t('library.create')}
          </button>
          <button onclick={() => showTemplateModal = true} class="h-10 rounded-[10px] border border-line bg-cream px-5 text-sm font-semibold text-charcoal transition-colors hover:bg-hover">
            {$t('library.fromTemplate')}
          </button>
        </div>
      </div>
    {:else}
      <div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {#each projects as project (project.id)}
          <div class="group relative overflow-hidden rounded-[14px] border border-line bg-cream transition-all duration-200 hover:-translate-y-0.5 hover:border-[#CDBFB1] hover:shadow-[0_8px_30px_rgba(50,40,30,0.08)]">
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
                  <h3 class="truncate text-[15px] font-semibold text-charcoal">{project.name || $t('library.untitled')}</h3>
                </a>
                <p class="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
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

        <!-- Quick start: same action as New Project -->
        <button
          onclick={newProject}
          class="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-[14px] border-2 border-dashed border-line bg-transparent text-muted transition-colors hover:border-walnut hover:bg-cream hover:text-walnut"
        >
          <span class="flex h-11 w-11 items-center justify-center rounded-full bg-cream text-walnut shadow-sm" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </span>
          <span class="text-sm font-semibold">{$t('library.create')}</span>
        </button>
        <a href={`${base}/ai`}
          class="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-[14px] border-2 border-dashed border-[#E9C6B3] bg-transparent text-terracotta-ink no-underline transition-colors hover:border-terracotta hover:bg-terracotta-tint">
          <span class="flex h-11 w-11 items-center justify-center rounded-full bg-cream shadow-sm" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 17l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" /></svg>
          </span>
          <span class="text-sm font-semibold">Design with AI</span>
          <span class="-mt-2 text-xs text-muted">Describe it, Planora builds it</span>
        </a>
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
                <div class="font-semibold text-charcoal">{templateLabels[template.name] ? $t(templateLabels[template.name].name) : template.name}</div>
                <div class="text-xs text-muted">{templateLabels[template.name] ? $t(templateLabels[template.name].description) : template.description}</div>
              </div>
              <span class="text-xs font-semibold text-walnut bg-walnut-tint px-2 py-1 rounded-lg shrink-0">{template.area}</span>
            </button>
          {/each}
        </div>
      </div>
    </dialog>
  {/if}
</div>
