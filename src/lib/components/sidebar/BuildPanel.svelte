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
  import { activateMeasurementTool, selectedTool, selectedElementId, selectedElementIds, selectedRoomId, detectedRoomsStore, placingFurnitureId, placingDoorType, placingWindowType, placingStair, addStair, placingColumn, placingColumnShape, activeFloor, setBackgroundImage, canvasCamX, canvasCamY, placingEntourageId, addCustomEntourage } from '$lib/stores/project';
  import type { Tool } from '$lib/stores/project';
  import type { Door, Window as Win, CustomEntourageDef } from '$lib/models/types';
  import { entourageCatalog, entourageCategories } from '$lib/utils/entourageCatalog';
  import { roomPresets, placePreset } from '$lib/utils/roomPresets';
  import { roomTemplates, placeRoomTemplate } from '$lib/utils/roomTemplates';
  import { furnitureCatalog, furnitureCategories } from '$lib/utils/furnitureCatalog';
  import type { FurnitureDef } from '$lib/utils/furnitureCatalog';
  import FurnitureThumbnail from './FurnitureThumbnail.svelte';
  import CatalogPreview from './CatalogPreview.svelte';
  import CustomModelPanel from './CustomModelPanel.svelte';
  import FinishesPanel from './FinishesPanel.svelte';
  import BoardsPanel from './BoardsPanel.svelte';
  import AssistantChat from '$lib/components/ai/AssistantChat.svelte';
  import { createProjectFromRoomPlan, extractRoomJsonFromZip, roomPlanImportOptions, validateRoomPlan, ORTHO_VERSION } from '$lib/utils/roomplanImport';
  import { currentProject } from '$lib/stores/project';
  import { projectSettings, formatLength, formatArea } from '$lib/stores/settings';
  import { resolveRooms } from '$lib/utils/roomDetection';

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
  let existingRooms = $derived($activeFloor ? resolveRooms($activeFloor, $detectedRoomsStore) : []);

  function selectRoom(roomId: string) {
    selectedElementId.set(null);
    selectedElementIds.set(new Set());
    selectedRoomId.set(roomId);
  }

  function setTool(tool: Tool) {
    const sameTool = currentTool === tool;
    if (sameTool) {
      selectedTool.set('select');
      placingFurnitureId.set(null);
      placingStair.set(false);
      placingColumn.set(false);
      return;
    }
    if (tool === 'measure' || tool === 'annotate') activateMeasurementTool(tool);
    else selectedTool.set(tool);
    placingFurnitureId.set(null);
    placingStair.set(false);
    placingColumn.set(false);
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

  const doorCatalog: { type: Door['type']; name: string; desc: string }[] = $derived([
    { type: 'single', name: $t('openingCatalog.single'), desc: formatOpeningDescription($t('openingCatalog.singleDescription')) },
    { type: 'double', name: $t('openingCatalog.double'), desc: formatOpeningDescription($t('openingCatalog.doubleDescription')) },
    { type: 'sliding', name: $t('openingCatalog.sliding'), desc: formatOpeningDescription($t('openingCatalog.slidingDescription')) },
    { type: 'french', name: $t('openingCatalog.french'), desc: formatOpeningDescription($t('openingCatalog.frenchDescription')) },
    { type: 'pocket', name: $t('openingCatalog.pocket'), desc: formatOpeningDescription($t('openingCatalog.pocketDescription')) },
    { type: 'bifold', name: $t('openingCatalog.bifold'), desc: formatOpeningDescription($t('openingCatalog.bifoldDescription')) },
    { type: 'opening', name: $t('openingCatalog.doorway'), desc: formatOpeningDescription($t('openingCatalog.doorwayDescription')) },
    { type: 'garage', name: $t('openingCatalog.garage'), desc: formatOpeningDescription($t('openingCatalog.garageDescription')) },
  ]);

  const windowCatalog: { type: Win['type']; name: string; desc: string }[] = $derived([
    { type: 'standard', name: $t('openingCatalog.standard'), desc: `${formatLength(120, $projectSettings.units)} × ${formatLength(120, $projectSettings.units)}` },
    { type: 'fixed', name: $t('openingCatalog.fixed'), desc: `${formatLength(100, $projectSettings.units)} × ${formatLength(100, $projectSettings.units)}` },
    { type: 'casement', name: $t('openingCatalog.casement'), desc: `${formatLength(80, $projectSettings.units)} × ${formatLength(130, $projectSettings.units)}` },
    { type: 'sliding', name: $t('openingCatalog.sliding'), desc: `${formatLength(180, $projectSettings.units)} × ${formatLength(120, $projectSettings.units)}` },
    { type: 'bay', name: $t('openingCatalog.bay'), desc: `${formatLength(200, $projectSettings.units)} × ${formatLength(150, $projectSettings.units)}` },
  ]);

  function formatOpeningDescription(description: string): string {
    return description.replace(/(\d+(?:[.,]\d+)?)\s*cm/gi, (_, value: string) => formatLength(Number(value.replace(',', '.')), $projectSettings.units));
  }

  let selectedDoorType = $state<Door['type']>('single');
  let selectedWindowType = $state<Win['type']>('standard');
  let doorPreviewMode = $state<'2d' | '3d'>('2d');
  let windowPreviewMode = $state<'2d' | '3d'>('2d');

  function setDoorType(type: Door['type']) {
    const togglingOff = currentTool === 'door' && selectedDoorType === type;
    selectedDoorType = type;
    placingDoorType.set(type);
    if (togglingOff) {
      selectedTool.set('select');
      return;
    }
    setTool('door');
  }

  function setWindowType(type: Win['type']) {
    const togglingOff = currentTool === 'window' && selectedWindowType === type;
    selectedWindowType = type;
    placingWindowType.set(type);
    if (togglingOff) {
      selectedTool.set('select');
      return;
    }
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
  let placingColumnShapeValue = $state<'round' | 'square'>('round');
  onDestroy(placingColumnShape.subscribe(v => { placingColumnShapeValue = v; }));

  function onPlaceStair() {
    const togglingOff = isPlacingStair;
    placingColumn.set(false);
    placingStair.set(!togglingOff);
    selectedTool.set(togglingOff ? 'select' : 'select');
    placingFurnitureId.set(null);
  }

  function onPlaceColumn(shape: 'round' | 'square') {
    const togglingOff = isPlacingColumn && placingColumnShapeValue === shape;
    placingStair.set(false);
    placingColumn.set(!togglingOff);
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
    class="relative flex h-[82px] flex-col items-center justify-center gap-1.5 rounded-[10px] border px-1 text-center text-sm font-semibold leading-tight transition-colors {active ? 'border-walnut bg-walnut-tint font-bold text-walnut-dark shadow-[inset_0_0_0_1px_var(--color-walnut)]' : 'border-line bg-white text-charcoal hover:border-[#B89A86] hover:bg-hover'}"
    aria-pressed={active}
    title={help ? `${label} — ${help}` : label}
    {onclick}
  >
    {#if key}<span class="absolute right-1.5 top-1.5 rounded bg-ivory px-1 text-[9.5px] font-semibold leading-4 text-muted" aria-hidden="true">{key}</span>{/if}
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={path} /></svg>
    <span class="max-w-full truncate ui-control-label">{label}{#if key}<span class="sr-only"> {key}</span>{/if}</span>
    {#if help}<span class="sr-only">{help}</span>{/if}
  </button>
{/snippet}

{#snippet sectionTitle(text: string)}
  <h3 class="ui-section-heading">{text}</h3>
{/snippet}

<div bind:this={panelRoot} class="w-72 max-md:w-64 shrink-0 bg-cream flex flex-col h-full overflow-hidden text-charcoal">
  <!-- Header: the side rail picks the section; this names it -->
  <div class="flex items-center justify-between gap-2 px-4 pt-4 pb-3">
    <h2 class="ui-panel-title">
      {activeTab === 'draw' ? $t('buildTools.build') : activeTab === 'rooms' ? $t('buildTools.rooms') : activeTab === 'objects' ? $t('buildTools.objects') : activeTab === 'finishes' ? 'Finishes' : activeTab === 'boards' ? 'Boards' : 'AI assistant'}
    </h2>
    {#if onClose}
      <button type="button" class="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-hover hover:text-charcoal" aria-label="Collapse panel" title="Collapse panel" onclick={onClose}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" /></svg>
      </button>
    {/if}
  </div>

  {#snippet doorIllustration(type: Door['type'], mode: '2d' | '3d' = doorPreviewMode)}
    {#if mode === '2d'}
      {#if type === 'single'}
        <svg width="92" height="92" viewBox="0 0 92 92" fill="none" aria-hidden="true">
          <rect x="26" y="14" width="40" height="62" rx="5" fill="#F7F5F2" stroke="#C9C7C2" stroke-width="3"/>
          <path d="M46 14v62" stroke="#D7D1C7" stroke-width="2.5"/>
          <path d="M26 32h40M26 56h40" stroke="#D6D0C9" stroke-width="2"/>
          <path d="M28 68c5.8-4 11.8-6 18-6s12.2 2 18 6" stroke="#C4B8AB" stroke-width="2.4" stroke-linecap="round" opacity="0.9"/>
        </svg>
      {:else if type === 'double'}
        <svg width="92" height="92" viewBox="0 0 92 92" fill="none" aria-hidden="true">
          <rect x="16" y="14" width="22" height="62" rx="5" fill="#F7F5F2" stroke="#C9C7C2" stroke-width="3"/>
          <rect x="54" y="14" width="22" height="62" rx="5" fill="#F7F5F2" stroke="#C9C7C2" stroke-width="3"/>
          <path d="M46 14v62M47 30h15M47 58h15" stroke="#D7D1C7" stroke-width="2.2"/>
        </svg>
      {:else if type === 'sliding'}
        <svg width="92" height="92" viewBox="0 0 92 92" fill="none" aria-hidden="true">
          <rect x="18" y="18" width="56" height="52" rx="7" fill="#F7F5F2" stroke="#C9C7C2" stroke-width="3"/>
          <path d="M46 18v52" stroke="#D7D1C7" stroke-width="2.2"/>
          <path d="M26 32h20M46 32h20M26 58h20M46 58h20" stroke="#D7D1C7" stroke-width="2"/>
          <path d="M31 32v26M61 32v26" stroke="#C8B9AC" stroke-width="2" opacity="0.9"/>
        </svg>
      {:else if type === 'french'}
        <svg width="92" height="92" viewBox="0 0 92 92" fill="none" aria-hidden="true">
          <rect x="16" y="14" width="22" height="62" rx="5" fill="#F7F5F2" stroke="#C9C7C2" stroke-width="3"/>
          <rect x="54" y="14" width="22" height="62" rx="5" fill="#F7F5F2" stroke="#C9C7C2" stroke-width="3"/>
          <path d="M28 14v62M64 14v62" stroke="#D7D1C7" stroke-width="2.2"/>
          <path d="M16 30h22M54 30h22M16 60h22M54 60h22" stroke="#D7D1C7" stroke-width="2" opacity="0.8"/>
        </svg>
      {:else if type === 'pocket'}
        <svg width="92" height="92" viewBox="0 0 92 92" fill="none" aria-hidden="true">
          <rect x="22" y="14" width="48" height="62" rx="6" fill="#F7F5F2" stroke="#C9C7C2" stroke-width="3"/>
          <path d="M46 14v62" stroke="#D7D1C7" stroke-width="2.2"/>
          <path d="M22 36h48M22 58h48" stroke="#D7D1C7" stroke-width="2" opacity="0.8"/>
          <path d="M29 14v62M63 14v62" stroke="#C9BEB2" stroke-width="2" opacity="0.8"/>
        </svg>
      {:else if type === 'bifold'}
        <svg width="92" height="92" viewBox="0 0 92 92" fill="none" aria-hidden="true">
          <rect x="18" y="14" width="15" height="62" rx="4" fill="#F7F5F2" stroke="#C9C7C2" stroke-width="3"/>
          <rect x="38" y="14" width="15" height="62" rx="4" fill="#F7F5F2" stroke="#C9C7C2" stroke-width="3"/>
          <rect x="58" y="14" width="15" height="62" rx="4" fill="#F7F5F2" stroke="#C9C7C2" stroke-width="3"/>
          <path d="M25 14v62M46 14v62M67 14v62" stroke="#D7D1C7" stroke-width="2.2"/>
        </svg>
      {:else if type === 'opening'}
        <svg width="92" height="92" viewBox="0 0 92 92" fill="none" aria-hidden="true">
          <rect x="22" y="14" width="16" height="62" rx="4" fill="#F7F5F2" stroke="#C9C7C2" stroke-width="2.6"/>
          <rect x="54" y="14" width="16" height="62" rx="4" fill="#F7F5F2" stroke="#C9C7C2" stroke-width="2.6"/>
          <rect x="38" y="14" width="16" height="62" rx="4" fill="#F0EFEA" stroke="#D2CFC7" stroke-width="2.2" opacity="0.8"/>
        </svg>
      {:else}
        <svg width="92" height="92" viewBox="0 0 92 92" fill="none" aria-hidden="true">
          <rect x="20" y="16" width="52" height="60" rx="7" fill="#F7F5F2" stroke="#C9C7C2" stroke-width="3"/>
          <path d="M26 34h40M26 58h40" stroke="#D7D1C7" stroke-width="2.2"/>
          <path d="M38 16V8h16v8" stroke="#C9C7C2" stroke-width="2.4"/>
        </svg>
      {/if}
    {:else}
      {#if type === 'single'}
        <svg width="92" height="92" viewBox="0 0 92 92" fill="none" aria-hidden="true">
          <polygon points="28,18 66,18 74,26 74,72 28,72" fill="#E7DED7" opacity="0.95"/>
          <polygon points="28,18 66,18 66,72 28,72" fill="#F7F5F2" stroke="#BDAE9F" stroke-width="2.5"/>
          <polygon points="66,18 74,26 74,72 66,72" fill="#D9CBBE"/>
          <path d="M46 18v54" stroke="#D0BDAF" stroke-width="2.2"/>
          <path d="M28 34h38M28 58h38" stroke="#D2C8BE" stroke-width="2"/>
        </svg>
      {:else if type === 'double'}
        <svg width="92" height="92" viewBox="0 0 92 92" fill="none" aria-hidden="true">
          <polygon points="18,18 35,18 43,26 43,72 18,72" fill="#E7DED7"/>
          <polygon points="18,18 35,18 35,72 18,72" fill="#F7F5F2" stroke="#BDAE9F" stroke-width="2.5"/>
          <polygon points="35,18 43,26 43,72 35,72" fill="#D9CBBE"/>
          <polygon points="49,18 66,18 74,26 74,72 49,72" fill="#E7DED7"/>
          <polygon points="49,18 66,18 66,72 49,72" fill="#F7F5F2" stroke="#BDAE9F" stroke-width="2.5"/>
          <polygon points="66,18 74,26 74,72 66,72" fill="#D9CBBE"/>
          <path d="M43 18v54M47 32h17M47 58h17" stroke="#D0BDAF" stroke-width="2"/>
        </svg>
      {:else if type === 'sliding'}
        <svg width="92" height="92" viewBox="0 0 92 92" fill="none" aria-hidden="true">
          <polygon points="18,22 74,22 78,28 78,72 18,72" fill="#E7DED7"/>
          <polygon points="18,22 74,22 74,72 18,72" fill="#F7F5F2" stroke="#BDAE9F" stroke-width="2.5"/>
          <polygon points="74,22 78,28 78,72 74,72" fill="#D9CBBE"/>
          <path d="M46 22v50" stroke="#D0BDAF" stroke-width="2.1"/>
          <path d="M24 34h22M46 34h22M24 58h22M46 58h22" stroke="#D2C8BE" stroke-width="2"/>
        </svg>
      {:else if type === 'french'}
        <svg width="92" height="92" viewBox="0 0 92 92" fill="none" aria-hidden="true">
          <polygon points="18,18 35,18 43,26 43,72 18,72" fill="#E7DED7"/>
          <polygon points="18,18 35,18 35,72 18,72" fill="#F7F5F2" stroke="#BDAE9F" stroke-width="2.5"/>
          <polygon points="35,18 43,26 43,72 35,72" fill="#D9CBBE"/>
          <polygon points="49,18 66,18 74,26 74,72 49,72" fill="#E7DED7"/>
          <polygon points="49,18 66,18 66,72 49,72" fill="#F7F5F2" stroke="#BDAE9F" stroke-width="2.5"/>
          <polygon points="66,18 74,26 74,72 66,72" fill="#D9CBBE"/>
          <path d="M43 18v54M49 36h17M49 54h17" stroke="#D0BDAF" stroke-width="2.1"/>
        </svg>
      {:else if type === 'pocket'}
        <svg width="92" height="92" viewBox="0 0 92 92" fill="none" aria-hidden="true">
          <polygon points="22,20 70,20 76,28 76,74 22,74" fill="#E7DED7"/>
          <polygon points="22,20 70,20 70,74 22,74" fill="#F7F5F2" stroke="#BDAE9F" stroke-width="2.5"/>
          <polygon points="70,20 76,28 76,74 70,74" fill="#D9CBBE"/>
          <path d="M46 20v54" stroke="#D0BDAF" stroke-width="2.2"/>
          <path d="M22 36h48M22 58h48" stroke="#D2C8BE" stroke-width="2"/>
          <path d="M30 20v54M62 20v54" stroke="#C9BEB2" stroke-width="1.8" opacity="0.8"/>
        </svg>
      {:else if type === 'bifold'}
        <svg width="92" height="92" viewBox="0 0 92 92" fill="none" aria-hidden="true">
          <polygon points="18,18 30,18 38,26 38,72 18,72" fill="#E7DED7"/>
          <polygon points="18,18 30,18 30,72 18,72" fill="#F7F5F2" stroke="#BDAE9F" stroke-width="2.5"/>
          <polygon points="30,18 38,26 38,72 30,72" fill="#D9CBBE"/>
          <polygon points="42,18 54,18 62,26 62,72 42,72" fill="#E7DED7"/>
          <polygon points="42,18 54,18 54,72 42,72" fill="#F7F5F2" stroke="#BDAE9F" stroke-width="2.5"/>
          <polygon points="54,18 62,26 62,72 54,72" fill="#D9CBBE"/>
          <polygon points="66,18 78,18 86,26 86,72 66,72" fill="#E7DED7"/>
          <polygon points="66,18 78,18 78,72 66,72" fill="#F7F5F2" stroke="#BDAE9F" stroke-width="2.5"/>
          <polygon points="78,18 86,26 86,72 78,72" fill="#D9CBBE"/>
          <path d="M38 18v54M46 18v54M62 18v54" stroke="#D0BDAF" stroke-width="2"/>
        </svg>
      {:else}
        <svg width="92" height="92" viewBox="0 0 92 92" fill="none" aria-hidden="true">
          <polygon points="18,20 74,20 80,28 80,74 18,74" fill="#E7DED7"/>
          <polygon points="18,20 74,20 74,74 18,74" fill="#F7F5F2" stroke="#BDAE9F" stroke-width="2.5"/>
          <polygon points="74,20 80,28 80,74 74,74" fill="#D9CBBE"/>
          <path d="M25 36h40M25 58h40" stroke="#D2C8BE" stroke-width="2"/>
          <path d="M38 20V9h16v11" stroke="#C9BEB2" stroke-width="2"/>
        </svg>
      {/if}
    {/if}
  {/snippet}

  {#snippet windowIllustration(type: Win['type'], mode: '2d' | '3d' = windowPreviewMode)}
    {#if mode === '2d'}
      {#if type === 'standard'}
        <svg width="92" height="92" viewBox="0 0 92 92" fill="none" aria-hidden="true">
          <rect x="16" y="20" width="60" height="52" rx="4" fill="#F7F5F2" stroke="#65564B" stroke-width="3"/>
          <path d="M46 20v52M16 46h60" stroke="#65564B" stroke-width="2.5"/>
        </svg>
      {:else if type === 'fixed'}
        <svg width="92" height="92" viewBox="0 0 92 92" fill="none" aria-hidden="true">
          <rect x="16" y="20" width="60" height="52" rx="4" fill="#F7F5F2" stroke="#65564B" stroke-width="3"/>
          <rect x="23" y="27" width="46" height="38" rx="1" stroke="#8a7869" stroke-width="2"/>
        </svg>
      {:else if type === 'casement'}
        <svg width="92" height="92" viewBox="0 0 92 92" fill="none" aria-hidden="true">
          <rect x="20" y="14" width="52" height="64" rx="4" fill="#F7F5F2" stroke="#65564B" stroke-width="3"/>
          <path d="M46 14v64M25 20l21 26-21 26M67 20 46 46l21 26" stroke="#65564B" stroke-width="2.4" stroke-linejoin="round"/>
        </svg>
      {:else if type === 'sliding'}
        <svg width="92" height="92" viewBox="0 0 92 92" fill="none" aria-hidden="true">
          <rect x="14" y="22" width="64" height="48" rx="4" fill="#F7F5F2" stroke="#65564B" stroke-width="3"/>
          <rect x="22" y="29" width="34" height="34" rx="2" stroke="#65564B" stroke-width="2.4"/>
          <rect x="37" y="29" width="34" height="34" rx="2" stroke="#8a7869" stroke-width="2.4"/>
        </svg>
      {:else}
        <svg width="92" height="92" viewBox="0 0 92 92" fill="none" aria-hidden="true">
          <path d="M13 30 27 20h38l14 10v40H13V30Z" fill="#F7F5F2" stroke="#65564B" stroke-width="3" stroke-linejoin="round"/>
          <path d="M27 20v50M65 20v50M27 45h38" stroke="#65564B" stroke-width="2.4"/>
          <path d="m13 30 14 5h38l14-5" stroke="#8a7869" stroke-width="2"/>
        </svg>
      {/if}
    {:else}
      {#if type === 'standard'}
        <svg width="92" height="92" viewBox="0 0 92 92" fill="none" aria-hidden="true">
          <polygon points="18,22 68,22 76,29 76,72 18,72" fill="#e0d5ca"/>
          <polygon points="18,22 68,22 68,72 18,72" fill="#F7F5F2" stroke="#65564B" stroke-width="3"/>
          <polygon points="68,22 76,29 76,72 68,72" fill="#d0c2b4" stroke="#65564B" stroke-width="2"/>
          <path d="M43 22v50M18 47h50" stroke="#65564B" stroke-width="2.4"/>
        </svg>
      {:else if type === 'fixed'}
        <svg width="92" height="92" viewBox="0 0 92 92" fill="none" aria-hidden="true">
          <polygon points="18,22 68,22 76,29 76,72 18,72" fill="#e0d5ca"/>
          <polygon points="18,22 68,22 68,72 18,72" fill="#F7F5F2" stroke="#65564B" stroke-width="3"/>
          <polygon points="68,22 76,29 76,72 68,72" fill="#d0c2b4" stroke="#65564B" stroke-width="2"/>
          <rect x="25" y="29" width="36" height="36" stroke="#8a7869" stroke-width="2"/>
        </svg>
      {:else if type === 'casement'}
        <svg width="92" height="92" viewBox="0 0 92 92" fill="none" aria-hidden="true">
          <polygon points="20,18 64,18 72,25 72,76 20,76" fill="#e0d5ca"/>
          <polygon points="20,18 64,18 64,76 20,76" fill="#F7F5F2" stroke="#65564B" stroke-width="3"/>
          <polygon points="64,18 72,25 72,76 64,76" fill="#d0c2b4" stroke="#65564B" stroke-width="2"/>
          <path d="M42 18v58M24 24l18 25-18 21M60 24 42 49l18 21" stroke="#65564B" stroke-width="2.2" stroke-linejoin="round"/>
        </svg>
      {:else if type === 'sliding'}
        <svg width="92" height="92" viewBox="0 0 92 92" fill="none" aria-hidden="true">
          <polygon points="15,25 70,25 78,32 78,70 15,70" fill="#e0d5ca"/>
          <polygon points="15,25 70,25 70,70 15,70" fill="#F7F5F2" stroke="#65564B" stroke-width="3"/>
          <polygon points="70,25 78,32 78,70 70,70" fill="#d0c2b4" stroke="#65564B" stroke-width="2"/>
          <rect x="22" y="32" width="31" height="31" stroke="#65564B" stroke-width="2.2"/>
          <rect x="36" y="32" width="31" height="31" stroke="#8a7869" stroke-width="2.2"/>
        </svg>
      {:else}
        <svg width="92" height="92" viewBox="0 0 92 92" fill="none" aria-hidden="true">
          <polygon points="13,31 28,20 66,20 79,31 79,72 13,72" fill="#e0d5ca"/>
          <polygon points="13,31 28,20 28,72 13,72" fill="#d0c2b4" stroke="#65564B" stroke-width="2.5"/>
          <polygon points="28,20 66,20 66,72 28,72" fill="#F7F5F2" stroke="#65564B" stroke-width="3"/>
          <polygon points="66,20 79,31 79,72 66,72" fill="#d0c2b4" stroke="#65564B" stroke-width="2.5"/>
          <path d="M28 46h38M20 33l8 3M66 36l7-3" stroke="#65564B" stroke-width="2.2"/>
        </svg>
      {/if}
    {/if}
  {/snippet}

  {#snippet roomTemplateIllustration(name: string)}
    <svg viewBox="0 0 120 78" class="h-[76px] w-full" fill="none" aria-hidden="true">
      
      <rect x="9" y="9" width="102" height="60" rx="3" fill="#F7F3ED" stroke="#58695F" stroke-width="3" />
      {#if name === 'Living Room'}
        <rect x="34" y="13" width="52" height="18" rx="5" fill="#D6C4B1" stroke="#776657" stroke-width="1.5" />
        <path d="M42 14v16M78 14v16M47 18h26M47 25h26" stroke="#9A8572" stroke-width="1.2" />
        <rect x="45" y="38" width="30" height="14" rx="2" fill="#E6D9C9" stroke="#776657" stroke-width="1.5" />
        <path d="M49 42h22M49 47h22" stroke="#B6A48F" stroke-width="1" />
        <rect x="43" y="57" width="34" height="7" rx="2" fill="#9DA79A" stroke="#59695F" stroke-width="1.2" />
        <rect x="49" y="58" width="22" height="4" rx="1" fill="#303B35" />
      {:else if name === 'Bedroom'}
        <rect x="35" y="17" width="50" height="43" rx="3" fill="#D6C4B1" stroke="#776657" stroke-width="1.5" />
        <rect x="39" y="21" width="19" height="10" rx="3" fill="#F8F5EF" stroke="#B6A48F" stroke-width="1" />
        <rect x="62" y="21" width="19" height="10" rx="3" fill="#F8F5EF" stroke="#B6A48F" stroke-width="1" />
        <path d="M37 34h46" stroke="#9A8572" stroke-width="1" />
        <rect x="15" y="20" width="14" height="14" rx="2" fill="#B9A58E" stroke="#776657" stroke-width="1.3" />
        <rect x="91" y="20" width="14" height="14" rx="2" fill="#B9A58E" stroke="#776657" stroke-width="1.3" />
        <rect x="40" y="61" width="40" height="5" rx="1.5" fill="#9DA79A" stroke="#59695F" stroke-width="1" />
      {:else if name === 'Kitchen'}
        <path d="M15 15h90v13H15zM15 28h16v34H15z" fill="#D6C4B1" stroke="#776657" stroke-width="1.5" stroke-linejoin="round" />
        <path d="M31 15v13M48 15v13M65 15v13M82 15v13M15 44h16" stroke="#9A8572" stroke-width="1" />
        <rect x="36" y="17" width="14" height="9" rx="1" fill="#E9E5DE" stroke="#776657" stroke-width="1" />
        <path d="M40 19v5M46 19v5" stroke="#58695F" stroke-width="1" />
        <rect x="56" y="17" width="19" height="9" rx="2" fill="#E9E5DE" stroke="#776657" stroke-width="1" />
        <path d="M60 21h11M65 18v6" stroke="#849186" stroke-width="1" />
        <rect x="86" y="37" width="18" height="25" rx="2" fill="#C1CAC4" stroke="#58695F" stroke-width="1.5" />
        <path d="M89 43h12M98 39v3" stroke="#849186" stroke-width="1" />
        <rect x="45" y="43" width="31" height="15" rx="2" fill="#E3D8C9" stroke="#776657" stroke-width="1.3" />
        <path d="M51 47h19M51 52h19" stroke="#B6A48F" stroke-width="1" />
      {:else if name === 'Bathroom'}
        <rect x="15" y="15" width="31" height="46" rx="8" fill="#DCE8E7" stroke="#738987" stroke-width="1.5" />
        <path d="M20 20h21v36H20z" stroke="#A3B8B5" stroke-width="1" />
        <rect x="66" y="16" width="20" height="7" rx="1.5" fill="#D6C4B1" stroke="#776657" stroke-width="1.3" />
        <path d="M69 29c0-4 3-6 7-6s7 2 7 6v9c0 5-3 8-7 8s-7-3-7-8v-9Z" fill="#F8F5EF" stroke="#738987" stroke-width="1.5" />
        <ellipse cx="76" cy="34" rx="3" ry="5" stroke="#A3B8B5" stroke-width="1" />
        <rect x="59" y="51" width="39" height="12" rx="2" fill="#D6C4B1" stroke="#776657" stroke-width="1.3" />
        <ellipse cx="78.5" cy="57" rx="7" ry="3.5" fill="#F8F5EF" stroke="#738987" stroke-width="1.2" />
      {:else if name === 'Office'}
        <rect x="40" y="15" width="56" height="25" rx="2" fill="#D6C4B1" stroke="#776657" stroke-width="1.5" />
        <rect x="55" y="18" width="26" height="15" rx="1.5" fill="#303B35" stroke="#58695F" stroke-width="1.2" />
        <rect x="65" y="33" width="6" height="4" fill="#849186" />
        <path d="M58 39h20" stroke="#776657" stroke-width="1.5" />
        <circle cx="68" cy="52" r="8" fill="#BFC7BD" stroke="#58695F" stroke-width="1.5" />
        <path d="M68 44v16M60 52h16" stroke="#849186" stroke-width="1" />
        <rect x="15" y="17" width="16" height="43" rx="2" fill="#B9A58E" stroke="#776657" stroke-width="1.4" />
        <path d="M18 28h10M18 39h10M18 50h10" stroke="#E9E1D6" stroke-width="1.2" />
      {:else}
        <rect x="39" y="23" width="42" height="32" rx="3" fill="#D6C4B1" stroke="#776657" stroke-width="1.5" />
        <path d="M45 29h30M45 36h30M45 43h30M45 50h30" stroke="#B6A48F" stroke-width="1" />
        <rect x="45" y="13" width="12" height="8" rx="2" fill="#BFC7BD" stroke="#58695F" stroke-width="1.2" />
        <rect x="63" y="13" width="12" height="8" rx="2" fill="#BFC7BD" stroke="#58695F" stroke-width="1.2" />
        <rect x="45" y="57" width="12" height="8" rx="2" fill="#BFC7BD" stroke="#58695F" stroke-width="1.2" />
        <rect x="63" y="57" width="12" height="8" rx="2" fill="#BFC7BD" stroke="#58695F" stroke-width="1.2" />
        <rect x="27" y="32" width="8" height="12" rx="2" fill="#BFC7BD" stroke="#58695F" stroke-width="1.2" />
        <rect x="85" y="32" width="8" height="12" rx="2" fill="#BFC7BD" stroke="#58695F" stroke-width="1.2" />
      {/if}
    </svg>
  {/snippet}

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
            {@render tile($t('buildTools.round'), 'M12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM7.8 7.8l8.4 8.4M16.2 7.8l-8.4-8.4', isPlacingColumn && placingColumnShapeValue === 'round', () => onPlaceColumn('round'))}
              {@render tile($t('buildTools.square'), 'M6 6h12v12H6zM6 6l12 12M18 6L6 18', isPlacingColumn && placingColumnShapeValue === 'square', () => onPlaceColumn('square'))}
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
                <span class="block truncate text-[13px] text-muted">{$t('buildTools.imageHelp')}</span>
              </span>
            </button>
            <button type="button" class="flex w-full items-center gap-3 rounded-[10px] border border-line bg-white px-3 py-2.5 text-left text-sm transition-colors hover:border-[#B89A86] hover:bg-hover" onclick={onImportRoomPlan}>
              <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sage-tint text-sage-ink">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
              </span>
              <span class="min-w-0">
                <span class="block font-semibold">{$t('buildTools.roomplan')}</span>
                <span class="block truncate text-[13px] text-muted">{$t('buildTools.roomplanHelp')}</span>
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
            <h3 class="ui-section-heading !mb-0">{$t('layers.doors')}</h3>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted transition-transform {constructionOpen ? '' : '-rotate-90'}" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
          </button>

          {#if constructionOpen}
            <div class="seg mb-3">
              <button type="button" class="seg-btn {doorPreviewMode === '2d' ? 'is-on' : ''}" onclick={() => doorPreviewMode = '2d'}>2D</button>
              <button type="button" class="seg-btn {doorPreviewMode === '3d' ? 'is-on' : ''}" onclick={() => doorPreviewMode = '3d'}>3D</button>
            </div>
            <div class="mb-4 grid grid-cols-2 gap-2.5">
              {#each doorCatalog as dc}
                {@const on = currentTool === 'door' && selectedDoorType === dc.type}
                <button
                  class="cat-tile cursor-grab active:cursor-grabbing {on ? 'is-on' : ''}" aria-pressed={on}
                  onclick={() => setDoorType(dc.type)}
                  draggable="true"
                  ondragstart={(e) => { e.dataTransfer?.setData('application/o3d-type', 'door'); e.dataTransfer?.setData('application/o3d-id', dc.type); }}
                >
                  <div class="cat-art door-preview-art h-[92px] text-[#4d4740]">
                    {#snippet doorFallback()}{@render doorIllustration(dc.type, doorPreviewMode)}{/snippet}
                    <CatalogPreview kind="door" type={dc.type} mode={doorPreviewMode} label={dc.name} fallback={doorFallback} />
                  </div>
                  <span class="cat-name">{dc.name}</span>
                  <span class="cat-meta">{dc.desc}</span>
                </button>
              {/each}
            </div>

            <div class="mt-4 border-t border-line pt-4">
              <h3 class="ui-section-heading">{$t('layers.windows')}</h3>
              <div class="seg mb-3">
                <button type="button" class="seg-btn {windowPreviewMode === '2d' ? 'is-on' : ''}" onclick={() => windowPreviewMode = '2d'}>2D</button>
                <button type="button" class="seg-btn {windowPreviewMode === '3d' ? 'is-on' : ''}" onclick={() => windowPreviewMode = '3d'}>3D</button>
              </div>
              <div class="mb-4 grid grid-cols-2 gap-2.5">
              {#each windowCatalog as wc}
                {@const on = currentTool === 'window' && selectedWindowType === wc.type}
                <button
                  class="cat-tile cursor-grab active:cursor-grabbing {on ? 'is-on' : ''}" aria-pressed={on}
                  onclick={() => setWindowType(wc.type)}
                  draggable="true"
                  ondragstart={(e) => { e.dataTransfer?.setData('application/o3d-type', 'window'); e.dataTransfer?.setData('application/o3d-id', wc.type); }}
                >
                  <div class="cat-art door-preview-art h-[92px] text-[#4d4740]">
                    {#snippet windowFallback()}{@render windowIllustration(wc.type, windowPreviewMode)}{/snippet}
                    <CatalogPreview kind="window" type={wc.type} mode={windowPreviewMode} label={wc.name} fallback={windowFallback} />
                  </div>
                  <span class="cat-name">{wc.name}</span>
                  <span class="cat-meta">{wc.desc}</span>
                </button>
              {/each}
            </div>
            </div>
          {/if}
        </section>
      </div>

    {:else if activeTab === 'rooms'}
      <div class="space-y-2">
        {#if existingRooms.length}
          <section>
            {@render sectionTitle($t('roomChoices.existing'))}
            <p class="mb-2 ui-helper-text">{$t('roomChoices.selectHelp')}</p>
            <div class="max-h-36 space-y-1 overflow-y-auto">
              {#each existingRooms as room (room.id)}
                <button type="button" aria-pressed={$selectedRoomId === room.id} onclick={() => selectRoom(room.id)}
                  class="flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors {$selectedRoomId === room.id ? 'border-walnut bg-walnut-tint text-walnut-dark' : 'border-line bg-white text-charcoal hover:border-walnut hover:bg-hover'}">
                  <span class="truncate text-sm font-semibold">{room.name}</span>
                  <span class="shrink-0 text-xs">{formatArea(room.area, $projectSettings.units)}</span>
                </button>
              {/each}
            </div>
          </section>
          <hr class="my-3 border-line" />
        {/if}
        {@render sectionTitle($t('roomChoices.presets'))}
        <p class="mb-3 ui-helper-text">{$t('roomChoices.presetsHelp')}</p>
        <div class="grid grid-cols-2 gap-2">
          {#each roomPresets as preset}
            <button
              class="cat-tile cursor-grab active:cursor-grabbing"
              onclick={() => onPresetClick(preset.id)}
              draggable="true"
              ondragstart={(e) => { e.dataTransfer?.setData('application/o3d-type', 'room'); e.dataTransfer?.setData('application/o3d-id', preset.id); }}
            >
              <div class="cat-art h-[76px]"><svg class="h-[64px] w-full max-w-[100px] shrink-0" viewBox="0 0 112 76" fill="none" aria-hidden="true">
                <path
                  d={preset.id === 'rectangle' ? 'M18 12H94V64H18Z' : preset.id === 'l-shape' ? 'M18 12H94V38H56V64H18Z' : preset.id === 't-shape' ? 'M18 12H94V38H75V64H37V38H18Z' : 'M18 12H38V38H74V12H94V64H18Z'}
                  fill="#485A4F"
                  stroke="#34453A"
                  stroke-width="1.5"
                  stroke-linejoin="round"
                />
                <path
                  d={preset.id === 'rectangle' ? 'M23 17H89V59H23Z' : preset.id === 'l-shape' ? 'M23 17H89V33H51V59H23Z' : preset.id === 't-shape' ? 'M23 17H89V33H70V59H42V33H23Z' : 'M23 17H33V33H79V17H89V59H23Z'}
                  fill="#F8F5EF"
                  stroke="#D6D1C8"
                  stroke-width="0.8"
                  stroke-linejoin="round"
                />
              </svg></div>
              <span class="cat-name">{roomPresetLabels[preset.id] ? $t(roomPresetLabels[preset.id]) : preset.name}</span>
            </button>
          {/each}
        </div>

        <hr class="my-4 border-line" />

        {@render sectionTitle($t('roomChoices.templates'))}
        <p class="mb-3 ui-helper-text">{$t('roomChoices.templatesHelp')}</p>
        <div class="grid grid-cols-2 gap-2">
          {#each roomTemplates as tmpl}
            <button
              class="cat-tile cursor-grab active:cursor-grabbing"
              onclick={() => onPresetClick(tmpl.presetId, tmpl.name)}
              draggable="true"
              ondragstart={(e) => { e.dataTransfer?.setData('application/o3d-type', 'room-template'); e.dataTransfer?.setData('application/o3d-id', tmpl.name); }}
            >
              <div class="cat-art h-[92px]">
                {#snippet roomFallback()}{@render roomTemplateIllustration(tmpl.name)}{/snippet}
                <CatalogPreview kind="room" type={tmpl.name} label={tmpl.name} fallback={roomFallback} />
              </div>
              <span class="cat-name">{roomTemplateLabels[tmpl.name] ? $t(roomTemplateLabels[tmpl.name]) : tmpl.name}</span>
              <span class="cat-meta">{$t(tmpl.furniture.length === 1 ? 'roomChoices.item' : 'roomChoices.items', { count: tmpl.furniture.length })}</span>
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
          <div class="px-1 text-xs text-muted">{$t(filtered.length === 1 ? 'objectControls.result' : 'objectControls.results', { count: filtered.length, query: search })}</div>
        {/if}
        <!-- Category filter -->
        <div class="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
          <button
            class="h-8 rounded-full border px-2.5 text-xs font-semibold transition-colors {selectedCategory === 'All' ? 'border-walnut bg-walnut text-white' : 'border-line bg-white text-charcoal hover:bg-hover'}"
            onclick={() => selectedCategory = 'All'}
          >{$t('objectControls.all')}</button>
          <button
            class="h-8 rounded-full border px-2.5 text-xs font-semibold transition-colors {selectedCategory === 'Favorites' ? 'border-terracotta-ink bg-terracotta-ink text-white' : 'border-line bg-white text-charcoal hover:bg-hover'}"
            onclick={() => selectedCategory = 'Favorites'}
          ><AppIcon name="heart" size={16} /> {$t('objectControls.favorites')}{favoriteIds.length ? ` (${favoriteIds.length})` : ''}</button>
          {#each furnitureCategories as cat}
            <button
              class="h-8 rounded-full border px-2.5 text-xs font-semibold transition-colors {selectedCategory === cat ? 'border-walnut bg-walnut text-white' : 'border-line bg-white text-charcoal hover:bg-hover'}"
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
                    class="cat-tile h-full cursor-grab active:cursor-grabbing {currentPlacing === item.id ? 'is-on' : ''}"
                    onclick={() => onFurnitureClick(item)}
                    draggable="true"
                    ondragstart={(e) => { e.dataTransfer?.setData('application/o3d-type', 'furniture'); e.dataTransfer?.setData('application/o3d-id', item.id); }}
                    onmouseenter={(e) => onItemMouseEnter(e, item)}
                    onmousemove={onItemMouseMove}
                    onmouseleave={onItemMouseLeave}
                  >
                    <div class="cat-art h-[64px] p-1.5"><FurnitureThumbnail catalogId={item.id} name={furnitureName(item.id, $locale)} color={item.color} /></div>
                    <span class="cat-name">{furnitureName(item.id, $locale)}</span>
                  </button>
                  <button
                    class="fav-btn {favoriteIds.includes(item.id) ? 'is-fav' : ''}"
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
                class="cat-tile h-full cursor-grab active:cursor-grabbing {currentPlacing === item.id ? 'is-on' : ''}"
                onclick={() => onFurnitureClick(item)}
                draggable="true"
                ondragstart={(e) => { e.dataTransfer?.setData('application/o3d-type', 'furniture'); e.dataTransfer?.setData('application/o3d-id', item.id); }}
                onmouseenter={(e) => onItemMouseEnter(e, item)}
                onmousemove={onItemMouseMove}
                onmouseleave={onItemMouseLeave}
              >
                <div class="cat-art h-[76px] p-1.5"><FurnitureThumbnail catalogId={item.id} name={furnitureName(item.id, $locale)} color={item.color} /></div>
                {#if s && furnitureName(item.id, $locale).toLowerCase().includes(s)}
                  {@const idx = furnitureName(item.id, $locale).toLowerCase().indexOf(s)}
                  <span class="cat-name">{furnitureName(item.id, $locale).slice(0, idx)}<mark class="rounded-sm bg-wood px-0.5 text-charcoal">{furnitureName(item.id, $locale).slice(idx, idx + s.length)}</mark>{furnitureName(item.id, $locale).slice(idx + s.length)}</span>
                {:else}
                  <span class="cat-name">{furnitureName(item.id, $locale)}</span>
                {/if}
                <span class="cat-meta">{formatLength(item.width, $projectSettings.units)} × {formatLength(item.depth, $projectSettings.units)}</span>
              </button>
              <button
                class="fav-btn {favoriteIds.includes(item.id) ? 'is-fav' : ''}"
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
          {formatLength(item.width, $projectSettings.units)} × {formatLength(item.depth, $projectSettings.units)} × {formatLength(item.height, $projectSettings.units)}
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .cat-tile { display: flex; width: 100%; flex-direction: column; align-items: stretch; gap: 3px; padding: 6px 6px 9px; border: 1px solid var(--color-line); border-radius: 14px; background: #fff; text-align: center; transition: transform .16s, box-shadow .16s, border-color .16s; }
  .cat-tile:hover { transform: translateY(-2px); border-color: #C6D3C8; box-shadow: 0 8px 20px rgba(40, 60, 45, 0.10); }
  .cat-tile.is-on { border-color: var(--color-walnut); box-shadow: 0 0 0 2px rgba(82, 118, 91, 0.22); }
  .cat-tile.is-on .cat-art { background: var(--color-walnut-tint); }
  .cat-art { display: flex; width: 100%; align-items: center; justify-content: center; overflow: hidden; margin-bottom: 4px; border-radius: 10px;
    background: linear-gradient(rgba(82,118,91,.06) 1px, transparent 1px) 0 0 / 12px 12px, linear-gradient(90deg, rgba(82,118,91,.06) 1px, transparent 1px) 0 0 / 12px 12px, #F6F8F4; transition: background-color .16s; }
  .cat-name { padding: 0 2px; font-size: 12.5px; font-weight: 700; line-height: 1.2; color: var(--color-charcoal); }
  .cat-meta { padding: 0 2px; font-size: 11px; font-weight: 500; line-height: 1.2; color: var(--color-muted); }
  .seg { display: flex; gap: 2px; padding: 3px; border: 1px solid var(--color-line); border-radius: 10px; background: var(--color-paper); }
  .seg-btn { flex: 1; border-radius: 7px; padding: 5px 8px; font-size: 11px; font-weight: 700; color: var(--color-muted); transition: background-color .15s, color .15s; }
  .seg-btn:hover { color: var(--color-charcoal); }
  .seg-btn.is-on { background: #fff; color: var(--color-walnut-dark); box-shadow: 0 1px 3px rgba(40, 50, 40, 0.14); }
  .fav-btn { position: absolute; right: 10px; top: 10px; display: flex; height: 24px; width: 24px; align-items: center; justify-content: center; border-radius: 999px; background: rgba(255,255,255,.92); color: #B9B2A9; box-shadow: 0 1px 3px rgba(0,0,0,.10); opacity: 0; transition: opacity .15s, color .15s; }
  .relative:hover > .fav-btn, .fav-btn:focus-visible, .fav-btn.is-fav { opacity: 1; }
  .fav-btn:hover { color: var(--color-terracotta); } .fav-btn.is-fav { color: var(--color-terracotta-ink); }
  :global(.door-preview-art rect),
  :global(.door-preview-art path),
  :global(.door-preview-art polygon) {
    stroke: #65564b;
  }
</style>

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
