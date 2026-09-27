<script lang="ts">
  import { activeFloor, currentProject, detectedRoomsStore, selectedElementId, selectedRoomId, viewMode } from '$lib/stores/project';
  import { locale } from '$lib/i18n';
  import { furnitureName } from '$lib/i18n/furnitureNames';
  import { floorMaterials, getMaterial, wallColors } from '$lib/utils/materials';
  import { swatchStyle } from '$lib/utils/finishPreviews';
  import { captureMain3DPNG } from '$lib/utils/captureMain3D';
  import { exportBoardPNG } from '$lib/utils/boardExport';
  import {
    addBoardItem, applyBoardToRoom, blobToDataUrl, compressImage, createBoard, deleteBoard, linkBoardRoom,
    removeBoardItem, renameBoard, updateBoardItem,
  } from '$lib/stores/boards';
  import type { Board, BoardItem } from '$lib/models/types';

  /** Boards: mood boards of finishes, furniture, photos and notes, saved with the project. */

  let openId = $state<string | null>(null);
  let newName = $state('');
  let newRoom = $state('');
  let picker = $state<'wall' | 'floor' | 'color' | 'note' | null>(null);
  let noteText = $state('');
  let chipColor = $state('#C96F4A');
  let status = $state('');
  let busy = $state(false);
  let confirmDelete = $state(false);
  let photoInput = $state<HTMLInputElement>();

  const boards = $derived<Board[]>($currentProject?.boards ?? []);
  const board = $derived(boards.find(b => b.id === openId) ?? null);
  const rooms = $derived($detectedRoomsStore);
  const roomName = (id?: string) => rooms.find(r => r.id === id)?.name;
  const selectedWall = $derived($activeFloor?.walls.find(w => w.id === $selectedElementId) ?? null);
  const selectedFurniture = $derived($activeFloor?.furniture.find(f => f.id === $selectedElementId) ?? null);
  const selectedRoom = $derived(rooms.find(r => r.id === $selectedRoomId) ?? null);

  $effect(() => { if (openId && !board) openId = null; });

  function say(message: string) {
    status = message;
    setTimeout(() => { if (status === message) status = ''; }, 3500);
  }

  function create() {
    openId = createBoard(newName || (roomName(newRoom) ? `${roomName(newRoom)} board` : 'New board'), newRoom || undefined);
    newName = ''; newRoom = '';
  }

  function add(item: Omit<BoardItem, 'id'>) {
    if (!board) return;
    addBoardItem(board.id, item);
    picker = null;
  }

  function addSelectedWall() {
    if (!selectedWall) { picker = picker === 'wall' ? null : 'wall'; return; }
    const tex = selectedWall.interiorTexture === 'none' ? undefined : selectedWall.interiorTexture || selectedWall.texture;
    const color = selectedWall.interiorColor || selectedWall.color;
    const named = wallColors.find(c => c.id === tex) ?? wallColors.find(c => c.color.toLowerCase() === color.toLowerCase());
    add({ kind: 'wall', label: named?.name ?? 'Wall finish', color, texture: tex });
  }

  function addSelectedFloor() {
    if (!selectedRoom) { picker = picker === 'floor' ? null : 'floor'; return; }
    const materialId = selectedRoom.floorTexture || 'none';
    add({ kind: 'floor', label: getMaterial(materialId).name, materialId });
  }

  async function onPhoto(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !board) return;
    busy = true;
    try { add({ kind: 'photo', label: file.name.replace(/\.[^.]+$/, ''), dataUrl: await compressImage(file) }); }
    catch (error) { say(error instanceof Error ? error.message : 'Could not add this photo.'); }
    finally { busy = false; }
  }

  async function addSnapshot() {
    if (!board) return;
    if ($viewMode !== '3d') { say('Switch to 3D to pin a snapshot of the current view.'); return; }
    busy = true;
    try {
      const blob = await captureMain3DPNG();
      const file = new File([blob], 'snapshot.png', { type: 'image/png' });
      add({ kind: 'photo', label: '3D view', dataUrl: await compressImage(file, 1400) });
    } catch { say('Could not capture the 3D view.'); }
    finally { busy = false; }
  }

  function apply() {
    if (!board) return;
    const result = applyBoardToRoom(board);
    const parts = [result.walls ? `${result.walls} wall${result.walls === 1 ? '' : 's'}` : '', result.floor ? 'the floor' : ''].filter(Boolean);
    say(parts.length ? `Applied to ${parts.join(' and ')} of ${roomName(board.roomId)}.` : 'Add a wall finish or floor to this board first.');
  }

  async function exportImage() {
    if (!board) return;
    busy = true;
    try { await exportBoardPNG(board, $currentProject?.name ?? 'Planora', roomName(board.roomId)); }
    catch { say('Could not export the board.'); }
    finally { busy = false; }
  }

  function preview(item: BoardItem): string {
    if (item.kind === 'wall') return swatchStyle('wall', item.texture, item.color);
    if (item.kind === 'floor') return swatchStyle('floor', item.materialId === 'none' ? undefined : item.materialId, getMaterial(item.materialId ?? 'none').color);
    if (item.kind === 'color') return `background-color: ${item.color};`;
    if (item.kind === 'photo') return `background-image: url(${item.dataUrl}); background-size: cover; background-position: center;`;
    return 'background-color: #F3ECE3;';
  }
