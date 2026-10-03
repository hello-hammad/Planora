<script lang="ts">
  import AppIcon from '$lib/components/AppIcon.svelte';
  const categoryIcons: Record<string, string> = { indoor: 'house', outdoor: 'trees', garage: 'car', uncategorized: 'box' };
  import { t } from '$lib/i18n';
  import { activeFloor, detectedRoomsStore } from '$lib/stores/project';
  import { projectSettings, formatArea, formatLength } from '$lib/stores/settings';
  import type { Room, Wall, RoomCategory } from '$lib/models/types';
  import { resolveRooms, resolveRoomGeometry } from '$lib/utils/roomDetection';
  import { roomHoles } from '$lib/utils/roomNesting';
  import { interiorRoomArea } from '$lib/utils/interiorArea';
    import { getOuterWalls } from '$lib/utils/outerWalls';

  // Auto subscriptions end when the summary dialog closes.
  let floor = $derived($activeFloor);
  let detectedRooms = $derived($detectedRoomsStore);
  let settings = $derived($projectSettings);
  type SummaryCategory = Exclude<RoomCategory, 'utility'> | 'uncategorized';

  // Geometry supplies current areas; saved boundaries supply names/categories.
  let allRooms = $derived(floor ? resolveRooms(floor, detectedRooms) : []);

  let totalArea = $derived(allRooms.reduce((sum: number, r: Room) => sum + r.area, 0));
  let interiorArea = $derived.by(() => {
    if (!floor) return 0;
    const geometry = resolveRoomGeometry(floor, detectedRooms);
    const holes = roomHoles(geometry.map(item => item.polygon));
    let total = 0;
    for (let i = 0; i < geometry.length; i++) {
      if (geometry[i].room.floorOpening) continue;
      const area = interiorRoomArea(geometry[i].polygon, holes[i], floor.walls);
      if (area === null) return null;
      total += area;
    }
    return total;
  });

  let roomsByCategory = $derived.by(() => {
    const cats: Record<SummaryCategory, Room[]> = { indoor: [], outdoor: [], garage: [], uncategorized: [] };
    for (const r of allRooms) {
      const cat = String(r.roomType ?? 'indoor');
      // Imported projects can retain category values outside the current model.
      // Legacy utility rooms remain included in the indoor total.
      if (cat === 'utility' || cat === 'indoor') cats.indoor.push(r);
      else if (cat === 'outdoor' || cat === 'garage') cats[cat].push(r);
      else cats.uncategorized.push(r);
    }
    return cats;
  });

  let categoryTotals = $derived.by(() => {
    const cats = roomsByCategory;
    const result: { category: SummaryCategory; label: string; area: number; count: number }[] = [];
    const labels: Record<SummaryCategory, string> = { indoor: $t('areaSummary.indoor'), outdoor: $t('areaSummary.outdoor'), garage: $t('areaSummary.garage'), uncategorized: $t('areaSummary.uncategorized') };
    for (const [cat, rooms] of Object.entries(cats) as [SummaryCategory, Room[]][]) {
      if (rooms.length > 0) {
        result.push({ category: cat, label: labels[cat], area: rooms.reduce((s: number, r: Room) => s + r.area, 0), count: rooms.length });
      }
    }
    return result;
  });

  // Quick stats
  let totalWalls = $derived(floor?.walls.length ?? 0);
  let totalDoors = $derived(floor?.doors.length ?? 0);
  let totalWindows = $derived(floor?.windows.length ?? 0);

  function calcWallLength(wall: Wall): number {
    if (wall.curvePoint) {
      let len = 0; const N = 20;
      let px = wall.start.x, py = wall.start.y;
      for (let i = 1; i <= N; i++) {
        const t = i / N, mt = 1 - t;
        const nx = mt*mt*wall.start.x + 2*mt*t*wall.curvePoint.x + t*t*wall.end.x;
        const ny = mt*mt*wall.start.y + 2*mt*t*wall.curvePoint.y + t*t*wall.end.y;
        len += Math.hypot(nx - px, ny - py); px = nx; py = ny;
      }
      return len;
    }
    return Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
  }

  let totalWallLength = $derived((floor?.walls ?? []).reduce((s: number, w: Wall) => s + calcWallLength(w), 0));
  let exteriorPerimeter = $derived((floor ? getOuterWalls(floor.walls) : []).reduce((sum, wall) => sum + calcWallLength(wall), 0));

  function roomBoundaryLength(room: Room): number {
    const wallIds = new Set(room.walls);
    return (floor?.walls ?? []).filter(wall => wallIds.has(wall.id)).reduce((sum, wall) => sum + calcWallLength(wall), 0);
  }
</script>

