<script lang="ts">
  import AppIcon from '$lib/components/AppIcon.svelte';
  import { furnitureName } from '$lib/i18n/furnitureNames';
  import { t, locale } from '$lib/i18n';
  import { entourageLabels } from '$lib/i18n/entourageLabels';
  import { catalogCategoryLabels, normalizeCatalogSearch } from '$lib/i18n/catalogCategories';
  import { roomPresetLabels, roomTemplateLabels } from '$lib/i18n/roomLabels';
  import { modalDialog } from '$lib/utils/modalDialog';
  import { openProject } from '$lib/services/projectOpening';
  import ImportError from '$lib/components/ImportError.svelte';
  import { onDestroy } from 'svelte';
  import { activateMeasurementTool, selectedTool, placingFurnitureId, placingDoorType, placingWindowType, placingStair, addStair, placingColumn, placingColumnShape, activeFloor, setBackgroundImage, canvasCamX, canvasCamY, placingEntourageId, addCustomEntourage } from '$lib/stores/project';
  import type { Tool } from '$lib/stores/project';
  import type { Door, Window as Win, CustomEntourageDef } from '$lib/models/types';
  import { entourageCatalog, entourageCategories } from '$lib/utils/entourageCatalog';
  import { roomPresets, placePreset } from '$lib/utils/roomPresets';
  import { roomTemplates, placeRoomTemplate } from '$lib/utils/roomTemplates';
  import { furnitureCatalog, furnitureCategories } from '$lib/utils/furnitureCatalog';
  import type { FurnitureDef } from '$lib/utils/furnitureCatalog';
  import FurnitureThumbnail from './FurnitureThumbnail.svelte';
  import CustomModelPanel from './CustomModelPanel.svelte';
  import FinishesPanel from './FinishesPanel.svelte';
  import BoardsPanel from './BoardsPanel.svelte';
  import AssistantChat from '$lib/components/ai/AssistantChat.svelte';
  import { createProjectFromRoomPlan, extractRoomJsonFromZip, roomPlanImportOptions, validateRoomPlan, ORTHO_VERSION } from '$lib/utils/roomplanImport';
  import { currentProject } from '$lib/stores/project';

  type PanelTab = 'draw' | 'rooms' | 'objects' | 'finishes' | 'boards' | 'assistant';
  let { initialTab = 'draw', onClose }: { initialTab?: PanelTab; onClose?: () => void } = $props();
  let panelRoot = $state<HTMLDivElement>();

  const openingLifetime = new AbortController();
  onDestroy(() => openingLifetime.abort());

  let importError = $state<string | null>(null);

  // AreaSummaryPanel moved to top bar dialog
  let activeTab = $state<PanelTab>('draw');
  $effect(() => { activeTab = initialTab; });
  let constructionOpen = $state(true);
  let selectedCategory = $state<string>('All');
  // RoomPlan import dialog state
  let showImportDialog = $state(false);
  let importFileName = $state('');
  let importJsonData: any = $state(null);
  let optStraighten = $state(true);
  let optOrthogonal = $state(true);
  let optMergeDistance = $state(15);

  function setTool(tool: Tool) {
    if (tool === 'measure' || tool === 'annotate') activateMeasurementTool(tool);
    else selectedTool.set(tool);
    placingFurnitureId.set(null);
  }

  let currentTool = $state<Tool>('select');
  onDestroy(selectedTool.subscribe((t) => { currentTool = t; }));

  let currentPlacing = $state<string | null>(null);
  onDestroy(placingFurnitureId.subscribe((id) => { currentPlacing = id; }));

  function onPresetClick(presetId: string, templateName?: string) {
    const preset = roomPresets.find(p => p.id === presetId);
    if (preset) {
      let cx = 0, cy = 0;
      canvasCamX.subscribe(v => { cx = v; })();
      canvasCamY.subscribe(v => { cy = v; })();
      const template = templateName ? roomTemplates.find(t => t.name === templateName) ?? null : null;
      placeRoomTemplate(preset, { x: cx, y: cy }, template);
    }
  }

  function onFurnitureClick(item: FurnitureDef) {
    selectedTool.set('furniture');
    placingFurnitureId.set(item.id);
    addToRecent(item.id);
  }

  let withFurniture = $state(true);

  let search = $state('');

  // --- Recent Items (localStorage) ---
  const RECENT_KEY = 'o3d_recent_furniture';
  const MAX_RECENT = 10;
  let recentIds = $state<string[]>((() => {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
  })());

  function addToRecent(id: string) {
    recentIds = [id, ...recentIds.filter(r => r !== id)].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(recentIds));
  }

  let recentItems = $derived(
    recentIds.map(id => furnitureCatalog.find(f => f.id === id)).filter(Boolean) as FurnitureDef[]
  );

  // --- Favorites (localStorage) ---
  const FAV_KEY = 'o3d_favorite_furniture';
  let favoriteIds = $state<string[]>((() => {
    try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch { return []; }
  })());

  function toggleFavorite(id: string) {
    if (favoriteIds.includes(id)) {
      favoriteIds = favoriteIds.filter(f => f !== id);
    } else {
      favoriteIds = [...favoriteIds, id];
    }
    localStorage.setItem(FAV_KEY, JSON.stringify(favoriteIds));
  }

  let favoriteItems = $derived(
    favoriteIds.map(id => furnitureCatalog.find(f => f.id === id)).filter(Boolean) as FurnitureDef[]
  );

  let filtered = $derived(
    (() => {
      const s = normalizeCatalogSearch(search);
      let items = selectedCategory === 'Favorites'
        ? favoriteItems
        : furnitureCatalog.filter((f) => {
            const matchCat = selectedCategory === 'All' || f.category === selectedCategory;
            return matchCat;
          });
      if (s) {
        items = items.filter(f => [f.name, furnitureName(f.id, $locale), f.category, catalogCategoryLabels[f.category] ? $t(catalogCategoryLabels[f.category]) : f.category]
          .some(value => normalizeCatalogSearch(value).includes(s)));
      }
      return items;
    })()
  );

  const doorCatalog: { type: Door['type']; name: string; desc: string; icon: string }[] = $derived([
    { type: 'single', name: $t('openingCatalog.single'), desc: $t('openingCatalog.singleDescription'), icon: 'M6 3h12v18H6z' },
    { type: 'double', name: $t('openingCatalog.double'), desc: $t('openingCatalog.doubleDescription'), icon: 'M3 3h8v18H3zM13 3h8v18h-8z' },
    { type: 'sliding', name: $t('openingCatalog.sliding'), desc: $t('openingCatalog.slidingDescription'), icon: 'M3 6h18v12H3z' },
    { type: 'french', name: $t('openingCatalog.french'), desc: $t('openingCatalog.frenchDescription'), icon: 'M3 3h8v18H3zM13 3h8v18h-8z' },
    { type: 'pocket', name: $t('openingCatalog.pocket'), desc: $t('openingCatalog.pocketDescription'), icon: 'M6 3h12v18H6z' },
    { type: 'bifold', name: $t('openingCatalog.bifold'), desc: $t('openingCatalog.bifoldDescription'), icon: 'M3 3h5v18H3zM9 3h6v18H9zM16 3h5v18h-5z' },
    { type: 'opening', name: $t('openingCatalog.doorway'), desc: $t('openingCatalog.doorwayDescription'), icon: 'M6 3h2v18H6zM16 3h2v18h-2z' },
    { type: 'garage', name: $t('openingCatalog.garage'), desc: $t('openingCatalog.garageDescription'), icon: 'M3 5h18v14H3zM5 9h14M5 13h14M5 17h14' },
  ]);

  const windowCatalog: { type: Win['type']; name: string; desc: string }[] = $derived([
    { type: 'standard', name: $t('openingCatalog.standard'), desc: '120×120cm' },
    { type: 'fixed', name: $t('openingCatalog.fixed'), desc: '100×100cm' },
    { type: 'casement', name: $t('openingCatalog.casement'), desc: '80×130cm' },
    { type: 'sliding', name: $t('openingCatalog.sliding'), desc: '180×120cm' },
    { type: 'bay', name: $t('openingCatalog.bay'), desc: '200×150cm' },
  ]);

  let selectedDoorType = $state<Door['type']>('single');
  let selectedWindowType = $state<Win['type']>('standard');

  function setDoorType(type: Door['type']) {
    selectedDoorType = type;
    placingDoorType.set(type);
    setTool('door');
  }

  function setWindowType(type: Win['type']) {
    selectedWindowType = type;
    placingWindowType.set(type);
    setTool('window');
  }

  let isPlacingStair = $state(false);
  onDestroy(placingStair.subscribe(v => { isPlacingStair = v; }));

  // Entourage (2D presentation symbols)
  let placingEntId = $state<string | null>(null);
  onDestroy(placingEntourageId.subscribe(v => { placingEntId = v; }));
  let customEntDefs = $state<CustomEntourageDef[]>([]);
  onDestroy(currentProject.subscribe(p => { customEntDefs = p?.customEntourage ?? []; }));
  let entourageFileInput = $state<HTMLInputElement | null>(null);

  function armEntourage(id: string) {
    placingEntourageId.set(placingEntId === id ? null : id);
    setTool('select');
  }

  let symbolUploadError = $state<'tooLarge' | 'readFailed' | 'invalid' | null>(null);

  function onEntourageUpload(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    symbolUploadError = null;
    if (file.size > 2 * 1024 * 1024) { symbolUploadError = 'tooLarge'; return; }
    const reader = new FileReader();
    reader.onerror = () => { symbolUploadError = 'readFailed'; };
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onerror = () => { symbolUploadError = 'invalid'; };
      img.onload = () => {
        const aspect = img.naturalHeight / img.naturalWidth || 1;
        const id = addCustomEntourage(file.name.replace(/\.[^.]+$/, ''), dataUrl, aspect);
        placingEntourageId.set(id);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  let isPlacingColumn = $state(false);
  onDestroy(placingColumn.subscribe(v => { isPlacingColumn = v; }));

  function onPlaceStair() {
    placingStair.set(true);
    selectedTool.set('select');
    placingFurnitureId.set(null);
  }

  function onPlaceColumn(shape: 'round' | 'square') {
    placingColumn.set(true);
    placingColumnShape.set(shape);
    selectedTool.set('select');
    placingFurnitureId.set(null);
  }

  function onImportImage() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        alert('Warning: Image is larger than 5MB. This may slow down the application.');
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setBackgroundImage({
          dataUrl,
          position: { x: 0, y: 0 },
          scale: 1,
          opacity: 0.4,
          rotation: 0,
          locked: false,
        });
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  async function onImportRoomPlan() {
    importError = null;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.zip';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        let jsonData: any;
        if (/\.zip$/i.test(file.name)) {
          jsonData = await extractRoomJsonFromZip(file);
        } else {
          const text = await file.text();
          jsonData = JSON.parse(text);
        }
        validateRoomPlan(jsonData);
        const options = roomPlanImportOptions(jsonData);
        optStraighten = options.straighten ?? true;
        optOrthogonal = options.orthogonal ?? true;
        optMergeDistance = options.mergeDistance ?? 15;
        importJsonData = jsonData;
        importFileName = file.name.replace(/\.(json|zip)$/, '');
        showImportDialog = true;
      } catch (e: any) {
        importError = e.message;
      }
    };
    input.click();
  }

  async function confirmImport() {
    if (!importJsonData) return;
    const input = importJsonData;
    importError = null;
    try {
      // Create a new project for the imported data instead of merging into current
      const projectName = importFileName ? importFileName.replace(/\.(json|zip)$/i, '') : 'RoomPlan Import';
      await openProject(() => createProjectFromRoomPlan(input, projectName, {
        straighten: optStraighten,
        orthogonal: optOrthogonal,
        mergeDistance: optMergeDistance,
      }), 'import', openingLifetime.signal);
    } catch (e: any) {
      if (importJsonData === input) importError = e.message;
    }
    if (importJsonData === input) {
      showImportDialog = false;
      importJsonData = null;
    }
  }

  function cancelImport() {
    showImportDialog = false;
    importJsonData = null;
  }

  // --- Hover Preview Tooltip ---
  let hoveredItem = $state<FurnitureDef | null>(null);
  let hoverTimeout = $state<ReturnType<typeof setTimeout> | null>(null);
  let hoverPos = $state<{ x: number; y: number }>({ x: 0, y: 0 });
  let showPreview = $state(false);

  function onItemMouseEnter(e: MouseEvent, item: FurnitureDef) {
    if (hoverTimeout) clearTimeout(hoverTimeout);
    hoveredItem = item;
    updateHoverPos(e);
    hoverTimeout = setTimeout(() => { showPreview = true; }, 300);
  }

  function onItemMouseMove(e: MouseEvent) {
    updateHoverPos(e);
  }

  function onItemMouseLeave() {
    if (hoverTimeout) clearTimeout(hoverTimeout);
    hoverTimeout = null;
    showPreview = false;
    hoveredItem = null;
  }

  function updateHoverPos(e: MouseEvent) {
    const sidebarRight = panelRoot?.getBoundingClientRect().right ?? 256;
    const viewportW = window.innerWidth;
    const tooltipW = 220;
    // Position to the right of sidebar, or left if no space
    const x = (sidebarRight + tooltipW + 8) < viewportW ? sidebarRight + 8 : -tooltipW - 8;
    // Vertically align near the mouse, clamped to viewport
    const y = Math.min(Math.max(e.clientY - 40, 8), window.innerHeight - 200);
    hoverPos = { x, y };
  }

  const categoryColors: Record<string, string> = {
    'Living Room': '#a78bfa',
    'Bedroom': '#60a5fa',
    'Kitchen': '#f87171',
    'Bathroom': '#93c5fd',
    'Office': '#34d399',
    'Dining': '#f59e0b',
    'Decor': '#c2956b',
    'Lighting': '#fbbf24',
    'Outdoor Furniture': '#b45309',
    'Landscaping': '#16a34a',
    'Fencing': '#a16207',
    'Structures': '#6b7280',
    'Electrical': '#2563eb',
    'Plumbing': '#0ea5e9',
  };
