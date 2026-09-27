/**
 * Deterministic house layout used by the design assistant.
 *
 * Language models are good at deciding *what* a home needs ("3 bedrooms, open
 * kitchen, 30 × 50 ft plot") and poor at exact geometry. So the model sends a
 * room list and this module packs it into a clean rectangular footprint: rows
 * of rooms that share walls, no duplicate walls, a front entrance, a door from
 * every room to the circulation row and windows on outside walls.
 *
 * Plan coordinates are centimetres, x to the right and y "down" the plan. The
 * front of the house (entrance) is the largest y, which faces the default 3D camera.
 */

export type RoomKind = 'living' | 'kitchen' | 'dining' | 'bedroom' | 'master' | 'bathroom' | 'office' | 'store' | 'garage' | 'laundry' | 'hall' | 'other';

export interface RoomRequest { name: string; type?: RoomKind | string; width?: number; depth?: number }
export interface PlacedRoom { name: string; type: RoomKind; x: number; y: number; w: number; d: number; row: number }
export interface Segment { start: { x: number; y: number }; end: { x: number; y: number } }
export interface Opening { at: { x: number; y: number }; horizontal: boolean; kind: 'door' | 'window' | 'entrance'; room: string }
export interface HouseLayout { rooms: PlacedRoom[]; walls: Segment[]; openings: Opening[]; width: number; depth: number; origin: { x: number; y: number } }

/** Typical sizes (cm) when the request gives none. */
const DEFAULT_SIZE: Record<RoomKind, [number, number]> = {
  living: [500, 450], kitchen: [320, 350], dining: [350, 350], bedroom: [350, 380], master: [420, 420],
  bathroom: [220, 260], office: [300, 300], store: [200, 220], garage: [320, 560], laundry: [220, 220], hall: [300, 250], other: [300, 300],
};
/** Rooms that belong on the entrance (front) row. */
const PUBLIC = new Set<RoomKind>(['living', 'kitchen', 'dining', 'garage', 'hall']);

export function roomKind(type: string | undefined, name: string): RoomKind {
  const text = `${type ?? ''} ${name}`.toLowerCase();
  const table: [RegExp, RoomKind][] = [
    [/master|main bed/, 'master'], [/bed/, 'bedroom'], [/bath|toilet|wc|ensuite|washroom/, 'bathroom'],
    [/kitchen/, 'kitchen'], [/dining/, 'dining'], [/living|lounge|family|drawing|sitting/, 'living'],
    [/office|study|work/, 'office'], [/store|storage|pantry|closet/, 'store'], [/garage|car porch|parking/, 'garage'],
    [/laundry|utility/, 'laundry'], [/hall|foyer|entry|corridor/, 'hall'],
  ];
  for (const [re, kind] of table) if (re.test(text)) return kind;
  return 'other';
}

const key = (n: number) => Math.round(n * 10) / 10;

/** Union of axis-aligned edges so shared walls exist once. */
export function mergeEdges(rects: { x: number; y: number; w: number; d: number }[]): Segment[] {
  const horizontal = new Map<number, [number, number][]>(), vertical = new Map<number, [number, number][]>();
  const push = (map: Map<number, [number, number][]>, line: number, a: number, b: number) => {
    const k = key(line);
    map.set(k, [...(map.get(k) ?? []), [Math.min(a, b), Math.max(a, b)]]);
  };
  for (const r of rects) {
    push(horizontal, r.y, r.x, r.x + r.w); push(horizontal, r.y + r.d, r.x, r.x + r.w);
    push(vertical, r.x, r.y, r.y + r.d); push(vertical, r.x + r.w, r.y, r.y + r.d);
  }
  const merged: Segment[] = [];
  const flush = (map: Map<number, [number, number][]>, horiz: boolean) => {
    for (const [line, spans] of map) {
      spans.sort((a, b) => a[0] - b[0]);
      let [s, e] = spans[0];
      const emit = () => merged.push(horiz ? { start: { x: s, y: line }, end: { x: e, y: line } } : { start: { x: line, y: s }, end: { x: line, y: e } });
      for (const [a, b] of spans.slice(1)) {
        if (a <= e + 0.5) e = Math.max(e, b);
        else { emit(); [s, e] = [a, b]; }
      }
      emit();
    }
  };
  flush(horizontal, true);
  flush(vertical, false);
  return merged;
}

/**
 * Pack rooms into rows filling the house width. Private rooms go to the back rows,
 * public rooms to the front row (largest y). Each row takes the depth of its
 * deepest room and widths are scaled so the row spans the full house width.
 */
