import { get } from 'svelte/store';
import type { Board, BoardItem } from '$lib/models/types';
import { activeFloor, currentProject, detectedRoomsStore, mutateProject, beginUndoGroup, endUndoGroup, updateRoom } from '$lib/stores/project';
import { applyFloorFinish, applyRoomWallFinish } from '$lib/utils/finishes';

/** Mood boards live on the project, so they save, undo and export with it. */

const newId = () => Math.random().toString(36).slice(2, 10);

export function projectBoards(): Board[] {
  return get(currentProject)?.boards ?? [];
}

/**
 * Detected rooms get a temporary id until they are saved to the floor; save the
 * room when a board links to it so the link survives rebuilds and reloads.
 */
function ensureRoomSaved(roomId: string | undefined) {
  if (!roomId || get(activeFloor)?.rooms.some(r => r.id === roomId)) return;
  const detected = get(detectedRoomsStore).find(r => r.id === roomId);
  if (detected) updateRoom(roomId, { name: detected.name });
}

export function createBoard(name: string, roomId?: string): string {
  const id = newId();
  beginUndoGroup();
  ensureRoomSaved(roomId);
  mutateProject(p => {
    p.boards = [...(p.boards ?? []), { id, name: name.trim() || 'Untitled board', roomId: roomId || undefined, items: [], createdAt: new Date().toISOString() }];
  });
  endUndoGroup('Create board');
  return id;
}

function editBoard(id: string, fn: (board: Board) => Board, description: string) {
  mutateProject(p => { p.boards = (p.boards ?? []).map(b => b.id === id ? fn({ ...b, items: [...b.items] }) : b); }, description);
}

export function renameBoard(id: string, name: string) {
  editBoard(id, b => ({ ...b, name: name.trim() || b.name }), 'Rename board');
}

export function linkBoardRoom(id: string, roomId: string | undefined) {
  beginUndoGroup();
  ensureRoomSaved(roomId);
  editBoard(id, b => ({ ...b, roomId: roomId || undefined }), 'Link board to room');
  endUndoGroup('Link board to room');
}

export function deleteBoard(id: string) {
  mutateProject(p => { p.boards = (p.boards ?? []).filter(b => b.id !== id); }, 'Delete board');
}

export function addBoardItem(boardId: string, item: Omit<BoardItem, 'id'>): string {
  const id = newId();
  editBoard(boardId, b => ({ ...b, items: [...b.items, { ...item, id }] }), 'Add to board');
  return id;
}

export function updateBoardItem(boardId: string, itemId: string, changes: Partial<BoardItem>) {
  editBoard(boardId, b => ({ ...b, items: b.items.map(i => i.id === itemId ? { ...i, ...changes, id: i.id } : i) }), 'Edit board item');
}

export function removeBoardItem(boardId: string, itemId: string) {
  editBoard(boardId, b => ({ ...b, items: b.items.filter(i => i.id !== itemId) }), 'Remove board item');
}

/**
 * Push a board's finishes onto its linked room: the first wall item paints the
 * room-facing side of its walls and the first floor item sets its floor.
 * Returns what was applied so the panel can say so.
 */
export function applyBoardToRoom(board: Board): { walls: number; floor: boolean } {
  if (!board.roomId) return { walls: 0, floor: false };
  const wall = board.items.find(i => i.kind === 'wall' && i.color);
  const floor = board.items.find(i => i.kind === 'floor' && i.materialId);
  beginUndoGroup();
  const walls = wall ? applyRoomWallFinish(board.roomId, { color: wall.color!, texture: wall.texture }) : 0;
  const floorApplied = floor ? applyFloorFinish('selected', floor.materialId!, board.roomId) > 0 : false;
  endUndoGroup(`Apply board “${board.name}”`);
  return { walls, floor: floorApplied };
}

/** Downscale a photo to a JPEG data URL so boards stay small inside the project file. */
export function compressImage(file: File, maxSide = 1200, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read this image.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('This file is not a supported image.'));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the snapshot.'));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}
