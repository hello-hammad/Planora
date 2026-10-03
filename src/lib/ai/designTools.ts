import { get } from 'svelte/store';
import type { Door, Floor, Room, Wall, Window as Win } from '$lib/models/types';
import {
  activeFloor, addDoor, addEntourageItem, addFurniture, addWindow, beginUndoGroup, currentProject, editActiveFloor,
  endUndoGroup, newElementId, removeElement, undo, updateFurniture, updateRoom,
} from '$lib/stores/project';
import { resolveRoomGeometry } from '$lib/utils/roomDetection';
import { furnitureCatalog } from '$lib/utils/furnitureCatalog';
import { roomTemplates } from '$lib/utils/roomTemplates';
import { floorMaterials, wallColors } from '$lib/utils/materials';
import { entourageCatalog } from '$lib/utils/entourageCatalog';
import { applyFloorFinish, applyPalette, applyRoomWallFinish, applyWallFinish, finishPalettes, setTrimFinish } from '$lib/utils/finishes';
import { layoutHouse, roomKind, type RoomKind } from '$lib/ai/houseLayout';

/**
 * The design assistant's tools. The model never edits the project directly: it
 * calls these functions, which go through the same store actions as the manual
 * editor (so everything is undoable, saved and shown in 2D and 3D).
 * The model works in metres; the plan stores centimetres.
 */

type JsonSchema = Record<string, unknown>;
export interface ToolSpec { name: string; description: string; parameters: JsonSchema }

const str = (description: string, extra: JsonSchema = {}) => ({ type: 'string', description, ...extra });
const num = (description: string) => ({ type: 'number', description });
const bool = (description: string) => ({ type: 'boolean', description });
const obj = (properties: Record<string, JsonSchema>, required: string[] = []) => ({ type: 'object', properties, required });

const WALL_FINISH_NAMES = wallColors.map(c => c.name);
const FLOOR_NAMES = floorMaterials.map(m => m.name);
const PALETTE_NAMES = finishPalettes.map(p => p.name);
const OUTDOOR = ['car', 'suv', 'pickup', 'tree', 'pine', 'shrub', 'hedge', 'person', 'people', 'umbrella', 'potted plant'];

