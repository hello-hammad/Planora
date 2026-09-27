import { get } from 'svelte/store';
import type { Floor, Point, ProjectFinishes, Wall } from '$lib/models/types';
import { resolveRoomGeometry } from '$lib/utils/roomDetection';
import { frontFacesInterior, pointInPolygon, wallFaceProbes } from '$lib/utils/wallJoins';
import { activeFloor, beginUndoGroup, detectedRoomsStore, endUndoGroup, mutateProject, updateRoom, updateWall } from '$lib/stores/project';

/**
 * House-wide finish tools behind the Finishes panel and mood boards.
 *
 * A wall has two finish slots, "interior" and "exterior". The 3D viewer paints
 * the interior slot on the face that looks into a room, so these helpers work
 * out, per wall face, which slot a request like "the outside of the house"
 * should write to.
 */

export interface WallFinish { color: string; texture?: string }
/** Which walls a wall finish applies to. */
export type WallTarget = 'selected' | 'outside' | 'inside' | 'all';
/** For a single wall: which side(s). Matches the Properties panel. */
export type WallSide = 'both' | 'interior' | 'exterior';
export type FloorTarget = 'selected' | 'same' | 'all';

type Face = 'front' | 'back';
type Slot = 'interior' | 'exterior';

function plan(floor: Floor) {
  const rooms = resolveRoomGeometry(floor);
  const polygons = rooms.map(r => r.polygon).filter(p => p.length >= 3);
  const pts = floor.walls.flatMap(w => [w.start, w.end]);
  const centre: Point = pts.length
    ? { x: pts.reduce((a, p) => a + p.x, 0) / pts.length, y: pts.reduce((a, p) => a + p.y, 0) / pts.length }
    : { x: 0, y: 0 };
  return { rooms, polygons, centre };
}

/** The finish slot the 3D viewer shows on a given face of this wall. */
function slotFor(wall: Wall, face: Face, polygons: Point[][], centre: Point): Slot {
  return (face === 'front') === frontFacesInterior(wall, polygons, centre) ? 'interior' : 'exterior';
}

function facesInRooms(wall: Wall, polygons: Point[][]) {
  const probes = wallFaceProbes(wall);
  if (!probes) return { front: false, back: false };
  return {
    front: polygons.some(poly => pointInPolygon(probes.front, poly)),
    back: polygons.some(poly => pointInPolygon(probes.back, poly)),
  };
}

function slotUpdates(slots: Slot[], finish: WallFinish): Partial<Wall> {
  const updates: Record<string, string> = {};
  for (const slot of slots) {
    updates[`${slot}Color`] = finish.color;
    updates[`${slot}Texture`] = finish.texture ?? 'none';
  }
  return updates as Partial<Wall>;
}

/** Wall edits for a finish request, keyed by wall id. Pure: exported for tests. */
export function wallFinishUpdates(floor: Floor, target: WallTarget, finish: WallFinish,
  options: { selectedId?: string | null; side?: WallSide } = {}): Map<string, Partial<Wall>> {
  const { polygons, centre } = plan(floor);
  const result = new Map<string, Partial<Wall>>();
  for (const wall of floor.walls) {
    let slots: Slot[] = [];
    if (target === 'selected') {
      if (wall.id !== options.selectedId) continue;
      const side = options.side ?? 'both';
      slots = side === 'both' ? ['interior', 'exterior'] : [side];
    } else if (target === 'all') {
      slots = ['interior', 'exterior'];
    } else {
      const inRoom = facesInRooms(wall, polygons);
      const faces: Face[] = [];
      for (const face of ['front', 'back'] as const) {
        const facesRoom = inRoom[face];
        // With no enclosed rooms at all, every face counts as outside.
        if (target === 'inside' ? facesRoom : !facesRoom) faces.push(face);
      }
      slots = [...new Set(faces.map(face => slotFor(wall, face, polygons, centre)))];
    }
    if (slots.length) result.set(wall.id, slotUpdates(slots, finish));
  }
  return result;
}

/** Wall edits that paint every face looking into one room. */
export function roomWallFinishUpdates(floor: Floor, roomId: string, finish: WallFinish): Map<string, Partial<Wall>> {
  const { rooms, polygons, centre } = plan(floor);
  const room = rooms.find(r => r.room.id === roomId);
  const result = new Map<string, Partial<Wall>>();
  if (!room || room.polygon.length < 3) return result;
  for (const wall of floor.walls) {
    const probes = wallFaceProbes(wall);
    if (!probes) continue;
    const faces = (['front', 'back'] as const).filter(face => pointInPolygon(probes[face], room.polygon));
    if (faces.length) result.set(wall.id, slotUpdates([...new Set(faces.map(f => slotFor(wall, f, polygons, centre)))], finish));
  }
  return result;
}

function applyWallUpdates(updates: Map<string, Partial<Wall>>, description: string): number {
  if (!updates.size) return 0;
  beginUndoGroup();
  for (const [id, change] of updates) updateWall(id, change);
  endUndoGroup(description);
  return updates.size;
}

