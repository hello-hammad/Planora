<script lang="ts">
  import AppIcon from '$lib/components/AppIcon.svelte';
  import { t, locale } from '$lib/i18n';
  import { projectServiceMessage } from '$lib/i18n/projectServiceMessages';
  let { onToggleLayers, layersOpen = false, onToggleHistory, historyOpen = false }: { onToggleLayers?: () => void; layersOpen?: boolean; onToggleHistory?: (trigger: HTMLButtonElement) => void; historyOpen?: boolean } = $props();
  import { captureMain3DPNG } from '$lib/utils/captureMain3D';
  import ExportNotice from '$lib/components/ExportNotice.svelte';
  import { exportNotice, exportPNGWithFeedback, exportPDFWithFeedback as exportPDF } from '$lib/stores/exportNotice';
  import { modalDialog, hasOpenModal } from '$lib/utils/modalDialog';
  import { openProject } from '$lib/services/projectOpening';
  import { saveConflict, savingCopy, saveCurrentAsCopy } from '$lib/stores/saveStatus';
  import ImportError from '$lib/components/ImportError.svelte';
  import AssistantShareDialog from '$lib/components/AssistantShareDialog.svelte';
  import { onMount, onDestroy } from 'svelte';
  import { base } from '$app/paths';
  import { orderedFloors } from '$lib/utils/floors';
  import type { FloorSeed } from '$lib/stores/project';
  import { currentProject, viewMode, undo, redo, addFloor, removeFloor, setActiveFloor, updateProjectName, createDefaultProject, snapEnabled, canvasZoom, canvasMinimumZoom, panMode, showFurnitureStore, layerVisibility, activeFloor, selectedElementId, elevationWallId, elevationPickMode } from '$lib/stores/project';
  import { get } from 'svelte/store';
  import type { Floor } from '$lib/models/types';
  import { exportAsJSON, exportAsSVG } from '$lib/utils/export';
  import { exportDXF, exportDWG } from '$lib/utils/cadExport';
  import { createProjectFromRoomPlan, extractRoomJsonFromZip, isRoomPlanJson } from '$lib/utils/roomplanImport';
  import SettingsDialog from './SettingsDialog.svelte';
  import AreaSummaryPanel from '$lib/components/sidebar/AreaSummaryPanel.svelte';
  import { saveState, saveError, lastSavedAt, manualSave, autoSave, initAutoSave } from '$lib/stores/saveStatus';
  import { initVersionHistory, stopVersionHistory, snapshotOnAction } from '$lib/stores/versionHistory';
  import VersionHistoryPanel from './VersionHistoryPanel.svelte';
  import { projectSettings } from '$lib/stores/settings';

  const openingLifetime = new AbortController();
  onDestroy(() => openingLifetime.abort());

  let importError = $state<string | null>(null);
  let packageError = $state<string | null>(null);
  let assistantShareProject = $state<import('$lib/models/types').Project | null>(null);

  let settingsOpen = $state(false);
  let areaOpen = $state(false);
  let versionHistoryOpen = $state(false);

  let projectName = $state('');
  let mode = $state<'2d' | '3d'>('2d');
  let floors: Floor[] = $state([]);
  let activeFloorId = $state('');
  let editingName = $state(false);
  let exportOpen = $state(false);
  import { triggerTip } from '$lib/stores/onboarding.svelte';
  let snapOn = $state(true);
  let exportRef: HTMLDivElement;
  // Mobile (< md) overflow menu for secondary actions
  let moreOpen = $state(false);
  let moreRef: HTMLDivElement | undefined = $state();
  let moreButton: HTMLButtonElement;
  // Floor-seed menu on the desktop + button
  let floorMenuOpen = $state(false);
  let floorMenuRef: HTMLDivElement | undefined = $state();

  onDestroy(currentProject.subscribe((p) => {
    if (p) {
      projectName = p.name;
      floors = orderedFloors(p.floors).map(entry => entry.floor);
      activeFloorId = p.activeFloorId;
    }
  }));
  onDestroy(viewMode.subscribe((m) => { mode = m; }));

  function setMode(m: '2d' | '3d') {
    viewMode.set(m);
  }

  /** Switch the 2D canvas area to the integrated elevation view.
   *  With a wall selected it opens that wall; otherwise it stays in Plan and
   *  arms pick mode — the next wall clicked in the canvas opens its elevation.
   *  In 3D this switches back to 2D first. */
  function enterElevation() {
    if (mode === '3d') viewMode.set('2d');
    const floor = get(activeFloor);
    const selId = get(selectedElementId);
    const wall = selId ? floor?.walls.find((w) => w.id === selId) : undefined;
    if (wall) {
      elevationPickMode.set(false);
      selectedElementId.set(wall.id);
      elevationWallId.set(wall.id);
    } else {
      // No wall selected — prompt the user to pick one on the plan canvas
      elevationPickMode.update((v) => !v); // pressing again cancels
    }
    moreOpen = false;
  }

  /** Return the 2D canvas area to the plan view */
  function exitElevation() {
    elevationWallId.set(null);
    elevationPickMode.set(false);
    moreOpen = false;
  }

  /** Mobile overflow item: toggle between plan and elevation */
  function toggleElevationView() {
    if (get(elevationWallId)) exitElevation();
    else enterElevation();
  }

  function onNameBlur() {
    editingName = false;
    updateProjectName(projectName);
  }

  function onNameKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
  }

  function onAddFloor(seed: FloorSeed = 'outer') {
    addFloor(undefined, seed);
    floorMenuOpen = false;
    moreOpen = false;
  }

  function onRemoveFloor(id: string) {
    if (floors.length <= 1) return;
    removeFloor(id);
  }

  async function save() {
    await manualSave();
  }

  // Relative time for tooltip
  let secondsSinceSave = $state<number | null>(null);
  let lastSavedTime: Date | null = $state(null);
  onDestroy(lastSavedAt.subscribe(v => { lastSavedTime = v; updateLastSavedText(); }));
  const lastSavedText = $derived(secondsSinceSave === null ? $t('saveControls.never')
    : secondsSinceSave < 5 ? $t('saveControls.now')
    : secondsSinceSave < 60 ? $t('saveControls.seconds', { count: secondsSinceSave })
    : secondsSinceSave < 3600 ? $t('saveControls.minutes', { count: Math.floor(secondsSinceSave / 60) })
    : $t('saveControls.hours', { count: Math.floor(secondsSinceSave / 3600) }));

  function updateLastSavedText() {
    secondsSinceSave = lastSavedTime ? Math.floor((Date.now() - lastSavedTime.getTime()) / 1000) : null;
  }

  function onExport2DPNG() {
    const p = get(currentProject);
    if (p) void exportPNGWithFeedback(p);
    exportOpen = false;
  }

  let exporting3D = $state(false);
  async function onExport3DPNG() {
    if (exporting3D) return;
    const project = get(currentProject);
    const oldMode = mode;
    exporting3D = true; exportOpen = false; exportNotice.set(null);
    viewMode.set('3d');
    try {
      const blob = await captureMain3DPNG(openingLifetime.signal);
      const current = get(currentProject);
      if (current?.id !== project?.id || current?.activeFloorId !== project?.activeFloorId) return;
      const url = URL.createObjectURL(blob);
      try {
        const link = document.createElement('a');
        link.href = url; link.download = `${project?.name || 'floorplan'}-3d.png`; link.click();
      } finally { URL.revokeObjectURL(url); }
    } catch {
      if (!openingLifetime.signal.aborted) exportNotice.set({ title: 'exportNotice.png3DTitle', message: 'exportNotice.png3DFailed' });
    } finally {
      exporting3D = false;
      if (!openingLifetime.signal.aborted && oldMode === '2d' && get(viewMode) === '3d') viewMode.set('2d');
    }
  }

  function onExportJSON() {
    const p = get(currentProject);
    if (p) exportAsJSON(p);
    exportOpen = false;
  }

  async function onExportPackage() {
    const project = get(currentProject);
    exportOpen = false; packageError = null;
    if (!project) return;
    const snapshot = structuredClone(project);
    try {
      const { downloadProjectPackage } = await import('$lib/services/projectPackage');
      if (!openingLifetime.signal.aborted) downloadProjectPackage(snapshot);
    } catch (error) { packageError = error instanceof Error ? error.message : 'Could not export this project package.'; }
  }

  function onShareWithAssistant() {
    const project = get(currentProject);
    exportOpen = false;
    if (project) assistantShareProject = structuredClone(project);
  }

  function onExportSVG() {
    const p = get(currentProject);
    if (p) exportAsSVG(p, get(locale));
    exportOpen = false;
  }

  function onExportDXF() {
    const p = get(currentProject);
    if (p) exportDXF(p, get(locale));
    exportOpen = false;
  }

  function onExportDWG() {
    const p = get(currentProject);
    if (p) exportDWG(p, get(locale));
    exportOpen = false;
  }

  function onExportPDF() {
    const p = get(currentProject);
    if (p) exportPDF(p);
    exportOpen = false;
  }

  function onShareProject() {
    const p = get(currentProject);
    if (!p) return;
    const json = JSON.stringify(p, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${p.name || 'floorplan'}.openplan.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function newProject() {
    importError = null;
    exportOpen = false;
    try { await openProject(() => createDefaultProject(), 'new', openingLifetime.signal); }
    catch (error) { importError = error instanceof Error ? error.message : 'Could not open a new project.'; }
  }

  onMount(() => {
    const stopAutoSave = initAutoSave();
    initVersionHistory();
    const openSettings = () => { if (!hasOpenModal()) settingsOpen = true; };
    window.addEventListener('open-settings', openSettings);

    // Update relative timestamp every 15s
    const interval = setInterval(updateLastSavedText, 15000);

    function handleClickOutside(e: MouseEvent) {
      if (exportOpen && exportRef && !exportRef.contains(e.target as Node)) {
        exportOpen = false;
      }
      if (moreOpen && moreRef && !moreRef.contains(e.target as Node)) {
        moreOpen = false;
      }
      if (floorMenuOpen && floorMenuRef && !floorMenuRef.contains(e.target as Node)) {
        floorMenuOpen = false;
      }
    }
    function handleKeydown(e: KeyboardEvent) {
      if (hasOpenModal()) return;
      if (e.key !== 'Escape') return;
      if (exportOpen) exportOpen = false;
      if (e.key === 'Escape' && moreOpen) moreOpen = false;
      if (e.key === 'Escape' && floorMenuOpen) floorMenuOpen = false;
      if (e.key === 'Escape' && versionHistoryOpen) versionHistoryOpen = false;
      if (e.key === 'Escape' && areaOpen) areaOpen = false;
    }
    document.addEventListener('click', handleClickOutside, true);
    document.addEventListener('keydown', handleKeydown, true);
    return () => {
      window.removeEventListener('open-settings', openSettings);
      if (get(saveState) === 'unsaved') void autoSave();
      stopAutoSave();
      stopVersionHistory();
      document.removeEventListener('click', handleClickOutside, true);
      document.removeEventListener('keydown', handleKeydown, true);
      clearInterval(interval);
    };
  });

  function onImportJSON() {
    importError = null;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.zip';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        await openProject(async () => {
          const data = /\.zip$/i.test(file.name)
            ? await extractRoomJsonFromZip(file)
            : JSON.parse(await file.text());
          return isRoomPlanJson(data)
            ? createProjectFromRoomPlan(data, file.name.replace(/\.(json|zip)$/i, ''))
            : data;
        }, 'import', openingLifetime.signal);
      } catch (e: any) {
        const message = e?.message ?? 'Could not read this file.';
        importError = message.includes('No project was imported.') ? message : `${message} No project was imported.`;
      }
    };
    input.click();
    exportOpen = false;
  }