export const designTools: ToolSpec[] = [
  { name: 'design_house', description: 'Create a complete house from a plot size and a room list. Planora arranges the rooms, walls, entrance, interior doors and windows, furnishes every room and adds a car and planting. Use this for any new house or full redesign, and do not call furnish_room or add_outdoor afterwards unless the user asks for more.',
    parameters: obj({
      plot_width_m: num('Plot width in metres (e.g. 30 ft = 9.14 m).'),
      plot_depth_m: num('Plot depth in metres.'),
      rooms: { type: 'array', description: 'Every room the home needs, including bathrooms, kitchen and living spaces.', items: obj({
        name: str('Room label, e.g. "Master bedroom".'),
        type: str('Room kind.', { enum: ['living', 'kitchen', 'dining', 'bedroom', 'master', 'bathroom', 'office', 'store', 'garage', 'laundry', 'hall', 'other'] }),
        width_m: num('Optional preferred width in metres.'), depth_m: num('Optional preferred depth in metres.'),
      }, ['name', 'type']) },
      furnish: bool('Place furniture in each room (default true).'),
      palette: str('Optional finish palette.', { enum: PALETTE_NAMES }),
      landscape: bool('Add a car and planting around the house (default true).'),
    }, ['plot_width_m', 'plot_depth_m', 'rooms']) },
  { name: 'add_door', description: 'Add a door to a room on one side (north = top of the plan, south = front).',
    parameters: obj({ room: str('Room name.'), side: str('Wall side.', { enum: ['north', 'south', 'east', 'west'] }), type: str('Door type.', { enum: ['single', 'double', 'sliding', 'french', 'pocket', 'bifold', 'opening', 'garage'] }) }, ['room', 'side']) },
  { name: 'add_window', description: 'Add windows to a room on one side.',
    parameters: obj({ room: str('Room name.'), side: str('Wall side.', { enum: ['north', 'south', 'east', 'west'] }), count: num('How many (default 1).'), type: str('Window type.', { enum: ['standard', 'fixed', 'casement', 'sliding', 'bay'] }) }, ['room', 'side']) },
  { name: 'furnish_room', description: 'Furnish a room with a matching furniture set for its type.', parameters: obj({ room: str('Room name.') }, ['room']) },
  { name: 'add_furniture', description: 'Add one furniture item to a room, by name (e.g. "sofa", "dining table", "queen bed").',
    parameters: obj({ item: str('Furniture name.'), room: str('Room name.'), count: num('How many (default 1).') }, ['item', 'room']) },
  { name: 'move_furniture', description: 'Move or rotate an existing furniture item (ids come from the plan summary).',
    parameters: obj({ id: str('Furniture id.'), x_m: num('New x in metres.'), y_m: num('New y in metres.'), rotation_deg: num('Rotation in degrees.') }, ['id']) },
  { name: 'remove_items', description: 'Delete furniture, doors, windows or walls by id.', parameters: obj({ ids: { type: 'array', items: { type: 'string' }, description: 'Ids to delete.' } }, ['ids']) },
  { name: 'set_wall_finish', description: `Paint or clad walls. Finish names: ${WALL_FINISH_NAMES.join(', ')}; or give a hex colour.`,
    parameters: obj({ target: str('"outside" (house exterior), "inside" (all interiors), "all", or a room name.'), finish: str('Finish name or hex colour like #d4e2d4.') }, ['target', 'finish']) },
  { name: 'set_floor', description: `Change floor material. Materials: ${FLOOR_NAMES.join(', ')}.`,
    parameters: obj({ room: str('Room name, or "all".'), material: str('Material name.') }, ['room', 'material']) },
  { name: 'apply_palette', description: 'Apply a complete finish palette to the whole house.', parameters: obj({ palette: str('Palette name.', { enum: PALETTE_NAMES }) }, ['palette']) },
  { name: 'set_trim', description: 'Set colours for doors, window frames and ceilings (hex colours).',
    parameters: obj({ doors: str('Door colour.'), window_frames: str('Window frame colour.'), ceiling: str('Ceiling colour.') }) },
  { name: 'rename_room', description: 'Rename a room.', parameters: obj({ room: str('Current room name.'), name: str('New name.') }, ['room', 'name']) },
  { name: 'add_outdoor', description: `Add outdoor items around the house: ${OUTDOOR.join(', ')}.`,
    parameters: obj({ item: str('Item kind.', { enum: OUTDOOR }), where: str('Side of the house.', { enum: ['front', 'back', 'left', 'right'] }), count: num('How many (default 1).') }, ['item']) },
  { name: 'undo_last', description: 'Undo the most recent change.', parameters: obj({}) },
];

// ── Plan summary shown to the model every turn ──────────────────────────
const m = (cm: number) => Math.round(cm) / 100;

function roomsWithBounds(floor: Floor) {
  return resolveRoomGeometry(floor).filter(r => r.polygon.length >= 3).map(({ room, polygon }) => {
    const xs = polygon.map(p => p.x), ys = polygon.map(p => p.y);
    return { room, box: { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) } };
  });
}

export function planSummary(): string {
  const project = get(currentProject), floor = get(activeFloor);
  if (!project || !floor) return 'No project is open.';
  const rooms = roomsWithBounds(floor);
  const roomOf = (x: number, y: number) => rooms.find(r => x >= r.box.minX && x <= r.box.maxX && y >= r.box.minY && y <= r.box.maxY)?.room.name ?? 'outside';
  const lines = [
    `Project "${project.name}", floor "${floor.name}". ${floor.walls.length} walls, ${floor.doors.length} doors, ${floor.windows.length} windows.`,
    rooms.length ? 'Rooms (x, y, width × depth in metres; area):' : 'No closed rooms yet.',
    ...rooms.map(({ room, box }) => `- "${room.name}" at (${m(box.minX)}, ${m(box.minY)}) ${m(box.maxX - box.minX)} × ${m(box.maxY - box.minY)} m, ${room.area.toFixed(1)} m², floor ${room.floorTexture || 'none'}`),
  ];
  if (floor.furniture.length) {
    lines.push('Furniture:');
    for (const f of floor.furniture.slice(0, 60)) {
      const name = furnitureCatalog.find(c => c.id === f.catalogId)?.name ?? f.catalogId;
      lines.push(`- ${f.id}: ${name} in ${roomOf(f.position.x, f.position.y)} at (${m(f.position.x)}, ${m(f.position.y)})`);
    }
  }
  if (floor.entourage?.length) lines.push(`${floor.entourage.length} outdoor items (cars, planting, people).`);
  if (project.finishes) lines.push(`Trim finishes: ${JSON.stringify(project.finishes)}.`);
  return lines.join('\n');
}