/** Apply a wall finish; returns how many walls changed. */
export function applyWallFinish(target: WallTarget, finish: WallFinish, options: { selectedId?: string | null; side?: WallSide } = {}): number {
  const floor = get(activeFloor);
  if (!floor) return 0;
  return applyWallUpdates(wallFinishUpdates(floor, target, finish, options), 'Apply wall finish');
}

export function applyRoomWallFinish(roomId: string, finish: WallFinish): number {
  const floor = get(activeFloor);
  if (!floor) return 0;
  return applyWallUpdates(roomWallFinishUpdates(floor, roomId, finish), 'Apply board wall finish');
}

/** Rooms a floor request covers. "same" matches the room type, else the name without numbers. */
export function floorTargetRooms(target: FloorTarget, selectedRoomId: string | null) {
  const rooms = get(detectedRoomsStore);
  if (target === 'all') return rooms;
  const selected = rooms.find(r => r.id === selectedRoomId);
  if (!selected) return [];
  if (target === 'selected') return [selected];
  const base = (name: string) => name.replace(/\d+/g, '').trim().toLowerCase();
  return rooms.filter(r => selected.roomType ? r.roomType === selected.roomType : base(r.name) === base(selected.name));
}

/** Apply a floor material; returns how many rooms changed. */
export function applyFloorFinish(target: FloorTarget, materialId: string, selectedRoomId: string | null): number {
  const rooms = floorTargetRooms(target, selectedRoomId);
  if (!rooms.length) return 0;
  beginUndoGroup();
  for (const room of rooms) {
    updateRoom(room.id, { floorTexture: materialId });
    detectedRoomsStore.update(list => list.map(r => r.id === room.id ? { ...r, floorTexture: materialId } : r));
  }
  endUndoGroup('Apply floor finish');
  return rooms.length;
}

export function setTrimFinish(key: keyof ProjectFinishes, color: string) {
  mutateProject(p => { p.finishes = { ...p.finishes, [key]: color }; }, 'Change trim finish');
}

// ── Palettes ─────────────────────────────────────────────────────────
export interface FinishPalette {
  id: string;
  name: string;
  description: string;
  exterior: WallFinish;
  interior: WallFinish;
  floor: string;
  trim: Required<ProjectFinishes>;
}

export const finishPalettes: FinishPalette[] = [
  { id: 'warm-modern', name: 'Warm Modern', description: 'Warm plaster, light oak and walnut doors',
    exterior: { color: '#e9e2d6' }, interior: { color: '#faf7f2' }, floor: 'light-oak',
    trim: { doors: '#6b4636', windowFrames: '#3b3f44', ceiling: '#fffdf9' } },
  { id: 'classic-brick', name: 'Classic Brick', description: 'Exposed brick, cream rooms and walnut floors',
    exterior: { color: '#A0522D', texture: 'exposed-brick' }, interior: { color: '#fffdd0' }, floor: 'walnut',
    trim: { doors: '#ffffff', windowFrames: '#ffffff', ceiling: '#ffffff' } },
  { id: 'minimal-white', name: 'Minimal White', description: 'All-white walls, porcelain and black frames',
    exterior: { color: '#ffffff' }, interior: { color: '#ffffff' }, floor: 'porcelain',
    trim: { doors: '#d1d5db', windowFrames: '#252321', ceiling: '#ffffff' } },
  { id: 'natural-stone', name: 'Natural Stone', description: 'Stone cladding, sage rooms and slate',
    exterior: { color: '#808080', texture: 'stone' }, interior: { color: '#d4e2d4' }, floor: 'slate',
    trim: { doors: '#8b6914', windowFrames: '#4a3026', ceiling: '#f5f5f0' } },
];

/** Apply a palette to the whole house as a single undo step. */
export function applyPalette(palette: FinishPalette) {
  const floor = get(activeFloor);
  if (!floor) return;
  beginUndoGroup();
  for (const [id, change] of wallFinishUpdates(floor, 'outside', palette.exterior)) updateWall(id, change);
  const refreshed = get(activeFloor) ?? floor;
  for (const [id, change] of wallFinishUpdates(refreshed, 'inside', palette.interior)) updateWall(id, change);
  for (const room of get(detectedRoomsStore)) updateRoom(room.id, { floorTexture: palette.floor });
  detectedRoomsStore.update(list => list.map(r => ({ ...r, floorTexture: palette.floor })));
  mutateProject(p => { p.finishes = { ...palette.trim }; });
  endUndoGroup(`Apply ${palette.name} palette`);
}

// ── Recently used (per browser) ──────────────────────────────────────
export type RecentFinish = { kind: 'wall'; color: string; texture?: string } | { kind: 'floor'; materialId: string };
const RECENT_KEY = 'planora_recent_finishes';

export function readRecentFinishes(): RecentFinish[] {
  try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(v) ? v.slice(0, 8) : []; }
  catch { return []; }
}

export function rememberFinish(finish: RecentFinish): RecentFinish[] {
  const same = (a: RecentFinish) => JSON.stringify(a) === JSON.stringify(finish);
  const next = [finish, ...readRecentFinishes().filter(f => !same(f))].slice(0, 8);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* storage full or blocked: recents are optional */ }
  return next;
}