export function layoutHouse(plot: { width: number; depth: number }, requests: RoomRequest[], options: { setback?: number } = {}): HouseLayout {
  const setback = options.setback ?? Math.min(250, Math.max(100, Math.min(plot.width, plot.depth) * 0.08));
  const houseW = Math.max(400, plot.width - 2 * setback);
  const maxDepth = Math.max(400, plot.depth - 2 * setback);
  const rooms = requests.slice(0, 24).map(r => {
    const type = roomKind(r.type, r.name);
    const [dw, dd] = DEFAULT_SIZE[type];
    return { name: r.name, type, w: Math.max(150, r.width ?? dw), d: Math.max(150, r.depth ?? dd) };
  });

  // Group into rows: back (private) rows first, front (public) row last.
  const back = rooms.filter(r => !PUBLIC.has(r.type)), front = rooms.filter(r => PUBLIC.has(r.type));
  const rows: typeof rooms[] = [];
  const pack = (list: typeof rooms) => {
    let row: typeof rooms = [], used = 0;
    for (const room of list) {
      if (row.length && used + room.w > houseW * 1.15) { rows.push(row); row = []; used = 0; }
      row.push(room); used += room.w;
    }
    if (row.length) rows.push(row);
  };
  pack(back.sort((a, b) => (a.type === 'bathroom' ? 1 : 0) - (b.type === 'bathroom' ? 1 : 0)));
  pack(front.sort((a, b) => (a.type === 'living' ? -1 : 0) - (b.type === 'living' ? -1 : 0)));
  if (!rows.length) rows.push([{ name: 'Living room', type: 'living', w: 500, d: 450 }]);

  let depths = rows.map(row => Math.max(...row.map(r => r.d)));
  const total = depths.reduce((a, b) => a + b, 0);
  if (total > maxDepth) depths = depths.map(d => Math.max(220, d * maxDepth / total));
  const houseD = depths.reduce((a, b) => a + b, 0);
  const origin = { x: setback, y: setback + Math.max(0, (maxDepth - houseD) / 2) };

  const placed: PlacedRoom[] = [];
  let y = origin.y;
  rows.forEach((row, ri) => {
    const sum = row.reduce((a, r) => a + r.w, 0);
    let x = origin.x;
    row.forEach((room, i) => {
      const w = i === row.length - 1 ? origin.x + houseW - x : Math.round(room.w * houseW / sum);
      placed.push({ name: room.name, type: room.type, x, y, w, d: depths[ri], row: ri });
      x += w;
    });
    y += depths[ri];
  });

  const openings: Opening[] = [];
  const frontRow = rows.length - 1;
  const bottom = origin.y + houseD, right = origin.x + houseW;
  // Entrance on the front wall of the main public room.
  const entranceRoom = placed.filter(r => r.row === frontRow).sort((a, b) => (b.type === 'living' ? 1 : 0) - (a.type === 'living' ? 1 : 0) || b.w - a.w)[0];
  if (entranceRoom) openings.push({ at: { x: entranceRoom.x + entranceRoom.w / 2, y: bottom }, horizontal: true, kind: 'entrance', room: entranceRoom.name });
  // Doors: every room opens toward the front (next row down), else sideways to a neighbour.
  for (const r of placed) {
    if (r === entranceRoom) continue;
    const below = placed.filter(o => o.row === r.row + 1 && o.x < r.x + r.w - 60 && o.x + o.w > r.x + 60);
    if (below.length) {
      const target = below.sort((a, b) => (PUBLIC.has(b.type) ? 1 : 0) - (PUBLIC.has(a.type) ? 1 : 0))[0];
      const lo = Math.max(r.x, target.x), hi = Math.min(r.x + r.w, target.x + target.w);
      openings.push({ at: { x: lo + Math.min(70, (hi - lo) / 2), y: r.y + r.d }, horizontal: true, kind: 'door', room: r.name });
    } else if (r.row === frontRow) {
      const left = placed.find(o => o.row === r.row && Math.abs(o.x + o.w - r.x) < 1);
      if (left) openings.push({ at: { x: r.x, y: r.y + r.d / 2 }, horizontal: false, kind: 'door', room: r.name });
    }
  }
  // Windows: one on each outside wall of a room, skipping the entrance position.
  for (const r of placed) {
    const add = (at: { x: number; y: number }, horizontal: boolean) => openings.push({ at, horizontal, kind: 'window', room: r.name });
    if (Math.abs(r.y - origin.y) < 1) add({ x: r.x + r.w / 2, y: r.y }, true);
    if (Math.abs(r.y + r.d - bottom) < 1 && r !== entranceRoom) add({ x: r.x + r.w / 2, y: bottom }, true);
    if (Math.abs(r.x - origin.x) < 1) add({ x: r.x, y: r.y + r.d / 2 }, false);
    if (Math.abs(r.x + r.w - right) < 1) add({ x: right, y: r.y + r.d / 2 }, false);
  }

  return { rooms: placed, walls: mergeEdges(placed), openings, width: houseW, depth: houseD, origin };
}