</script>

{#snippet addButton(label: string, onclick: () => void, active = false, disabled = false, title = '')}
  <button type="button" {onclick} {disabled} {title} aria-pressed={active}
    class="flex h-9 items-center justify-center rounded-[10px] border px-2 text-[11.5px] font-semibold transition-colors disabled:opacity-40 {active ? 'border-walnut bg-walnut-tint text-walnut-dark' : 'border-line bg-white text-charcoal hover:bg-hover'}">{label}</button>
{/snippet}

<div class="space-y-4">
  {#if status}<p role="status" class="rounded-[10px] bg-sage-tint px-3 py-2 text-xs font-medium text-sage-ink">{status}</p>{/if}

  {#if !board}
    <!-- Board list -->
    {#if boards.length}
      <div class="space-y-2">
        {#each boards as b (b.id)}
          <button type="button" class="flex w-full items-center gap-3 rounded-[12px] border border-line bg-white p-2.5 text-left transition-colors hover:border-walnut hover:bg-walnut-tint" onclick={() => openId = b.id}>
            <span class="grid h-12 w-12 shrink-0 grid-cols-2 gap-0.5 overflow-hidden rounded-lg border border-line bg-ivory">
              {#each b.items.slice(0, 4) as item (item.id)}<span style={preview(item)}></span>{/each}
            </span>
            <span class="min-w-0">
              <span class="block truncate text-sm font-bold text-charcoal">{b.name}</span>
              <span class="block truncate text-[11px] text-muted">{[roomName(b.roomId), `${b.items.length} item${b.items.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}</span>
            </span>
          </button>
        {/each}
      </div>
    {:else}
      <p class="rounded-[12px] border border-dashed border-line p-4 text-center text-xs text-muted">Collect finishes, furniture, photos and notes for each room, then apply them or share the board as an image.</p>
    {/if}

    <form class="space-y-2 rounded-[12px] border border-line bg-white p-3" onsubmit={(e) => { e.preventDefault(); create(); }}>
      <span class="block text-xs font-bold text-charcoal">New board</span>
      <input bind:value={newName} placeholder="Board name, e.g. Living room" aria-label="Board name"
        class="h-9 w-full rounded-[10px] border border-line bg-cream px-3 text-sm text-charcoal outline-none focus:border-walnut" />
      <select bind:value={newRoom} aria-label="Room for this board" class="h-9 w-full rounded-[10px] border border-line bg-cream px-2 text-sm text-charcoal">
        <option value="">Not linked to a room</option>
        {#each rooms as r (r.id)}<option value={r.id}>{r.name}</option>{/each}
      </select>
      <button type="submit" class="h-9 w-full rounded-[10px] bg-walnut text-sm font-semibold text-white hover:bg-walnut-dark">Create board</button>
    </form>
  {:else}
    <!-- Open board -->
    <div class="flex items-center gap-2">
      <button type="button" class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-hover hover:text-charcoal" aria-label="All boards" onclick={() => { openId = null; picker = null; confirmDelete = false; }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
      </button>
      <input value={board.name} aria-label="Board name" onchange={(e) => renameBoard(board.id, (e.target as HTMLInputElement).value)}
        class="h-8 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1.5 text-sm font-bold text-charcoal hover:border-line focus:border-walnut focus:bg-white focus:outline-none" />
    </div>

    <div class="flex items-center gap-2">
      <select value={board.roomId ?? ''} aria-label="Linked room" onchange={(e) => linkBoardRoom(board.id, (e.target as HTMLSelectElement).value)}
        class="h-9 min-w-0 flex-1 rounded-[10px] border border-line bg-white px-2 text-xs text-charcoal">
        <option value="">Not linked to a room</option>
        {#each rooms as r (r.id)}<option value={r.id}>{r.name}</option>{/each}
      </select>
      <button type="button" class="h-9 shrink-0 rounded-[10px] bg-walnut px-3 text-xs font-semibold text-white hover:bg-walnut-dark disabled:opacity-40"
        disabled={!board.roomId} title={board.roomId ? 'Apply this board’s wall finish and floor to the room' : 'Link a room first'} onclick={apply}>Apply to room</button>
    </div>

    <!-- Add to board -->
    <div>
      <span class="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Add to board</span>
      <div class="grid grid-cols-3 gap-1.5">
        {@render addButton('Wall finish', addSelectedWall, picker === 'wall', false, selectedWall ? 'Add the selected wall’s finish' : 'Choose a wall finish')}
        {@render addButton('Floor', addSelectedFloor, picker === 'floor', false, selectedRoom ? 'Add the selected room’s floor' : 'Choose a floor')}
        {@render addButton('Furniture', () => selectedFurniture && add({ kind: 'furniture', label: furnitureName(selectedFurniture.catalogId, $locale), catalogId: selectedFurniture.catalogId }), false, !selectedFurniture, selectedFurniture ? 'Add the selected furniture' : 'Select a piece of furniture on the plan')}
        {@render addButton('Photo', () => photoInput?.click(), false, busy)}
        {@render addButton('3D snapshot', addSnapshot, false, busy, 'Pin the current 3D view')}
        {@render addButton('Colour', () => picker = picker === 'color' ? null : 'color', picker === 'color')}
        {@render addButton('Note', () => picker = picker === 'note' ? null : 'note', picker === 'note')}
      </div>
      <input type="file" accept="image/png,image/jpeg,image/webp" class="hidden" bind:this={photoInput} onchange={onPhoto} />

      {#if picker === 'wall'}
        <div class="mt-2 grid grid-cols-6 gap-1.5 rounded-[12px] border border-line bg-white p-2">
          {#each wallColors as c (c.id)}
            <button type="button" class="aspect-square rounded-md border border-line" style={swatchStyle('wall', c.texture ? c.id : undefined, c.color)} title={c.name}
              aria-label={`Add ${c.name}`} onclick={() => add({ kind: 'wall', label: c.name, color: c.color, texture: c.texture ? c.id : undefined })}></button>
          {/each}
        </div>
      {:else if picker === 'floor'}
        <div class="mt-2 grid grid-cols-5 gap-1.5 rounded-[12px] border border-line bg-white p-2">
          {#each floorMaterials as m (m.id)}
            <button type="button" class="aspect-square rounded-md border border-line" style={swatchStyle('floor', m.id === 'none' ? undefined : m.id, m.color)} title={m.name}
              aria-label={`Add ${m.name}`} onclick={() => add({ kind: 'floor', label: m.name, materialId: m.id })}></button>
          {/each}
        </div>
      {:else if picker === 'color'}
        <div class="mt-2 flex items-center gap-2 rounded-[12px] border border-line bg-white p-2">
          <input type="color" bind:value={chipColor} aria-label="Colour" class="h-8 w-10 cursor-pointer rounded border border-line" />
          <span class="flex-1 font-mono text-xs text-muted">{chipColor}</span>
          <button type="button" class="h-8 rounded-lg bg-walnut px-3 text-xs font-semibold text-white" onclick={() => add({ kind: 'color', label: chipColor.toUpperCase(), color: chipColor })}>Add</button>
        </div>
      {:else if picker === 'note'}
        <form class="mt-2 space-y-2 rounded-[12px] border border-line bg-white p-2" onsubmit={(e) => { e.preventDefault(); if (noteText.trim()) { add({ kind: 'note', label: 'Note', note: noteText.trim() }); noteText = ''; } }}>
          <textarea bind:value={noteText} rows="3" placeholder="e.g. Keep the lounge bright; linen curtains" aria-label="Note"
            class="w-full resize-none rounded-lg border border-line bg-cream p-2 text-xs text-charcoal outline-none focus:border-walnut"></textarea>
          <button type="submit" class="h-8 w-full rounded-lg bg-walnut text-xs font-semibold text-white">Add note</button>
        </form>
      {/if}
    </div>

    <!-- Items -->
    {#if board.items.length}
      <div class="grid grid-cols-2 gap-2">
        {#each board.items as item (item.id)}
          <div class="group relative overflow-hidden rounded-[12px] border border-line bg-white">
            {#if item.kind === 'note'}
              <div class="h-20 overflow-hidden bg-[#FFF8E6] p-2 text-[11.5px] leading-snug text-walnut-dark">{item.note}</div>
            {:else if item.kind === 'furniture'}
              <div class="flex h-20 flex-col items-center justify-center bg-walnut-tint px-2 text-center">
                <span class="text-[9px] font-bold uppercase tracking-wider text-muted">Furniture</span>
                <span class="text-xs font-bold text-walnut-dark">{item.label}</span>
              </div>
            {:else}
              <div class="h-20" style={preview(item)}></div>
            {/if}
            <div class="p-2">
              <span class="block truncate text-[11.5px] font-bold text-charcoal">{item.label}</span>
              {#if item.kind !== 'note'}
                <input value={item.note ?? ''} placeholder="Add a caption" aria-label={`Caption for ${item.label}`}
                  onchange={(e) => updateBoardItem(board.id, item.id, { note: (e.target as HTMLInputElement).value || undefined })}
                  class="mt-0.5 w-full rounded border border-transparent bg-transparent px-0.5 text-[11px] text-muted hover:border-line focus:border-walnut focus:outline-none" />
              {/if}
            </div>
            <button type="button" aria-label={`Remove ${item.label}`} onclick={() => removeBoardItem(board.id, item.id)}
              class="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-sm text-muted opacity-0 shadow-sm transition-opacity hover:text-danger focus:opacity-100 group-hover:opacity-100">×</button>
          </div>
        {/each}
      </div>
    {:else}
      <p class="rounded-[12px] border border-dashed border-line p-4 text-center text-xs text-muted">This board is empty. Add a wall finish, floor, furniture, a photo or a note.</p>
    {/if}

    <div class="grid grid-cols-2 gap-2">
      <button type="button" class="h-9 rounded-[10px] border border-line bg-white text-xs font-semibold text-charcoal hover:bg-hover disabled:opacity-40"
        disabled={busy || !board.items.length} onclick={exportImage}>Export image</button>
      {#if confirmDelete}
        <button type="button" class="h-9 rounded-[10px] bg-danger text-xs font-semibold text-white" onclick={() => { deleteBoard(board.id); openId = null; confirmDelete = false; }}>Confirm delete</button>
      {:else}
        <button type="button" class="h-9 rounded-[10px] border border-line bg-white text-xs font-semibold text-danger hover:bg-hover" onclick={() => confirmDelete = true}>Delete board</button>
      {/if}
    </div>
  {/if}
</div>