<div class="space-y-3">
  <div class="flex items-center justify-between gap-3">
    <span class="text-xs font-semibold text-muted">{$t('settings.metricsUnit')}</span>
    <div class="flex rounded-lg border border-line bg-ivory p-0.5" role="group" aria-label={$t('settings.metricsUnit')}>
      <button type="button" aria-pressed={settings.units === 'metric'} onclick={() => projectSettings.update(current => ({ ...current, units: 'metric' }))}
        class="rounded-md px-2.5 py-1 text-xs font-semibold transition-colors {settings.units === 'metric' ? 'bg-walnut text-white' : 'text-charcoal hover:bg-hover'}">{$t('settings.metric')}</button>
      <button type="button" aria-pressed={settings.units === 'imperial'} onclick={() => projectSettings.update(current => ({ ...current, units: 'imperial' }))}
        class="rounded-md px-2.5 py-1 text-xs font-semibold transition-colors {settings.units === 'imperial' ? 'bg-walnut text-white' : 'text-charcoal hover:bg-hover'}">{$t('settings.imperial')}</button>
    </div>
  </div>
  <div class="rounded-lg border border-line bg-ivory p-2 text-xs text-charcoal" data-testid="interior-area-summary">
    <div class="flex justify-between gap-2">
      <span>{$t('areaSummary.interiorArea')}</span>
      <strong>{interiorArea === null ? $t('areaSummary.unavailable') : formatArea(interiorArea, settings.units)}</strong>
    </div>
    <p class="mt-1 text-muted">{$t('areaSummary.boundaryExplanation')}</p>
  </div>
  <!-- Quick Stats -->
  <div class="grid grid-cols-2 gap-2">
    <div class="rounded-lg border border-line bg-ivory p-2 text-center">
      <div class="text-lg font-bold text-charcoal">{allRooms.length}</div>
      <div class="text-[10px] font-medium text-muted">{$t('areaSummary.rooms')}</div>
    </div>
    <div class="rounded-lg border border-walnut/30 bg-walnut-tint p-2 text-center">
      <div class="text-lg font-bold text-walnut-dark">{formatArea(totalArea, settings.units)}</div>
      <div class="text-[10px] font-medium text-walnut-dark">{$t('areaSummary.totalArea')}</div>
    </div>
    <div class="rounded-lg border border-line bg-ivory p-2 text-center">
      <div class="text-sm font-bold text-charcoal">{$t('areaSummary.openingCounts', { doors: totalDoors, windows: totalWindows })}</div>
      <div class="text-[10px] font-medium text-muted">{$t('areaSummary.doorsWindows')}</div>
    </div>
    <div class="rounded-lg border border-line bg-ivory p-2 text-center">
      <div class="text-sm font-bold text-charcoal">{formatLength(totalWallLength, settings.units)}</div>
      <div class="text-[10px] font-medium text-muted">{$t('areaSummary.wallLength')}</div>
    </div>
    <div class="col-span-2 rounded-lg border border-line bg-cream p-2 text-center">
      <div class="text-sm font-bold text-charcoal">{formatLength(exteriorPerimeter, settings.units)}</div>
      <div class="text-[10px] font-medium text-muted">{$t('areaSummary.exteriorPerimeter')}</div>
    </div>
  </div>

  <!-- Category Breakdown -->
  {#if categoryTotals.length > 0}
    <div>
      <h4 class="mb-1.5 text-xs font-semibold uppercase text-muted">{$t('areaSummary.byCategory')}</h4>
      <div class="space-y-1">
        {#each categoryTotals as cat}
          <div class="flex items-center justify-between rounded border border-line bg-ivory px-2 py-1.5 text-xs">
            <span class="flex items-center gap-1.5 text-charcoal"><AppIcon name={categoryIcons[cat.category] ?? 'box'} size={14} class="text-muted" />{cat.label} <span class="text-muted">({cat.count})</span></span>
            <span class="font-semibold text-charcoal">{formatArea(cat.area, settings.units)}</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Per-Room Breakdown -->
  {#if allRooms.length > 0}
    <div>
      <h4 class="mb-1.5 text-xs font-semibold uppercase text-muted">{$t('areaSummary.roomBreakdown')}</h4>
      <div class="space-y-0.5">
        {#each allRooms as room}
          {@const pct = totalArea > 0 ? (room.area / totalArea * 100) : 0}
          <div class="flex items-center gap-1.5 text-xs px-1 py-1">
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between">
                <span class="truncate font-medium text-charcoal">{room.name}</span>
                <span class="ml-1 shrink-0 text-muted">{formatArea(room.area, settings.units)}</span>
              </div>
              <div class="flex justify-between text-[11px] text-muted">
                <span>{$t('areaSummary.roomWallLength')}</span>
                <span>{formatLength(roomBoundaryLength(room), settings.units)}</span>
              </div>
              <div class="mt-0.5 h-1 w-full rounded-full bg-line">
                <div class="h-1 rounded-full bg-walnut" style="width: {Math.min(pct, 100)}%"></div>
              </div>
            </div>
            <span class="w-8 shrink-0 text-right text-[10px] text-muted">{pct.toFixed(0)}%</span>
          </div>
        {/each}
      </div>
    </div>
  {:else}
    <p class="text-xs text-gray-400 text-center py-4">{$t('areaSummary.noRooms')}<br/>{$t('areaSummary.drawWalls')}</p>
  {/if}
</div>