</script>

<div class="editor-topbar relative z-40 h-14 shrink-0 border-b border-line bg-cream text-charcoal flex items-center gap-3 px-3 max-2xl:gap-1.5 max-2xl:px-2">
  <!-- ── Left: brand, breadcrumb, project name, save status ── -->
  <div class="flex min-w-0 flex-1 items-center gap-1 max-2xl:gap-0.5">
    <span class="mr-1 hidden h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-walnut sm:flex" aria-hidden="true" title="Planora">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 20V5h7a4.5 4.5 0 0 1 0 9H7" /><circle cx="17.5" cy="19" r="1.6" fill="#E7A37F" stroke="none" /></svg>
    </span>

    <!-- Back to Projects -->
    <a
      href={base || '/'}
      class="flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-1 text-[13px] font-medium text-muted transition-colors hover:bg-hover hover:text-charcoal"
      title={$t('projectToolbar.back')}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
      <span class="hidden sm:inline">{$t('projectToolbar.projects')}</span>
    </a>

    <span class="text-sm text-line max-xl:hidden" aria-hidden="true">/</span>

    {#if editingName}
      <input
        type="text"
        aria-label={$t('projectToolbar.name')}
        bind:value={projectName}
        onblur={onNameBlur}
        onkeydown={onNameKeydown}
        class="h-8 w-44 shrink-0 rounded-lg border border-walnut bg-white px-2 text-sm font-semibold text-charcoal outline-none ring-2 ring-walnut/15"
      />
    {:else}
      <button
        class="min-w-[6rem] max-w-[10rem] flex-1 truncate rounded-lg px-1.5 py-1 text-sm font-semibold text-charcoal transition-colors hover:bg-hover max-xl:min-w-[4.5rem] max-xl:max-w-[7rem]"
        onclick={() => editingName = true}
        title={$t('projectToolbar.rename')}
      >{projectName}</button>
    {/if}

    <!-- Reserve the widest translated status so autosave cannot move toolbar targets. -->
    <span
      class="ml-1 inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-1 text-[10px] font-medium transition-colors duration-300 max-xl:hidden {$saveState === 'saved' ? 'bg-sage-tint text-sage-ink' : $saveState === 'saving' ? 'bg-terracotta-tint text-terracotta-ink' : 'bg-ivory text-muted'}"
      title={lastSavedText}
      aria-label={lastSavedText}
    >
      <span class="flex items-center gap-1 whitespace-nowrap {$saveState === 'saving' ? 'animate-pulse' : ''}">
        <span class="h-[7px] w-[7px] shrink-0 rounded-full {$saveState === 'saved' ? 'bg-[#6F8267]' : $saveState === 'saving' ? 'bg-terracotta' : 'bg-muted/60'}" aria-hidden="true"></span>
        <span>{#if $saveState === 'saving'}
            {$t('saveControls.saving')}
          {:else if $saveState === 'saved'}
            {$t('saveControls.saved')}
          {:else}
            {$t('saveControls.unsaved')}
          {/if}</span>
      </span>
    </span>
  </div>

  <!-- ── Centre: view switches and floors ── -->
  <div class="flex shrink-0 items-center gap-2 max-2xl:gap-1">
    <!-- 2D/3D switch -->
    <div class="flex gap-0.5 rounded-xl border border-line bg-ivory p-[3px] max-2xl:gap-0 max-2xl:p-0.5">
      <button
        onclick={() => setMode('2d')}
        class="h-8 rounded-[9px] px-3.5 text-[13px] font-semibold transition-colors max-2xl:px-2 max-2xl:text-xs {mode === '2d' ? 'bg-walnut text-white shadow-[0_1px_2px_rgba(50,40,30,0.2)]' : 'text-muted hover:text-charcoal'}"
      >2D</button>
      <button
        onclick={() => setMode('3d')}
        class="h-8 rounded-[9px] px-3.5 text-[13px] font-semibold transition-colors max-2xl:px-2 max-2xl:text-xs {mode === '3d' ? 'bg-walnut text-white shadow-[0_1px_2px_rgba(50,40,30,0.2)]' : 'text-muted hover:text-charcoal'}"
      >3D</button>
    </div>

    <div class="hidden items-center gap-0.5 rounded-xl border border-line bg-ivory p-[3px] md:flex max-2xl:gap-0 max-2xl:p-0.5" role="group" aria-label={$t('settings.metricsUnit')}>
      <button type="button" aria-pressed={$projectSettings.units === 'metric'} title={$t('settings.metric')}
        onclick={() => projectSettings.update(current => ({ ...current, units: 'metric' }))}
        class="h-8 rounded-[9px] px-2 text-[11px] font-semibold transition-colors max-2xl:px-1.5 max-2xl:text-[10px] {$projectSettings.units === 'metric' ? 'bg-walnut text-white shadow-sm' : 'text-muted hover:text-charcoal'}">{$t('settings.metric')}</button>
      <button type="button" aria-pressed={$projectSettings.units === 'imperial'} title={$t('settings.imperial')}
        onclick={() => projectSettings.update(current => ({ ...current, units: 'imperial' }))}
        class="h-8 rounded-[9px] px-2 text-[11px] font-semibold transition-colors max-2xl:px-1.5 max-2xl:text-[10px] {$projectSettings.units === 'imperial' ? 'bg-walnut text-white shadow-sm' : 'text-muted hover:text-charcoal'}">{$t('settings.imperial')}</button>
    </div>

    <!-- Plan / Elevation sub-switch (2D only); mobile uses the overflow menu instead -->
    {#if mode === '2d'}
      <div class="flex gap-0.5 rounded-xl border border-line bg-ivory p-[3px] max-xl:hidden">
        <button
          onclick={exitElevation}
          class="flex h-8 items-center gap-1 rounded-[9px] px-2.5 text-[13px] font-semibold transition-colors max-2xl:px-1.5 max-2xl:text-xs {!$elevationWallId ? 'bg-white text-charcoal shadow-[0_1px_2px_rgba(50,40,30,0.15)]' : 'text-muted hover:text-charcoal'}"
          title={$t('toolbarView.planHint')}
          aria-label={$t('toolbarView.plan')}
          aria-pressed={!$elevationWallId}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 12h8"/><path d="M11 12v9"/><path d="M15 3v6"/></svg>
          <span class="hidden 2xl:inline">{$t('toolbarView.plan')}</span>
        </button>
        <button
          onclick={enterElevation}
          class="flex h-8 items-center gap-1 rounded-[9px] px-2.5 text-[13px] font-semibold transition-colors max-2xl:px-1.5 max-2xl:text-xs {$elevationWallId ? 'bg-white text-charcoal shadow-[0_1px_2px_rgba(50,40,30,0.15)]' : $elevationPickMode ? 'bg-walnut-tint text-walnut-dark shadow-[0_1px_2px_rgba(50,40,30,0.12)]' : 'text-muted hover:text-charcoal'}"
          title={$elevationPickMode ? $t('toolbarView.pickHint') : $t('toolbarView.elevationHint')}
          aria-label={$t('toolbarView.elevation')}
          aria-pressed={!!$elevationWallId || $elevationPickMode}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l9-7 9 7v9H3z"/><rect x="10" y="14" width="4" height="6"/><rect x="5.5" y="13" width="3" height="3"/></svg>
          <span class="hidden 2xl:inline">{$t('toolbarView.elevation')}</span>
        </button>
      </div>
    {/if}

    <!-- Floor selector (in overflow menu on mobile) -->
    <div class="flex h-[38px] items-center rounded-[10px] border border-line bg-white max-2xl:h-8 max-xl:hidden">
      <span class="pl-2.5 text-walnut" aria-hidden="true">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5" /></svg>
      </span>
      <select aria-label={$t('floorControls.current')} value={activeFloorId} onchange={(e) => setActiveFloor(e.currentTarget.value)}
        class="h-full w-28 cursor-pointer bg-transparent pl-1.5 pr-1 text-[13px] font-semibold text-charcoal outline-none max-2xl:w-20 max-2xl:pl-1 max-2xl:text-[11px]" title={$t('floorControls.switch')}>
        {#each floors as fl}<option value={fl.id}>{fl.name}</option>{/each}
      </select>
      <span class="pr-1 text-[11px] font-medium text-muted max-2xl:text-[10px]">{floors.length}F</span>
      <div class="relative h-full border-l border-line" bind:this={floorMenuRef}>
        <button
          onclick={() => floorMenuOpen = !floorMenuOpen}
          class="flex h-full w-8 items-center justify-center rounded-r-[10px] text-base text-charcoal transition-colors hover:bg-hover max-2xl:w-7"
          title={$t('floorControls.add')}
          aria-label={$t('floorControls.add')}
          aria-expanded={floorMenuOpen}
        >+</button>
        {#if floorMenuOpen}
          <div class="menu-panel absolute left-0 top-full z-50 mt-1.5 w-64 py-1.5">
            <div class="menu-label">{$t('floorControls.top')}</div>
            <button class="menu-item" onclick={() => onAddFloor('outer')}>
              {$t('floorControls.exterior')} <span class="text-muted">{$t('floorControls.footprint')}</span>
            </button>
            <button class="menu-item" onclick={() => onAddFloor('copy')}>
              {$t('floorControls.all')} <span class="text-muted">{$t('floorControls.partitions')}</span>
            </button>
            <button class="menu-item" onclick={() => onAddFloor('empty')}>
              {$t('floorControls.empty')}
            </button>
            <hr class="my-1 border-line" />
            <button class="menu-item !text-danger disabled:opacity-40" disabled={floors.length <= 1}
              onclick={() => { onRemoveFloor(activeFloorId); floorMenuOpen = false; }}>{$t('floorControls.remove')}</button>
          </div>
        {/if}
      </div>
    </div>
  </div>

  <!-- ── Right: history, view toggles, panels, export, save ── -->
  <div class="flex shrink-0 items-center justify-end gap-1.5 xl:flex-1 max-xl:gap-1 max-2xl:gap-0.5">
    <div class="flex h-[38px] items-stretch overflow-hidden rounded-[10px] border border-line bg-white max-2xl:h-8">
      <button onclick={undo} class="flex w-9 items-center justify-center text-charcoal transition-colors hover:bg-hover max-2xl:w-8" title={$t('projectToolbar.undoHint')} aria-label={$t('projectToolbar.undo')}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3"/></svg>
      </button>
      <span class="w-px bg-line" aria-hidden="true"></span>
      <button onclick={redo} class="flex w-9 items-center justify-center text-charcoal transition-colors hover:bg-hover max-2xl:w-8" title={$t('projectToolbar.redoHint')} aria-label={$t('projectToolbar.redo')}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14l5-5-5-5M20 9H9a5 5 0 0 0 0 10h3"/></svg>
      </button>
      {#if onToggleHistory}
        <!-- Undo History (desktop); touch screens reach it from More actions -->
        <span class="w-px bg-line max-md:hidden" aria-hidden="true"></span>
        <button
          onclick={(e) => onToggleHistory?.(e.currentTarget)}
          class="flex w-9 items-center justify-center transition-colors max-md:hidden max-2xl:w-8 {historyOpen ? 'bg-walnut-tint text-walnut-dark' : 'text-charcoal hover:bg-hover'}"
          title={$t('undoHistory.title')}
          aria-label={$t('editorPanels.history')}
          aria-expanded={historyOpen}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h11M4 12h8M4 18h11M17 11l3 3-3 3" /></svg>
        </button>
      {/if}
    </div>

    <span class="mx-1 h-6 w-px bg-line max-xl:hidden" aria-hidden="true"></span>

    <!-- Snap to grid toggle -->
    <button
      onclick={() => { snapEnabled.update(v => !v); snapOn = !snapOn; }}
      class="icon-btn max-2xl:!h-8 max-2xl:!w-8 max-xl:hidden {snapOn ? 'icon-btn-on' : ''}"
      title={`${$t('toolbarView.snap')} (${snapOn ? $t('toolbarView.on') : $t('toolbarView.off')})`}
      aria-label={$t('toolbarView.snap')}
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
      </svg>
    </button>

    <!-- Select / Pan toggle (mobile pans with two fingers; toggle lives in overflow menu) -->
    {#if mode === '2d'}
      <button
        onclick={() => panMode.set(false)}
        class="icon-btn max-2xl:!h-8 max-2xl:!w-8 max-xl:hidden {!$panMode ? 'icon-btn-on' : ''}"
        title={$t('toolbarView.selectHint')}
        aria-label={$t('toolbarView.selectLabel')}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="M13 13l6 6"/></svg>
      </button>
    {/if}

    <!-- Furniture visibility toggle -->
    <button
      onclick={() => layerVisibility.update(v => ({ ...v, furniture: !v.furniture }))}
      class="icon-btn max-2xl:!h-8 max-2xl:!w-8 max-xl:hidden {$showFurnitureStore ? 'icon-btn-on' : ''}"
      title={`${$t('toolbarView.toggleFurniture')} (${$showFurnitureStore ? $t('toolbarView.visible') : $t('toolbarView.hidden')})`}
      aria-label={$t('toolbarView.toggleFurniture')}
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3M3 11h18v6H3zM5 17v2M19 17v2"/>
      </svg>
    </button>

    <span class="mx-1 h-6 w-px bg-line max-xl:hidden" aria-hidden="true"></span>

    <!-- Version History button -->
    <button
      onclick={() => versionHistoryOpen = true}
      class="icon-btn max-2xl:!h-8 max-2xl:!w-8 max-xl:hidden"
      title={$t('versions.title')}
      aria-label={$t('versions.title')}
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>
    </button>

    <!-- Area summary button -->
    <button
      onclick={() => areaOpen = true}
      class="icon-btn max-2xl:!h-8 max-2xl:!w-8 max-xl:hidden"
      title={$t('areaSummary.title')}
      aria-label={$t('areaSummary.title')}
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v16H4zM8 8l8 8M12 8l4 4M8 12l4 4"/></svg>
    </button>

    <!-- Settings button -->
    <button
      onclick={() => settingsOpen = true}
      class="icon-btn max-2xl:!h-8 max-2xl:!w-8 max-xl:hidden"
      title={$t('settings.title')}
      aria-label={$t('settings.title')}
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4"/></svg>
    </button>

    <!-- Overflow menu (below xl): secondary actions hidden from the condensed bar -->
    <div class="relative xl:hidden" bind:this={moreRef}>
      <button
        bind:this={moreButton}
        onclick={() => moreOpen = !moreOpen}
        class="icon-btn max-2xl:!h-8 max-2xl:!w-8 {moreOpen ? 'icon-btn-on' : ''}"
        title={$t('toolbarView.more')}
        aria-label={$t('toolbarView.moreActions')}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
      </button>
      {#if moreOpen}
        <div class="menu-panel absolute right-0 top-full z-50 mt-1.5 max-h-[70vh] w-60 overflow-y-auto py-1.5">
          {#if floors.length > 1 || mode === '2d'}
            <div class="menu-label">{$t('floorControls.floors')}</div>
            {#each floors as fl}
              <button class="menu-item {fl.id === activeFloorId ? '!font-semibold !text-walnut' : ''}" onclick={() => { setActiveFloor(fl.id); moreOpen = false; }}>
                {fl.name}{#if fl.id === activeFloorId}<AppIcon name="check" size={14} class="ml-auto" />{/if}
              </button>
            {/each}
            <button class="menu-item" onclick={() => { onAddFloor('outer'); }}>+ {$t('floorControls.add')} <span class="text-muted">{$t('floorControls.outerHint')}</span></button>
            <button class="menu-item" onclick={() => { onAddFloor('copy'); }}>+ {$t('floorControls.add')} <span class="text-muted">{$t('floorControls.allHint')}</span></button>
            <button class="menu-item" onclick={() => { onAddFloor('empty'); }}>+ {$t('floorControls.add')} <span class="text-muted">{$t('floorControls.emptyHint')}</span></button>
            <button class="menu-item !text-danger disabled:opacity-40" disabled={floors.length <= 1}
              onclick={() => { onRemoveFloor(activeFloorId); moreOpen = false; }}>{$t('floorControls.remove')}</button>
            <div class="my-1 h-px bg-line"></div>
          {/if}
          {#if mode === '2d'}
            <div class="menu-label">{$t('toolbarView.view')}</div>
            <button class="menu-item" onclick={() => canvasZoom.update(z => Math.min(10, z * 1.25))}>{$t('toolbarView.zoomIn')}</button>
            <button class="menu-item" onclick={() => canvasZoom.update(z => Math.max($canvasMinimumZoom, z / 1.25))}>{$t('toolbarView.zoomOut')}</button>
            <button class="menu-item" onclick={() => canvasZoom.set(1)}>{$t('toolbarView.resetZoom')} ({$canvasZoom < 0.01 ? ($canvasZoom * 100).toPrecision(2) : Math.round($canvasZoom * 100)}%)</button>
            <button class="menu-item" onclick={() => panMode.update(v => !v)}><span class="w-4">{#if $panMode}<AppIcon name="check" size={14} />{/if}</span>{$t('toolbarView.pan')}</button>
            <button class="menu-item" onclick={() => { snapEnabled.update(v => !v); snapOn = !snapOn; }}><span class="w-4">{#if snapOn}<AppIcon name="check" size={14} />{/if}</span>{$t('toolbarView.snap')}</button>
            <button class="menu-item" onclick={() => layerVisibility.update(v => ({ ...v, furniture: !v.furniture }))}><span class="w-4">{#if $showFurnitureStore}<AppIcon name="check" size={14} />{/if}</span>{$t('toolbarView.showFurniture')}</button>
            {#if onToggleLayers}
              <button class="menu-item" aria-pressed={layersOpen} onclick={() => { onToggleLayers?.(); moreOpen = false; }}>{$t('layers.title')}</button>
            {/if}
            <div class="my-1 h-px bg-line"></div>
          {/if}
          <div class="menu-label">{$t('settings.metricsUnit')}</div>
          <button class="menu-item" aria-pressed={$projectSettings.units === 'metric'} onclick={() => projectSettings.update(current => ({ ...current, units: 'metric' }))}>
            <span class="w-4">{#if $projectSettings.units === 'metric'}<AppIcon name="check" size={14} />{/if}</span>{$t('settings.metric')}
          </button>
          <button class="menu-item" aria-pressed={$projectSettings.units === 'imperial'} onclick={() => projectSettings.update(current => ({ ...current, units: 'imperial' }))}>
            <span class="w-4">{#if $projectSettings.units === 'imperial'}<AppIcon name="check" size={14} />{/if}</span>{$t('settings.imperial')}
          </button>
          <div class="my-1 h-px bg-line"></div>
          <button class="menu-item" onclick={toggleElevationView}><span class="w-4">{#if $elevationWallId}<AppIcon name="check" size={14} />{/if}</span>{$t('toolbarView.elevationView')}</button>
          {#if onToggleHistory}
            <button class="menu-item md:hidden" aria-expanded={historyOpen} aria-label={$t('editorPanels.history')} onclick={() => { onToggleHistory?.(moreButton); moreOpen = false; }}>{$t('undoHistory.title')}</button>
          {/if}
          <button class="menu-item" onclick={() => { versionHistoryOpen = true; moreOpen = false; }}>{$t('versions.title')}</button>
          <button class="menu-item" onclick={() => { areaOpen = true; moreOpen = false; }}>{$t('areaSummary.title')}</button>
          <button class="menu-item" onclick={() => { settingsOpen = true; moreOpen = false; }}>{$t('settings.title')}</button>
        </div>
      {/if}
    </div>

    <span class="mx-1 h-6 w-px bg-line max-xl:hidden" aria-hidden="true"></span>

    <!-- Export dropdown -->
    <div class="relative" bind:this={exportRef}>
      <button
        onclick={() => { exportOpen = !exportOpen; if (exportOpen) triggerTip('first-export', 300, 60); }}
        class="flex h-[38px] items-center gap-1.5 rounded-[10px] border border-line bg-cream px-3 text-[13px] font-semibold text-charcoal transition-colors hover:bg-hover max-xl:px-2.5 max-2xl:h-8 max-2xl:gap-1 max-2xl:px-2 max-2xl:text-xs {exportOpen ? 'bg-hover' : ''}"
        title={$t('exportMenu.title')}
        aria-label={$t('exportMenu.title')}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>
        <span class="hidden 2xl:inline">{$t('exportMenu.title')}</span>
      </button>
      {#if exportOpen}
        <div class="menu-panel absolute right-0 top-full z-50 mt-1.5 w-60 py-1.5">
          <button class="menu-item" onclick={() => { exportOpen = false; window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', ctrlKey: true })); }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="text-muted"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            {$t('print.entry')}
          </button>
          <div class="my-1 h-px bg-line"></div>
          <button class="menu-item" onclick={onExport2DPNG}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="text-muted"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
            {$t('exportMenu.png2d')}
          </button>
          <button class="menu-item" onclick={onExport3DPNG} disabled={exporting3D}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="text-muted"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
            {$t('exportMenu.png3d')}
          </button>
          <button class="menu-item" onclick={onExportSVG}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="text-muted"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>
            {$t('exportMenu.svg')}
          </button>
          <button class="menu-item" onclick={onExportDXF}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="text-muted"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 16h2"/><path d="M14 16h2"/></svg>
            {$t('exportMenu.dxf')}
          </button>
          <button class="menu-item" onclick={onExportDWG}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="text-muted"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 16h6"/></svg>
            {$t('exportMenu.dwg')}
          </button>
          <button class="menu-item" onclick={onExportPDF}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="text-muted"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 11v6"/><path d="M8 11v6"/><path d="M12 11v6"/></svg>
            {$t('exportMenu.pdf')}
          </button>
          <button class="menu-item" onclick={onExportJSON}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="text-muted"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
            {$t('exportMenu.json')}
          </button>
          <button class="menu-item" onclick={onExportPackage}>{$t('exportMenu.package')}</button>
          <p class="px-3 pb-2 text-xs text-muted">{$t('exportMenu.packageHelp')}</p>
          <button class="menu-item" onclick={onShareWithAssistant}>{$t('exportMenu.assistant')}</button>
          <div class="my-1 h-px bg-line"></div>
          <button class="menu-item" onclick={onImportJSON}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="text-muted"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            {$t('exportMenu.import')}
          </button>
          <button class="menu-item" onclick={newProject}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="text-muted"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            {$t('library.new')}
          </button>
        </div>
      {/if}
    </div>

    <button onclick={save} class="h-[38px] rounded-[10px] bg-walnut px-4 text-[13px] font-semibold text-white shadow-[0_1px_2px_rgba(50,40,30,0.2)] transition-colors hover:bg-walnut-dark max-xl:px-3 max-2xl:h-8 max-2xl:px-2.5 max-2xl:text-xs">
      {$t('saveControls.save')}
    </button>
  </div>
</div>

{#if $saveError}
  <div role="alert" class="flex flex-wrap items-center gap-3 bg-red-50 border-b border-red-200 px-4 py-3 text-sm text-red-900">
    <span class="flex-1 min-w-48">{$t('saveControls.error')} {projectServiceMessage($saveError, $locale)}</span>
    {#if $saveConflict}
      <button class="font-semibold underline disabled:opacity-50" disabled={$savingCopy} onclick={saveCurrentAsCopy}>{$savingCopy ? $t('saveControls.savingCopy') : $t('saveControls.copy')}</button>
    {:else}
      <button class="font-semibold underline" onclick={save}>{$t('saveControls.retry')}</button>
    {/if}
    <button class="font-semibold underline" onclick={onExportJSON}>{$t('saveControls.backup')}</button>
  </div>
{/if}

<SettingsDialog bind:open={settingsOpen} />
<VersionHistoryPanel bind:open={versionHistoryOpen} />

{#if areaOpen}
<dialog use:modalDialog class="modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/40" aria-label={$t('areaSummary.title')} onclick={(e) => { if (e.target === e.currentTarget) areaOpen = false; }} oncancel={(e) => { e.preventDefault(); areaOpen = false; }}>
  <div class="bg-cream rounded-[14px] shadow-2xl w-[420px] max-w-[calc(100vw-2rem)] max-h-[80vh] overflow-hidden">
    <div class="flex items-center justify-between px-5 py-3 border-b border-line">
      <h2 class="text-base font-bold text-charcoal">{$t('areaSummary.title')}</h2>
      <button aria-label={$t('areaSummary.close')} onclick={() => areaOpen = false} class="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-hover hover:text-charcoal text-xl leading-none">&times;</button>
    </div>
    <div class="overflow-y-auto max-h-[calc(80vh-52px)] p-1">
      <AreaSummaryPanel />
    </div>
  </div>
</dialog>
{/if}

{#if importError}
  <ImportError title={$t('projectToolbar.openError')} message={importError} onDismiss={() => importError = null} />
{/if}
{#if packageError}<ImportError title={$t('projectToolbar.packageError')} message={packageError} onDismiss={() => packageError = null} />{/if}
{#if assistantShareProject}<AssistantShareDialog project={assistantShareProject} onclose={() => assistantShareProject = null} />{/if}

<ExportNotice />
