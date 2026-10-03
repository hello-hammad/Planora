<script lang="ts">
  import { activeFloor, currentProject, detectedRoomsStore, selectedElementId, selectedRoomId } from '$lib/stores/project';
  import { floorMaterials, wallColors } from '$lib/utils/materials';
  import {
    applyFloorFinish, applyPalette, applyWallFinish, finishPalettes, floorTargetRooms, readRecentFinishes, rememberFinish, setTrimFinish,
    type FloorTarget, type RecentFinish, type WallFinish, type WallSide, type WallTarget,
  } from '$lib/utils/finishes';
  import { swatchStyle } from '$lib/utils/finishPreviews';
  import type { ProjectFinishes } from '$lib/models/types';

  /** Finishes: choose materials for walls, floors and trim across the whole house. */

  let wallTarget = $state<WallTarget>('outside');
  let wallSide = $state<WallSide>('both');
  let floorTarget = $state<FloorTarget>('all');
  let status = $state('');
  let recent = $state<RecentFinish[]>(readRecentFinishes());

  const selectedWall = $derived($activeFloor?.walls.find(w => w.id === $selectedElementId) ?? null);
  const selectedRoom = $derived($detectedRoomsStore.find(r => r.id === $selectedRoomId) ?? null);
  const trim = $derived<ProjectFinishes>($currentProject?.finishes ?? {});

  // Pick a sensible target when the selection changes.
  $effect(() => { if (selectedWall) wallTarget = 'selected'; else if (wallTarget === 'selected') wallTarget = 'outside'; });
  $effect(() => { if (selectedRoom) floorTarget = 'selected'; else if (floorTarget !== 'all') floorTarget = 'all'; });

  const plainColors = wallColors.filter(c => !c.texture);
  const materials = wallColors.filter(c => c.texture);
  const wallTargets: { id: WallTarget; label: string; hint: string }[] = [
    { id: 'selected', label: 'Selected wall', hint: 'The wall selected on the plan' },
    { id: 'outside', label: 'House exterior', hint: 'Every outside face of the house' },
    { id: 'inside', label: 'All interiors', hint: 'Every face inside a room' },
    { id: 'all', label: 'Every wall', hint: 'Both sides of every wall' },
  ];
  const floorTargets = $derived<{ id: FloorTarget; label: string; disabled: boolean }[]>([
    { id: 'selected', label: selectedRoom ? selectedRoom.name : 'Selected room', disabled: !selectedRoom },
    { id: 'same', label: selectedRoom ? `All “${selectedRoom.name.replace(/\d+/g, '').trim()}”` : 'Same type', disabled: !selectedRoom },
    { id: 'all', label: 'All rooms', disabled: false },
  ]);
  const trimRows: { key: keyof ProjectFinishes; label: string; presets: string[] }[] = [
    { key: 'doors', label: 'Doors', presets: ['#ffffff', '#d1d5db', '#8b6914', '#6b4636', '#3b3f44', '#1e3a8a'] },
    { key: 'windowFrames', label: 'Window frames', presets: ['#ffffff', '#e0e0e0', '#8b6914', '#4a3026', '#3b3f44', '#252321'] },
    { key: 'ceiling', label: 'Ceiling', presets: ['#ffffff', '#fffdf9', '#f5f5f0', '#faf7f2', '#e7d2bc', '#d4e2d4'] },
  ];

  function say(message: string) {
    status = message;
    setTimeout(() => { if (status === message) status = ''; }, 3500);
  }

  function wallCount(n: number) {
    return n === 0 ? 'No walls matched — draw closed rooms so Planora can tell inside from outside.' : `Applied to ${n} wall${n === 1 ? '' : 's'}.`;
  }

  function paintWalls(finish: WallFinish) {
    const n = applyWallFinish(wallTarget, finish, { selectedId: selectedWall?.id, side: wallSide });
    recent = rememberFinish({ kind: 'wall', color: finish.color, texture: finish.texture });
    say(wallTarget === 'selected' && !selectedWall ? 'Select a wall on the plan first.' : wallCount(n));
  }

  function matchSelected() {
    if (!selectedWall) return;
    const side = wallSide === 'interior' ? 'interior' : 'exterior';
    const color = (side === 'interior' ? selectedWall.interiorColor : selectedWall.exteriorColor) || selectedWall.color;
    const tex = side === 'interior' ? selectedWall.interiorTexture : selectedWall.exteriorTexture;
    const texture = tex === 'none' ? undefined : tex || selectedWall.texture;
    const target = wallTarget === 'selected' ? 'outside' : wallTarget;
    const n = applyWallFinish(target, { color, texture });
    say(`Matched the selected wall's ${side} on ${n} wall${n === 1 ? '' : 's'}.`);
  }

  function paintFloors(materialId: string) {
    const n = applyFloorFinish(floorTarget, materialId, $selectedRoomId);
    recent = rememberFinish({ kind: 'floor', materialId });
    say(n === 0 ? 'No rooms yet — close walls into a room first.' : `Applied to ${n} room${n === 1 ? '' : 's'}.`);
  }

  function useRecent(finish: RecentFinish) {
    if (finish.kind === 'wall') paintWalls({ color: finish.color, texture: finish.texture });
    else paintFloors(finish.materialId);
  }

  const floorCount = $derived(floorTargetRooms(floorTarget, $selectedRoomId).length);