// ── Helpers ──────────────────────────────────────────────────────────────
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function findRoom(floor: Floor, name: string) {
  const rooms = roomsWithBounds(floor);
  const n = norm(name);
  return rooms.find(r => norm(r.room.name) === n) ?? rooms.find(r => norm(r.room.name).includes(n) || n.includes(norm(r.room.name)));
}

function findWallOnSide(floor: Floor, box: { minX: number; maxX: number; minY: number; maxY: number }, side: string): Wall | undefined {
  const line = side === 'north' ? box.minY : side === 'south' ? box.maxY : side === 'west' ? box.minX : box.maxX;
  const horizontal = side === 'north' || side === 'south';
  const mid = horizontal ? (box.minX + box.maxX) / 2 : (box.minY + box.maxY) / 2;
  return floor.walls.find(w => {
    if (horizontal) return Math.abs(w.start.y - line) < 15 && Math.abs(w.end.y - line) < 15 && Math.min(w.start.x, w.end.x) <= mid && Math.max(w.start.x, w.end.x) >= mid;
    return Math.abs(w.start.x - line) < 15 && Math.abs(w.end.x - line) < 15 && Math.min(w.start.y, w.end.y) <= mid && Math.max(w.start.y, w.end.y) >= mid;
  });
}

function positionOnWall(wall: Wall, x: number, y: number): number {
  const dx = wall.end.x - wall.start.x, dy = wall.end.y - wall.start.y;
  const t = ((x - wall.start.x) * dx + (y - wall.start.y) * dy) / (dx * dx + dy * dy || 1);
  return Math.min(0.92, Math.max(0.08, t));
}

function findFurniture(name: string) {
  const n = norm(name);
  const matches = furnitureCatalog.filter(f => norm(f.name) === n || norm(f.id.replace(/_/g, ' ')) === n);
  if (matches.length) return matches[0];
  return furnitureCatalog.filter(f => norm(f.name).includes(n) || n.includes(norm(f.name))).sort((a, b) => a.name.length - b.name.length)[0];
}