</script>

{#snippet tile(label: string, path: string, active: boolean, onclick: () => void, key?: string, help?: string)}
  <button
    type="button"
    class="relative flex h-[76px] flex-col items-center justify-center gap-1.5 rounded-[10px] border px-1 text-center text-[11.5px] leading-tight transition-colors {active ? 'border-walnut bg-walnut-tint font-bold text-walnut-dark shadow-[inset_0_0_0_1px_var(--color-walnut)]' : 'border-line bg-white font-medium text-charcoal hover:border-[#B89A86] hover:bg-hover'}"
    aria-pressed={active}
    title={help ? `${label} — ${help}` : label}
    {onclick}
  >
    {#if key}<span class="absolute right-1.5 top-1.5 rounded bg-ivory px-1 text-[9.5px] font-semibold leading-4 text-muted" aria-hidden="true">{key}</span>{/if}
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={path} /></svg>
    <span class="max-w-full truncate">{label}{#if key}<span class="sr-only"> {key}</span>{/if}</span>
    {#if help}<span class="sr-only">{help}</span>{/if}
  </button>
{/snippet}

{#snippet sectionTitle(text: string)}
  <h3 class="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">{text}</h3>
{/snippet}

<div bind:this={panelRoot} class="w-72 max-md:w-64 shrink-0 bg-cream flex flex-col h-full overflow-hidden text-charcoal">
  <!-- Header: the side rail picks the section; this names it -->
  <div class="flex items-center justify-between gap-2 px-4 pt-4 pb-3">
    <h2 class="text-[17px] font-bold tracking-tight">
      {activeTab === 'draw' ? $t('buildTools.build') : activeTab === 'rooms' ? $t('buildTools.rooms') : activeTab === 'objects' ? $t('buildTools.objects') : activeTab === 'finishes' ? 'Finishes' : activeTab === 'boards' ? 'Boards' : 'AI assistant'}
    </h2>
    {#if onClose}
      <button type="button" class="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-hover hover:text-charcoal" aria-label="Collapse panel" title="Collapse panel" onclick={onClose}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" /></svg>
      </button>
    {/if}
  </div>

  {#if activeTab === 'assistant'}
    <div class="min-h-0 flex-1 px-4 pb-4"><AssistantChat /></div>
  {:else}
  <div class="flex-1 overflow-y-auto px-4 pb-4">
    {#if activeTab === 'draw'}
      <div class="space-y-5">
        <section>
          {@render sectionTitle($t('buildTools.tools'))}
          <div class="grid grid-cols-3 gap-2">
            {@render tile($t('buildTools.select'), 'M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3zM13 13l6 6', currentTool === 'select', () => setTool('select'), 'V', $t('buildTools.selectHelp'))}
            {@render tile($t('buildTools.wall'), 'M3 8h18v8H3zM7 8v8M12 8v8M17 8v8', currentTool === 'wall', () => setTool('wall'), 'W', $t('buildTools.wallHelp'))}
          </div>
        </section>

        <section>
          {@render sectionTitle($t('buildTools.structure'))}
          <div class="grid grid-cols-3 gap-2">
            {@render tile($t('buildTools.stairs'), 'M4 20h4v-4h4v-4h4V8h4V4', isPlacingStair, onPlaceStair, undefined, $t('buildTools.stairsHelp'))}
            {@render tile($t('buildTools.round'), 'M12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM7.8 7.8l8.4 8.4M16.2 7.8l-8.4 8.4', isPlacingColumn, () => onPlaceColumn('round'))}
            {@render tile($t('buildTools.square'), 'M6 6h12v12H6zM6 6l12 12M18 6L6 18', isPlacingColumn, () => onPlaceColumn('square'))}
          </div>
        </section>

        <section>
          {@render sectionTitle($t('buildTools.annotate'))}
          <div class="grid grid-cols-3 gap-2">
            {@render tile($t('buildTools.text'), 'M4 7V4h16v3M12 4v16M8 20h8', currentTool === 'text', () => setTool('text'), undefined, $t('buildTools.textHelp'))}
            {@render tile($t('buildTools.dimension'), 'M3 12h18M3 8v8M21 8v8M7 10l-2 2 2 2M17 10l2 2-2 2', currentTool === 'annotate', () => setTool('annotate'), undefined, $t('buildTools.dimensionHelp'))}
            {@render tile($t('buildTools.measure'), 'M2 12h5l2-7 4 14 2-7h7', currentTool === 'measure', () => setTool('measure'), undefined, $t('buildTools.measureHelp'))}
          </div>
        </section>

        <section>
          {@render sectionTitle($t('buildTools.import'))}
          <div class="space-y-2">
            <button type="button" class="flex w-full items-center gap-3 rounded-[10px] border border-line bg-white px-3 py-2.5 text-left text-sm transition-colors hover:border-[#B89A86] hover:bg-hover" onclick={onImportImage}>
              <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-walnut-tint text-walnut">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
              </span>
              <span class="min-w-0">
                <span class="block font-semibold">{$t('buildTools.image')}</span>
                <span class="block truncate text-xs text-muted">{$t('buildTools.imageHelp')}</span>
              </span>
            </button>
            <button type="button" class="flex w-full items-center gap-3 rounded-[10px] border border-line bg-white px-3 py-2.5 text-left text-sm transition-colors hover:border-[#B89A86] hover:bg-hover" onclick={onImportRoomPlan}>
              <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sage-tint text-sage-ink">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
              </span>
              <span class="min-w-0">
                <span class="block font-semibold">{$t('buildTools.roomplan')}</span>
                <span class="block truncate text-xs text-muted">{$t('buildTools.roomplanHelp')}</span>
              </span>
            </button>
          </div>
        </section>

        <section>
          <button
            type="button"
            class="mb-2 flex w-full items-center justify-between"
            aria-expanded={constructionOpen}
            onclick={() => constructionOpen = !constructionOpen}
          >
            <h3 class="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">{$t('layers.doors')}</h3>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted transition-transform {constructionOpen ? '' : '-rotate-90'}" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
          </button>

          {#if constructionOpen}
            <div class="mb-4 grid grid-cols-2 gap-2">
              {#each doorCatalog as dc}
                {@const on = currentTool === 'door' && selectedDoorType === dc.type}
                <button
                  class="flex flex-col items-center gap-1 rounded-[10px] border p-2.5 transition-colors cursor-grab active:cursor-grabbing {on ? 'border-walnut bg-walnut-tint shadow-[inset_0_0_0_1px_var(--color-walnut)]' : 'border-line bg-white hover:border-[#B89A86] hover:bg-hover'}"
                  onclick={() => setDoorType(dc.type)}
                  draggable="true"
                  ondragstart={(e) => { e.dataTransfer?.setData('application/o3d-type', 'door'); e.dataTransfer?.setData('application/o3d-id', dc.type); }}
                >
                  <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-walnut-tint text-walnut">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="{dc.icon}"/></svg>
                  </div>
                  <span class="text-xs font-semibold text-charcoal">{dc.name}</span>
                  <span class="text-[10px] text-muted">{dc.desc}</span>
                </button>
              {/each}
            </div>

            {@render sectionTitle($t('layers.windows'))}
            <div class="grid grid-cols-2 gap-2">
              {#each windowCatalog as wc}
                {@const on = currentTool === 'window' && selectedWindowType === wc.type}
                <button
                  class="flex flex-col items-center gap-1 rounded-[10px] border p-2.5 transition-colors cursor-grab active:cursor-grabbing {on ? 'border-walnut bg-walnut-tint shadow-[inset_0_0_0_1px_var(--color-walnut)]' : 'border-line bg-white hover:border-[#B89A86] hover:bg-hover'}"
                  onclick={() => setWindowType(wc.type)}
                  draggable="true"
                  ondragstart={(e) => { e.dataTransfer?.setData('application/o3d-type', 'window'); e.dataTransfer?.setData('application/o3d-id', wc.type); }}
                >
                  <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-sage-tint text-sage-ink">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="1"/><line x1="12" y1="4" x2="12" y2="20"/><line x1="3" y1="12" x2="21" y2="12"/></svg>
                  </div>
                  <span class="text-xs font-semibold text-charcoal">{wc.name}</span>
                  <span class="text-[10px] text-muted">{wc.desc}</span>
                </button>
              {/each}
            </div>
          {/if}
        </section>
      </div>

    {:else if activeTab === 'rooms'}
      <div class="space-y-2">
        {@render sectionTitle($t('roomChoices.presets'))}
        <p class="mb-3 text-xs text-muted">{$t('roomChoices.presetsHelp')}</p>
        <div class="grid grid-cols-2 gap-2">
          {#each roomPresets as preset}
            <button
              class="flex flex-col items-center gap-1.5 rounded-[10px] border border-line bg-white p-3 transition-colors hover:border-walnut hover:bg-walnut-tint cursor-grab active:cursor-grabbing"
              onclick={() => onPresetClick(preset.id)}
              draggable="true"
              ondragstart={(e) => { e.dataTransfer?.setData('application/o3d-type', 'room'); e.dataTransfer?.setData('application/o3d-id', preset.id); }}
            >
              <div class="flex h-12 w-12 items-center justify-center rounded-lg border-[1.5px] border-charcoal/80 bg-[#F2E6D8] font-mono text-2xl text-charcoal">{preset.icon}</div>
              <span class="text-xs font-semibold text-charcoal">{roomPresetLabels[preset.id] ? $t(roomPresetLabels[preset.id]) : preset.name}</span>
            </button>
          {/each}
        </div>

        <hr class="my-4 border-line" />

        {@render sectionTitle($t('roomChoices.templates'))}
        <p class="mb-3 text-xs text-muted">{$t('roomChoices.templatesHelp')}</p>
        <div class="grid grid-cols-2 gap-2">
          {#each roomTemplates as tmpl}
            <button
              class="flex flex-col items-center gap-1.5 rounded-[10px] border border-line bg-white p-3 transition-colors hover:border-sage hover:bg-sage-tint cursor-grab active:cursor-grabbing"
              onclick={() => onPresetClick(tmpl.presetId, tmpl.name)}
              draggable="true"
              ondragstart={(e) => { e.dataTransfer?.setData('application/o3d-type', 'room-template'); e.dataTransfer?.setData('application/o3d-id', tmpl.name); }}
            >
              <div class="flex h-12 w-12 items-center justify-center rounded-lg bg-sage-tint text-lg">
                {#if tmpl.name === 'Living Room'}<AppIcon name="sofa" size={16} />
                {:else if tmpl.name === 'Bedroom'}<AppIcon name="bed-double" size={16} />
                {:else if tmpl.name === 'Kitchen'}<AppIcon name="cooking-pot" size={16} />
                {:else if tmpl.name === 'Bathroom'}<AppIcon name="bath" size={16} />
                {:else if tmpl.name === 'Office'}<AppIcon name="monitor" size={16} />
                {:else if tmpl.name === 'Dining Room'}<AppIcon name="utensils" size={16} />
                {:else}<AppIcon name="house" size={16} />
                {/if}
              </div>
              <span class="text-xs font-semibold text-charcoal">{roomTemplateLabels[tmpl.name] ? $t(roomTemplateLabels[tmpl.name]) : tmpl.name}</span>
              <span class="text-[10px] text-muted">{$t(tmpl.furniture.length === 1 ? 'roomChoices.item' : 'roomChoices.items', { count: tmpl.furniture.length })}</span>
            </button>
          {/each}
        </div>
      </div>

    {:else if activeTab === 'finishes'}
      <FinishesPanel />

    {:else if activeTab === 'boards'}
      <BoardsPanel />

    {:else if activeTab === 'objects'}
      <div class="space-y-3">
        <CustomModelPanel />
        <!-- Search with clear button and result count -->
        <div class="relative">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true"><path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4" /></svg>
          <input
            type="text"
            placeholder={$t('objectControls.search')} aria-label={$t('objectControls.search')}
            class="h-10 w-full rounded-[10px] border border-line bg-white pl-9 pr-8 text-sm text-charcoal outline-none placeholder:text-muted focus:border-walnut focus:ring-2 focus:ring-walnut/15"
            bind:value={search}
          />
          {#if search}
            <button
              class="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-charcoal"
              onclick={() => search = ''}
              title={$t('objectControls.clear')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          {/if}
        </div>
        {#if search}
          <div class="px-1 text-[11px] text-muted">{$t(filtered.length === 1 ? 'objectControls.result' : 'objectControls.results', { count: filtered.length, query: search })}</div>
        {/if}
        <!-- Category filter -->
        <div class="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
          <button
            class="h-7 rounded-full border px-2.5 text-[11px] font-semibold transition-colors {selectedCategory === 'All' ? 'border-walnut bg-walnut text-white' : 'border-line bg-white text-charcoal hover:bg-hover'}"
            onclick={() => selectedCategory = 'All'}
          >{$t('objectControls.all')}</button>
          <button
            class="h-7 rounded-full border px-2.5 text-[11px] font-semibold transition-colors {selectedCategory === 'Favorites' ? 'border-terracotta-ink bg-terracotta-ink text-white' : 'border-line bg-white text-charcoal hover:bg-hover'}"
            onclick={() => selectedCategory = 'Favorites'}
          ><AppIcon name="heart" size={16} /> {$t('objectControls.favorites')}{favoriteIds.length ? ` (${favoriteIds.length})` : ''}</button>
          {#each furnitureCategories as cat}
            <button
              class="h-7 rounded-full border px-2.5 text-[11px] font-semibold transition-colors {selectedCategory === cat ? 'border-walnut bg-walnut text-white' : 'border-line bg-white text-charcoal hover:bg-hover'}"
              onclick={() => selectedCategory = cat}
            >{catalogCategoryLabels[cat] ? $t(catalogCategoryLabels[cat]) : cat}</button>
          {/each}
        </div>

        <!-- Recent Items -->
        {#if !search && selectedCategory === 'All' && recentItems.length > 0}
          <div class="mt-1">
            <h4 class="mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">{$t('objectControls.recent')}</h4>
            <div class="grid grid-cols-2 gap-2">
              {#each recentItems as item}
                <div class="relative">
                  <button
                    class="flex h-full w-full flex-col items-center gap-1 rounded-[10px] border p-2.5 transition-colors cursor-grab active:cursor-grabbing {currentPlacing === item.id ? 'border-walnut bg-walnut-tint shadow-[inset_0_0_0_1px_var(--color-walnut)]' : 'border-line bg-white hover:border-[#B89A86] hover:bg-hover'}"
                    onclick={() => onFurnitureClick(item)}
                    draggable="true"
                    ondragstart={(e) => { e.dataTransfer?.setData('application/o3d-type', 'furniture'); e.dataTransfer?.setData('application/o3d-id', item.id); }}
                    onmouseenter={(e) => onItemMouseEnter(e, item)}
                    onmousemove={onItemMouseMove}
                    onmouseleave={onItemMouseLeave}
                  >
                    <div class="h-10 w-10"><FurnitureThumbnail catalogId={item.id} name={furnitureName(item.id, $locale)} color={item.color} /></div>
                    <span class="text-center text-[10.5px] font-semibold leading-tight text-charcoal">{furnitureName(item.id, $locale)}</span>
                  </button>
                  <button
                    class="absolute right-1.5 top-1 cursor-pointer text-[13px] leading-none {favoriteIds.includes(item.id) ? 'text-terracotta-ink' : 'text-line hover:text-terracotta'}"
                    onclick={() => toggleFavorite(item.id)}
                    aria-label={$t(favoriteIds.includes(item.id) ? 'objectControls.remove' : 'objectControls.add', { name: furnitureName(item.id, $locale) })}
                    aria-pressed={favoriteIds.includes(item.id)}
                    title={$t(favoriteIds.includes(item.id) ? 'objectControls.removeHint' : 'objectControls.addHint')}
                  ><AppIcon name="heart" size={13} fill={favoriteIds.includes(item.id) ? 'currentColor' : 'none'} /></button>
                </div>
              {/each}
            </div>
          </div>
          <hr class="border-line" />
        {/if}

        <!-- Catalog grid -->
        <div class="mt-2 grid grid-cols-2 gap-2">
          {#each filtered as item}
            {@const s = search.toLowerCase()}
            <div class="relative">
              <button
                class="flex h-full w-full flex-col items-center gap-1 rounded-[10px] border p-3 transition-colors cursor-grab active:cursor-grabbing {currentPlacing === item.id ? 'border-walnut bg-walnut-tint shadow-[inset_0_0_0_1px_var(--color-walnut)]' : 'border-line bg-white hover:border-[#B89A86] hover:bg-hover'}"
                onclick={() => onFurnitureClick(item)}
                draggable="true"
                ondragstart={(e) => { e.dataTransfer?.setData('application/o3d-type', 'furniture'); e.dataTransfer?.setData('application/o3d-id', item.id); }}
                onmouseenter={(e) => onItemMouseEnter(e, item)}
                onmousemove={onItemMouseMove}
                onmouseleave={onItemMouseLeave}
              >
                <div class="h-12 w-12"><FurnitureThumbnail catalogId={item.id} name={furnitureName(item.id, $locale)} color={item.color} /></div>
                {#if s && furnitureName(item.id, $locale).toLowerCase().includes(s)}
                  {@const idx = furnitureName(item.id, $locale).toLowerCase().indexOf(s)}
                  <span class="text-xs font-semibold text-charcoal">{furnitureName(item.id, $locale).slice(0, idx)}<mark class="rounded-sm bg-wood px-0.5 text-charcoal">{furnitureName(item.id, $locale).slice(idx, idx + s.length)}</mark>{furnitureName(item.id, $locale).slice(idx + s.length)}</span>
                {:else}
                  <span class="text-xs font-semibold text-charcoal">{furnitureName(item.id, $locale)}</span>
                {/if}
                <span class="text-[10px] text-muted">{item.width}×{item.depth}cm</span>
              </button>
              <button
                class="absolute right-1.5 top-1 cursor-pointer text-[13px] leading-none {favoriteIds.includes(item.id) ? 'text-terracotta-ink' : 'text-line hover:text-terracotta'}"
                onclick={() => toggleFavorite(item.id)}
                aria-label={$t(favoriteIds.includes(item.id) ? 'objectControls.remove' : 'objectControls.add', { name: furnitureName(item.id, $locale) })}
                aria-pressed={favoriteIds.includes(item.id)}
                title={$t(favoriteIds.includes(item.id) ? 'objectControls.removeHint' : 'objectControls.addHint')}
              ><AppIcon name="heart" size={13} fill={favoriteIds.includes(item.id) ? 'currentColor' : 'none'} /></button>
            </div>
          {/each}
        </div>

        <!-- Entourage: 2D presentation symbols (people, cars, planting) -->
        <div class="mt-2 border-t border-line pt-4">
          {@render sectionTitle($t('entourageLabels.title'))}
          {#each entourageCategories as cat}
            {@const defs = entourageCatalog.filter(d => d.category === cat.key)}
            <div class="mb-3">
              <span class="text-[11px] font-semibold text-muted"><AppIcon name={cat.icon} size={12} /> {$t(`entourageLabels.${cat.key}`)}</span>
              <div class="mt-1 grid grid-cols-3 gap-1.5">
                {#each defs as def}
                  {@const name = entourageLabels[def.id] ? $t(entourageLabels[def.id]) : def.name}
                  <button
                    class="rounded-lg border p-1.5 text-center transition-colors {placingEntId === def.id ? 'border-walnut bg-walnut-tint shadow-[inset_0_0_0_1px_var(--color-walnut)]' : 'border-line bg-white hover:border-[#B89A86] hover:bg-hover'}"
                    title={$t('entourageLabels.placeHint', { name, width: def.width })}
                    onclick={() => armEntourage(def.id)}
                  >
                    <svg viewBox="0 0 100 {Math.round(100 * def.aspect)}" class="h-8 w-full text-charcoal/70" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">
                      {#each def.paths as d}<path d={d} />{/each}
                    </svg>
                    <span class="block truncate text-[9.5px] leading-tight text-muted">{name}</span>
                  </button>
                {/each}
              </div>
            </div>
          {/each}
          {#if customEntDefs.length}
            <div class="mb-3">
              <span class="text-[11px] font-semibold text-muted"><AppIcon name="image" size={16} /> {$t('entourageLabels.custom')}</span>
              <div class="mt-1 grid grid-cols-3 gap-1.5">
                {#each customEntDefs as def}
                  <button
                    class="rounded-lg border p-1.5 text-center transition-colors {placingEntId === def.id ? 'border-walnut bg-walnut-tint shadow-[inset_0_0_0_1px_var(--color-walnut)]' : 'border-line bg-white hover:border-[#B89A86] hover:bg-hover'}"
                    title={def.name}
                    onclick={() => armEntourage(def.id)}
                  >
                    <img src={def.dataUrl} alt={def.name} class="h-8 w-full object-contain" />
                    <span class="block truncate text-[9.5px] leading-tight text-muted">{def.name}</span>
                  </button>
                {/each}
              </div>
            </div>
          {/if}
          <button
            class="w-full rounded-[10px] border border-dashed border-line py-2 text-xs font-semibold text-muted transition-colors hover:border-walnut hover:text-walnut"
            onclick={() => entourageFileInput?.click()}
          >+ {$t('entourageLabels.upload')}</button>
          {#if symbolUploadError}<p role="alert" class="mt-1 text-xs text-danger">{$t(`entourageLabels.${symbolUploadError}`)}</p>{/if}
          <input type="file" accept="image/png,image/jpeg,image/webp" class="hidden" bind:this={entourageFileInput} onchange={onEntourageUpload} />
        </div>
      </div>
    {/if}
  </div>
  {/if}
</div>

<!-- Furniture Hover Preview Tooltip -->
{#if showPreview && hoveredItem}
  {@const item = hoveredItem}
  <div
    class="fixed z-50 pointer-events-none"
    style="left: {hoverPos.x}px; top: {hoverPos.y}px;"
  >
    <div class="bg-cream rounded-[14px] shadow-[0_8px_30px_rgba(50,40,30,0.12)] border border-line overflow-hidden" style="width: 220px;">
      <div class="w-full h-[120px] bg-paper flex items-center justify-center p-3">
        <div class="w-full h-full"><FurnitureThumbnail catalogId={item.id} name={furnitureName(item.id, $locale)} color={item.color} /></div>
      </div>
      <div class="p-3 space-y-1.5">
        <div class="flex items-center gap-2">
          <span class="text-sm font-semibold text-charcoal">{furnitureName(item.id, $locale)}</span>
          <span
            class="px-1.5 py-0.5 rounded-full text-[9px] font-semibold text-white"
            style="background-color: {categoryColors[item.category] ?? '#6b7280'}"
          >{catalogCategoryLabels[item.category] ? $t(catalogCategoryLabels[item.category]) : item.category}</span>
        </div>
        <div class="text-xs text-muted">
          {item.width} × {item.depth} × {item.height} cm
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- RoomPlan Import Options Dialog -->
{#if showImportDialog}
  <dialog use:modalDialog class="modal-overlay fixed inset-0 bg-black/50 z-50 flex items-center justify-center" aria-label={$t('roomPlanDialog.title')} onclick={(e) => { if (e.target === e.currentTarget) cancelImport(); }} oncancel={(e) => { e.preventDefault(); cancelImport(); }}>
    <div class="bg-cream rounded-[14px] shadow-2xl w-80 max-w-[calc(100vw-2rem)] max-h-[85vh] overflow-auto p-5">
      <h3 class="text-sm font-bold text-gray-800 mb-1">{$t('roomPlanDialog.title')}</h3>
      <p class="text-xs text-gray-400 mb-4">{importFileName}</p>

      <div class="space-y-3">
        <label class="flex items-start gap-2.5 cursor-pointer">
          <input type="checkbox" bind:checked={optStraighten} class="accent-[#6B4636] mt-0.5" />
          <div>
            <div class="text-sm font-medium text-gray-700">{$t('roomPlanDialog.straighten')}</div>
            <div class="text-xs text-gray-400">{$t('roomPlanDialog.straightenHelp')}</div>
          </div>
        </label>

        <label class="flex items-start gap-2.5 cursor-pointer">
          <input type="checkbox" bind:checked={optOrthogonal} class="accent-[#6B4636] mt-0.5" />
          <div>
            <div class="text-sm font-medium text-gray-700">{$t('roomPlanDialog.orthogonal')} <span class="text-xs text-blue-400 font-mono">{ORTHO_VERSION}</span></div>
            <div class="text-xs text-gray-400">{$t('roomPlanDialog.orthogonalHelp')}</div>
          </div>
        </label>

        <label class="block">
          <div class="text-xs text-gray-500 mb-1">{$t('roomPlanDialog.merge')}</div>
          <input type="number" bind:value={optMergeDistance} min="0" max="50" step="5" class="w-full px-2 py-1 border border-gray-200 rounded text-sm" />
        </label>
      </div>

      <div class="flex gap-2 mt-5">
        <button onclick={cancelImport} class="flex-1 px-3 py-2 border border-line rounded-[10px] text-sm font-semibold text-charcoal hover:bg-hover transition-colors">{$t('roomPlanDialog.cancel')}</button>
        <button onclick={confirmImport} class="flex-1 px-3 py-2 bg-walnut text-white rounded-[10px] text-sm font-semibold hover:bg-walnut-dark transition-colors">{$t('roomPlanDialog.import')}</button>
      </div>
    </div>
  </dialog>
{/if}

{#if importError}
  <ImportError message={importError} onDismiss={() => importError = null} />
{/if}