</script>

{#snippet chip(active: boolean, label: string, onclick: () => void, disabled = false, title = '')}
  <button type="button" {disabled} {title} aria-pressed={active} {onclick}
    class="h-9 rounded-full border px-3 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 {active ? 'border-walnut bg-walnut text-white' : 'border-line bg-white text-charcoal hover:bg-hover'}">{label}</button>
{/snippet}

{#snippet heading(text: string)}
  <h3 class="ui-section-heading">{text}</h3>
{/snippet}

<div class="space-y-6">
  {#if status}<p role="status" class="rounded-[10px] bg-sage-tint px-3 py-2 ui-helper-text font-medium text-sage-ink">{status}</p>{/if}

  <!-- Palettes -->
  <section>
    {@render heading('Palettes')}
    <div class="grid grid-cols-2 gap-2">
      {#each finishPalettes as palette (palette.id)}
        <button type="button" class="group flex flex-col gap-2 rounded-[12px] border border-line bg-white p-2.5 text-left transition-colors hover:border-walnut hover:bg-walnut-tint"
          title={palette.description} onclick={() => { applyPalette(palette); say(`${palette.name} applied to the whole house.`); }}>
          <span class="flex h-10 overflow-hidden rounded-lg border border-line">
            <span class="flex-1" style={swatchStyle('wall', palette.exterior.texture, palette.exterior.color)}></span>
            <span class="flex-1" style={swatchStyle('wall', undefined, palette.interior.color)}></span>
            <span class="flex-1" style={swatchStyle('floor', palette.floor, undefined)}></span>
            <span class="w-3" style="background-color: {palette.trim.doors}"></span>
          </span>
          <span class="ui-card-title">{palette.name}</span>
        </button>
      {/each}
    </div>
    <p class="mt-1.5 ui-helper-text">Sets outside walls, inside walls, floors, doors, frames and ceilings at once. Undo reverts it.</p>
  </section>

  <!-- Walls -->
  <section>
    {@render heading('Walls')}
    <div class="mb-2 flex flex-wrap gap-1.5" role="group" aria-label="Apply wall finish to">
      {#each wallTargets as target (target.id)}
        {@render chip(wallTarget === target.id, target.label, () => wallTarget = target.id, target.id === 'selected' && !selectedWall, target.hint)}
      {/each}
    </div>
    {#if wallTarget === 'selected'}
      <div class="mb-2 grid grid-cols-3 gap-0.5 rounded-lg border border-line bg-ivory p-0.5" role="group" aria-label="Side">
        {#each ([['both', 'Both sides'], ['exterior', 'Outside'], ['interior', 'Inside']] as const) as [side, label]}
          <button type="button" aria-pressed={wallSide === side} onclick={() => wallSide = side}
            class="rounded-md py-1.5 ui-control-label {wallSide === side ? 'bg-white shadow-sm' : 'text-muted hover:text-charcoal'}">{label}</button>
        {/each}
      </div>
    {/if}
    <div class="grid grid-cols-8 gap-1.5">
      {#each plainColors as c (c.id)}
        <button type="button" class="aspect-square rounded-md border border-line transition-transform hover:scale-110" style="background-color: {c.color}"
          title={c.name} aria-label={`Paint ${c.name}`} onclick={() => paintWalls({ color: c.color })}></button>
      {/each}
    </div>
    <div class="mt-2 grid grid-cols-3 gap-1.5">
      {#each materials as m (m.id)}
        <button type="button" class="flex h-14 items-end overflow-hidden rounded-lg border border-line transition-colors hover:border-walnut" style={swatchStyle('wall', m.id, m.color)}
          title={m.name} onclick={() => paintWalls({ color: m.color, texture: m.id })}>
          <span class="m-1 rounded bg-white/85 px-1 ui-card-meta text-charcoal">{m.name}</span>
        </button>
      {/each}
    </div>
    {#if selectedWall && wallTarget !== 'selected'}
      <button type="button" class="mt-2 w-full rounded-[10px] border border-dashed border-line py-2 ui-control-label text-walnut hover:border-walnut"
        onclick={matchSelected}>Match the selected wall's finish</button>
    {/if}
  </section>

  <!-- Floors -->
  <section>
    {@render heading('Floors')}
    <div class="mb-2 flex flex-wrap gap-1.5" role="group" aria-label="Apply floor finish to">
      {#each floorTargets as target (target.id)}
        {@render chip(floorTarget === target.id, target.label, () => floorTarget = target.id, target.disabled)}
      {/each}
    </div>
    <div class="grid grid-cols-3 gap-1.5">
      {#each floorMaterials as m (m.id)}
        <button type="button" class="flex h-14 items-end overflow-hidden rounded-lg border border-line transition-colors hover:border-walnut" style={swatchStyle('floor', m.id === 'none' ? undefined : m.id, m.color)}
          title={m.name} onclick={() => paintFloors(m.id)}>
          <span class="m-1 rounded bg-white/85 px-1 ui-card-meta text-charcoal">{m.name}</span>
        </button>
      {/each}
    </div>
    <p class="mt-1.5 ui-helper-text">{floorCount} room{floorCount === 1 ? '' : 's'} will change. Select a room on the plan to target it.</p>
  </section>

  <!-- Trim -->
  <section>
    {@render heading('Doors, frames & ceilings')}
    <div class="space-y-2.5">
      {#each trimRows as row (row.key)}
        <div class="flex items-center gap-2">
          <span class="w-24 shrink-0 ui-control-label">{row.label}</span>
          <div class="flex flex-1 flex-wrap gap-1">
            {#each row.presets as color}
              <button type="button" class="h-6 w-6 rounded-md border transition-transform hover:scale-110 {trim[row.key] === color ? 'border-walnut ring-2 ring-walnut/30' : 'border-line'}"
                style="background-color: {color}" aria-label={`${row.label} ${color}`} onclick={() => setTrimFinish(row.key, color)}></button>
            {/each}
            <input type="color" value={trim[row.key] ?? row.presets[0]} aria-label={`${row.label} custom colour`}
              onchange={(e) => setTrimFinish(row.key, (e.target as HTMLInputElement).value)} class="h-6 w-7 cursor-pointer rounded border border-line" />
          </div>
        </div>
      {/each}
    </div>
  </section>

  <!-- Recently used -->
  {#if recent.length}
    <section>
      {@render heading('Recently used')}
      <div class="flex flex-wrap gap-1.5">
        {#each recent as finish, i (i)}
          <button type="button" class="h-9 w-9 rounded-lg border border-line transition-transform hover:scale-110"
            style={finish.kind === 'wall' ? swatchStyle('wall', finish.texture, finish.color) : swatchStyle('floor', finish.materialId, undefined)}
            title={finish.kind === 'wall' ? 'Apply to walls again' : 'Apply to floors again'}
            aria-label={finish.kind === 'wall' ? `Recent wall finish ${finish.texture ?? finish.color}` : `Recent floor ${finish.materialId}`}
            onclick={() => useRecent(finish)}></button>
        {/each}
      </div>
    </section>
  {/if}
</div>