function resolveWallFinish(finish: string): { color: string; texture?: string } | null {
  if (/^#[0-9a-f]{6}$/i.test(finish.trim())) return { color: finish.trim() };
  const n = norm(finish);
  const hit = wallColors.find(c => norm(c.name) === n) ?? wallColors.find(c => norm(c.name).includes(n) || n.includes(norm(c.name)));
  return hit ? { color: hit.color, texture: hit.texture ? hit.id : undefined } : null;
}

function resolveFloor(material: string) {
  const n = norm(material);
  return floorMaterials.find(f => norm(f.name) === n || f.id === material) ?? floorMaterials.find(f => norm(f.name).includes(n) || n.includes(norm(f.name)));
}

const TEMPLATE_FOR: Partial<Record<RoomKind, string>> = {
  living: 'Living Room', bedroom: 'Bedroom', master: 'Bedroom', kitchen: 'Kitchen', bathroom: 'Bathroom', office: 'Office', dining: 'Dining Room',
};
const FLOOR_FOR: Record<RoomKind, string> = {
  living: 'walnut', kitchen: 'porcelain', dining: 'walnut', bedroom: 'light-oak', master: 'light-oak', bathroom: 'ceramic-white',
  office: 'light-oak', store: 'concrete', garage: 'concrete', laundry: 'ceramic-gray', hall: 'porcelain', other: 'laminate',
};

/** Furniture for one room from its matching template, scaled to fit. */
function furnitureFor(kind: RoomKind, box: { minX: number; maxX: number; minY: number; maxY: number }) {
  const template = roomTemplates.find(t => t.name === TEMPLATE_FOR[kind]);
  if (!template) return [];
  const cx = (box.minX + box.maxX) / 2, cy = (box.minY + box.maxY) / 2;
  const sx = Math.min(1.3, (box.maxX - box.minX) / 400), sy = Math.min(1.3, (box.maxY - box.minY) / 300);
  const items = kind === 'master'
    ? template.furniture.map(f => f.catalogId === 'bed_queen' && furnitureCatalog.some(c => c.id === 'bed_king') ? { ...f, catalogId: 'bed_king' } : f)
    : template.furniture;
  return items.filter(f => furnitureCatalog.some(c => c.id === f.catalogId)).map(f => ({
    id: newElementId(), catalogId: f.catalogId, position: { x: cx + f.x * sx, y: cy + f.y * sy }, rotation: f.rotation, scale: { x: 1, y: 1, z: 1 },
  }));
}

// ── Execution ────────────────────────────────────────────────────────────
export interface ToolOutcome { ok: boolean; message: string }

function designHouse(args: Record<string, any>): ToolOutcome {
  const plot = { width: Math.max(4, Number(args.plot_width_m) || 10) * 100, depth: Math.max(4, Number(args.plot_depth_m) || 15) * 100 };
  const requests = (Array.isArray(args.rooms) ? args.rooms : []).map((r: any) => ({
    name: String(r.name ?? 'Room'), type: r.type, width: r.width_m ? Number(r.width_m) * 100 : undefined, depth: r.depth_m ? Number(r.depth_m) * 100 : undefined,
  }));
  if (!requests.length) return { ok: false, message: 'No rooms were given.' };
  const house = layoutHouse(plot, requests);
  const perimeter = (s: { start: { x: number; y: number }; end: { x: number; y: number } }) =>
    [house.origin.y, house.origin.y + house.depth].some(y => Math.abs(s.start.y - y) < 1 && Math.abs(s.end.y - y) < 1)
    || [house.origin.x, house.origin.x + house.width].some(x => Math.abs(s.start.x - x) < 1 && Math.abs(s.end.x - x) < 1);

  editActiveFloor(floor => {
    floor.walls = house.walls.map(s => ({ id: newElementId(), start: s.start, end: s.end, thickness: perimeter(s) ? 22 : 12, height: 280, startHeight: 280, endHeight: 280, color: '#444444' }));
    floor.doors = []; floor.windows = []; floor.rooms = []; floor.furniture = []; floor.stairs = []; floor.columns = [];
    for (const o of house.openings) {
      const wall = floor.walls.find(w => o.horizontal
        ? Math.abs(w.start.y - o.at.y) < 1 && Math.abs(w.end.y - o.at.y) < 1 && Math.min(w.start.x, w.end.x) <= o.at.x && Math.max(w.start.x, w.end.x) >= o.at.x
        : Math.abs(w.start.x - o.at.x) < 1 && Math.abs(w.end.x - o.at.x) < 1 && Math.min(w.start.y, w.end.y) <= o.at.y && Math.max(w.start.y, w.end.y) >= o.at.y);
      if (!wall) continue;
      const position = positionOnWall(wall, o.at.x, o.at.y);
      if (o.kind === 'window') {
        const bath = roomKind(undefined, o.room) === 'bathroom';
        floor.windows.push({ id: newElementId(), wallId: wall.id, position, width: bath ? 70 : 140, height: bath ? 70 : 130, sillHeight: bath ? 150 : 90, type: bath ? 'fixed' : 'standard' } as Win);
      } else {
        const garage = roomKind(undefined, o.room) === 'garage' && o.kind === 'entrance';
        floor.doors.push({ id: newElementId(), wallId: wall.id, position, width: o.kind === 'entrance' ? (garage ? 240 : 100) : 85, height: 210,
          type: garage ? 'garage' : o.kind === 'entrance' ? 'single' : 'single', swingDirection: 'left', flipSide: false } as Door);
      }
    }
    // Name the rooms and give each a floor that suits it.
    const detected = resolveRoomGeometry(floor);
    const saved: Room[] = [];
    for (const placed of house.rooms) {
      const cx = placed.x + placed.w / 2, cy = placed.y + placed.d / 2;
      const hit = detected.find(({ polygon }) => {
        const xs = polygon.map(p => p.x), ys = polygon.map(p => p.y);
        return cx > Math.min(...xs) && cx < Math.max(...xs) && cy > Math.min(...ys) && cy < Math.max(...ys);
      });
      if (!hit) continue;
      saved.push({ ...hit.room, name: placed.name, floorTexture: FLOOR_FOR[placed.type], roomType: placed.type === 'garage' ? 'garage' : 'indoor' });
      if (args.furnish !== false) floor.furniture.push(...furnitureFor(placed.type, { minX: placed.x, maxX: placed.x + placed.w, minY: placed.y, maxY: placed.y + placed.d }));
    }
    floor.rooms = saved;
    floor.entourage = args.landscape === false ? (floor.entourage ?? []) : [
      { id: newElementId(), defId: 'car-sedan', position: { x: house.origin.x + house.width * 0.78, y: house.origin.y + house.depth + 330 }, width: 460, rotation: 0 },
      { id: newElementId(), defId: 'tree-deciduous', position: { x: house.origin.x - 60, y: house.origin.y + house.depth + 250 }, width: 380, rotation: 0 },
      { id: newElementId(), defId: 'shrub', position: { x: house.origin.x + house.width * 0.35, y: house.origin.y + house.depth + 120 }, width: 120, rotation: 0 },
      { id: newElementId(), defId: 'potted-plant', position: { x: house.origin.x + house.width * 0.5 + 90, y: house.origin.y + house.depth + 60 }, width: 60, rotation: 0 },
    ];
  }, 'AI: design house');

  if (args.palette) {
    const palette = finishPalettes.find(p => norm(p.name) === norm(String(args.palette)));
    if (palette) applyPalette(palette);
  }
  return { ok: true, message: `Built ${house.rooms.length} rooms (${m(house.width)} × ${m(house.depth)} m) on a ${m(plot.width)} × ${m(plot.depth)} m plot: ${house.rooms.map(r => r.name).join(', ')}.` };
}

export function executeTool(name: string, args: Record<string, any>): ToolOutcome {
  const floor = get(activeFloor);
  if (!floor) return { ok: false, message: 'No floor is open.' };
  try {
    switch (name) {
      case 'design_house': return designHouse(args);
      case 'add_door':
      case 'add_window': {
        const room = findRoom(floor, String(args.room ?? ''));
        if (!room) return { ok: false, message: `No room named "${args.room}".` };
        const wall = findWallOnSide(floor, room.box, String(args.side ?? 'south'));
        if (!wall) return { ok: false, message: `No ${args.side} wall found for ${room.room.name}.` };
        const horizontal = args.side === 'north' || args.side === 'south';
        if (name === 'add_door') {
          const mid = horizontal ? (room.box.minX + room.box.maxX) / 2 : (room.box.minY + room.box.maxY) / 2;
          addDoor(wall.id, horizontal ? positionOnWall(wall, mid, wall.start.y) : positionOnWall(wall, wall.start.x, mid), (args.type ?? 'single') as Door['type']);
          return { ok: true, message: `Added a door on the ${args.side} side of ${room.room.name}.` };
        }
        const count = Math.max(1, Math.min(4, Math.round(Number(args.count) || 1)));
        beginUndoGroup();
        for (let i = 0; i < count; i++) {
          const f = (i + 1) / (count + 1);
          const x = room.box.minX + (room.box.maxX - room.box.minX) * f, y = room.box.minY + (room.box.maxY - room.box.minY) * f;
          addWindow(wall.id, horizontal ? positionOnWall(wall, x, wall.start.y) : positionOnWall(wall, wall.start.x, y), (args.type ?? 'standard') as Win['type']);
        }
        endUndoGroup('AI: add windows');
        return { ok: true, message: `Added ${count} window${count > 1 ? 's' : ''} on the ${args.side} side of ${room.room.name}.` };
      }
      case 'furnish_room': {
        const room = findRoom(floor, String(args.room ?? ''));
        if (!room) return { ok: false, message: `No room named "${args.room}".` };
        const inside = floor.furniture.filter(f => f.position.x > room.box.minX && f.position.x < room.box.maxX && f.position.y > room.box.minY && f.position.y < room.box.maxY);
        if (inside.length >= 2) return { ok: true, message: `${room.room.name} is already furnished (${inside.length} items); nothing added.` };
        const items = furnitureFor(roomKind(undefined, room.room.name), room.box);
        if (!items.length) return { ok: false, message: `No furniture set for ${room.room.name}; add items by name instead.` };
        editActiveFloor(f => { f.furniture.push(...items); }, 'AI: furnish room');
        return { ok: true, message: `Furnished ${room.room.name} with ${items.length} items.` };
      }
      case 'add_furniture': {
        const room = findRoom(floor, String(args.room ?? ''));
        const item = findFurniture(String(args.item ?? ''));
        if (!room) return { ok: false, message: `No room named "${args.room}".` };
        if (!item) return { ok: false, message: `No furniture called "${args.item}". Try a simpler name.` };
        const count = Math.max(1, Math.min(8, Math.round(Number(args.count) || 1)));
        beginUndoGroup();
        for (let i = 0; i < count; i++) {
          const cx = (room.box.minX + room.box.maxX) / 2 + (i - (count - 1) / 2) * (item.width + 30), cy = (room.box.minY + room.box.maxY) / 2;
          addFurniture(item.id, { x: cx, y: cy });
        }
        endUndoGroup('AI: add furniture');
        return { ok: true, message: `Added ${count} × ${item.name} to ${room.room.name}.` };
      }
      case 'move_furniture': {
        const item = floor.furniture.find(f => f.id === args.id);
        if (!item) return { ok: false, message: `No furniture with id ${args.id}.` };
        updateFurniture(item.id, {
          position: { x: args.x_m !== undefined ? Number(args.x_m) * 100 : item.position.x, y: args.y_m !== undefined ? Number(args.y_m) * 100 : item.position.y },
          ...(args.rotation_deg !== undefined ? { rotation: Number(args.rotation_deg) } : {}),
        });
        return { ok: true, message: 'Moved the furniture.' };
      }
      case 'remove_items': {
        const ids: string[] = Array.isArray(args.ids) ? args.ids.map(String) : [];
        beginUndoGroup();
        for (const id of ids) removeElement(id);
        endUndoGroup('AI: remove items');
        return { ok: true, message: `Removed ${ids.length} item${ids.length === 1 ? '' : 's'}.` };
      }
      case 'set_wall_finish': {
        const finish = resolveWallFinish(String(args.finish ?? ''));
        if (!finish) return { ok: false, message: `Unknown finish "${args.finish}". Use one of: ${WALL_FINISH_NAMES.join(', ')}.` };
        const target = norm(String(args.target ?? 'outside'));
        if (target === 'outside' || target === 'inside' || target === 'all') {
          const n = applyWallFinish(target as 'outside' | 'inside' | 'all', finish);
          return { ok: true, message: `Applied ${args.finish} to ${n} walls (${target}).` };
        }
        const room = findRoom(floor, String(args.target));
        if (!room) return { ok: false, message: `No room named "${args.target}".` };
        const n = applyRoomWallFinish(room.room.id, finish);
        return { ok: true, message: `Applied ${args.finish} to ${n} walls of ${room.room.name}.` };
      }
      case 'set_floor': {
        const material = resolveFloor(String(args.material ?? ''));
        if (!material) return { ok: false, message: `Unknown floor "${args.material}". Use one of: ${FLOOR_NAMES.join(', ')}.` };
        if (norm(String(args.room)) === 'all') return { ok: true, message: `Set ${material.name} in ${applyFloorFinish('all', material.id, null)} rooms.` };
        const room = findRoom(floor, String(args.room ?? ''));
        if (!room) return { ok: false, message: `No room named "${args.room}".` };
        if (!floor.rooms.some(r => r.id === room.room.id)) editActiveFloor(f => { f.rooms.push({ ...room.room, floorTexture: material.id }); }, 'AI: set floor');
        else updateRoom(room.room.id, { floorTexture: material.id });
        return { ok: true, message: `Set ${material.name} in ${room.room.name}.` };
      }
      case 'apply_palette': {
        const palette = finishPalettes.find(p => norm(p.name) === norm(String(args.palette ?? '')));
        if (!palette) return { ok: false, message: `Unknown palette. Use one of: ${PALETTE_NAMES.join(', ')}.` };
        applyPalette(palette);
        return { ok: true, message: `Applied the ${palette.name} palette.` };
      }
      case 'set_trim': {
        const hex = (v: unknown) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : undefined;
        const changes = [['doors', hex(args.doors)], ['windowFrames', hex(args.window_frames)], ['ceiling', hex(args.ceiling)]] as const;
        beginUndoGroup();
        for (const [key, value] of changes) if (value) setTrimFinish(key, value);
        endUndoGroup('AI: set trim');
        return { ok: true, message: 'Updated trim colours.' };
      }
      case 'rename_room': {
        const room = findRoom(floor, String(args.room ?? ''));
        if (!room) return { ok: false, message: `No room named "${args.room}".` };
        if (!floor.rooms.some(r => r.id === room.room.id)) editActiveFloor(f => { f.rooms.push({ ...room.room, name: String(args.name) }); }, 'AI: rename room');
        else updateRoom(room.room.id, { name: String(args.name) });
        return { ok: true, message: `Renamed ${room.room.name} to ${args.name}.` };
      }
      case 'add_outdoor': {
        const defFor: Record<string, string> = { car: 'car-sedan', suv: 'car-suv', pickup: 'car-pickup', tree: 'tree-deciduous', pine: 'tree-conifer', shrub: 'shrub', hedge: 'hedge', person: 'person', people: 'people-pair', umbrella: 'patio-umbrella', 'potted plant': 'potted-plant' };
        const defId = defFor[String(args.item)] ?? 'tree-deciduous';
        const def = entourageCatalog.find(d => d.id === defId)!;
        const xs = floor.walls.flatMap(w => [w.start.x, w.end.x]), ys = floor.walls.flatMap(w => [w.start.y, w.end.y]);
        const box = xs.length ? { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) } : { minX: 0, maxX: 800, minY: 0, maxY: 600 };
        const count = Math.max(1, Math.min(10, Math.round(Number(args.count) || 1)));
        const where = String(args.where ?? 'front'), gap = def.width / 2 + 150;
        beginUndoGroup();
        for (let i = 0; i < count; i++) {
          const f = (i + 1) / (count + 1);
          const pos = where === 'back' ? { x: box.minX + (box.maxX - box.minX) * f, y: box.minY - gap }
            : where === 'left' ? { x: box.minX - gap, y: box.minY + (box.maxY - box.minY) * f }
            : where === 'right' ? { x: box.maxX + gap, y: box.minY + (box.maxY - box.minY) * f }
            : { x: box.minX + (box.maxX - box.minX) * f, y: box.maxY + gap };
          // Step along the side until the spot is clear of existing outdoor items.
          for (let tries = 0; tries < 8 && (floor.entourage ?? []).some(e => Math.hypot(e.position.x - pos.x, e.position.y - pos.y) < (e.width + def.width) / 2); tries++) {
            if (where === 'left' || where === 'right') pos.y += def.width * 0.6; else pos.x += def.width * 0.6;
          }
          addEntourageItem(defId, pos, def.width);
        }
        endUndoGroup('AI: add outdoor items');
        return { ok: true, message: `Added ${count} × ${def.name} at the ${where}.` };
      }
      case 'undo_last': undo(); return { ok: true, message: 'Undid the last change.' };
      default: return { ok: false, message: `Unknown tool ${name}.` };
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'The change failed.' };
  }
}
