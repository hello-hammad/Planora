import type { Point, Wall } from '$lib/models/types';

/** Endpoints closer than this (cm) are treated as one joint. */
const JOINT_TOLERANCE = 2;

export interface WallEndExtension { start: number; end: number }

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Unit direction pointing away from `end` along the straight wall. */
function awayFrom(wall: Wall, end: 'start' | 'end'): Point {
  const from = end === 'start' ? wall.start : wall.end;
  const to = end === 'start' ? (wall.curvePoint ?? wall.end) : (wall.curvePoint ?? wall.start);
  const len = dist(from, to) || 1;
  return { x: (to.x - from.x) / len, y: (to.y - from.y) / len };
}

/**
 * How far (cm) each straight wall's 3D box must extend past its endpoints so that
 * walls meeting at a corner close the outer notch instead of leaving a gap.
 *
 * Walls are drawn on their centre lines, so two boxes that simply stop at a shared
 * endpoint leave a missing wedge on the outside of the corner. Extending each wall
 * by `(t_other / 2) / tan(θ / 2)` reaches the point where the outer faces meet
 * (exactly half the other wall's thickness at 90°). Collinear joints need nothing;
 * very acute joints are clamped so the corner never grows a long spike.
 * Negative values pull a wall back (the stopping wall of a right-angle butt joint).
 */
export function wallEndExtensions(walls: Wall[], minThickness = 0): Map<string, WallEndExtension> {
  const result = new Map<string, WallEndExtension>();
  const ends = walls.flatMap(wall => (['start', 'end'] as const).map(end => ({ wall, end, point: wall[end] })));
  const thick = (w: Wall) => Math.max(w.thickness, minThickness);
  for (const wall of walls) {
    if (wall.curvePoint) continue;
    const ext: WallEndExtension = { start: 0, end: 0 };
    for (const end of ['start', 'end'] as const) {
      const here = wall[end];
      const mine = awayFrom(wall, end);
      const others = ends.filter(o => o.wall.id !== wall.id && dist(o.point, here) <= JOINT_TOLERANCE);
      for (const other of others) {
        const theirs = awayFrom(other.wall, other.end);
        const cos = Math.max(-1, Math.min(1, mine.x * theirs.x + mine.y * theirs.y));
        const theta = Math.acos(cos);
        if (theta > Math.PI * (175 / 180) || theta < 1e-3) continue; // collinear or overlapping
        // A plain two-wall right-angle corner becomes a butt joint: one wall runs
        // through to the outer corner and the other stops at its inside face, so no
        // two faces share a plane (coplanar faces flicker along the corner edge).
        if (others.length === 1 && !other.wall.curvePoint && Math.abs(theta - Math.PI / 2) < Math.PI / 18) {
          ext[end] = wall.id < other.wall.id ? thick(other.wall) / 2 : -thick(other.wall) / 2;
          continue;
        }
        const needed = (thick(other.wall) / 2) / Math.tan(theta / 2);
        ext[end] = Math.max(ext[end], Math.min(needed, 1.5 * Math.max(thick(wall), thick(other.wall))));
      }
    }
    if (ext.start || ext.end) result.set(wall.id, ext);
  }
  return result;
}

export function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y || 1e-9) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * Whether the wall box's local +Z face (the "front", normal = left of the wall's
 * start→end direction) faces the building interior. The 3D viewer puts the
 * interior finish on that face, so walls drawn in the opposite direction would
 * otherwise show their interior finish outside and the exterior finish inside.
 *
 * Decided by which side lies inside a room; partitions with rooms on both sides
 * keep the default, and walls with no room on either side face the plan centre.
 */
export function frontFacesInterior(wall: Wall, roomPolygons: Point[][], planCentre: Point): boolean {
  const dx = wall.end.x - wall.start.x, dy = wall.end.y - wall.start.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return true;
  const n = { x: -dy / len, y: dx / len };
  const mid = { x: (wall.start.x + wall.end.x) / 2, y: (wall.start.y + wall.end.y) / 2 };
  const probe = wall.thickness / 2 + 8;
  const front = { x: mid.x + n.x * probe, y: mid.y + n.y * probe };
  const back = { x: mid.x - n.x * probe, y: mid.y - n.y * probe };
  const frontInside = roomPolygons.some(poly => poly.length >= 3 && pointInPolygon(front, poly));
  const backInside = roomPolygons.some(poly => poly.length >= 3 && pointInPolygon(back, poly));
  if (frontInside !== backInside) return frontInside;
  if (frontInside && backInside) return true;
  return n.x * (planCentre.x - mid.x) + n.y * (planCentre.y - mid.y) >= 0;
}

/**
 * Points just in front of (+Z, "interior" finish) and behind (-Z, "exterior"
 * finish) the middle of a straight wall, for testing which room each face sees.
 */
export function wallFaceProbes(wall: Wall): { front: Point; back: Point } | null {
  const dx = wall.end.x - wall.start.x, dy = wall.end.y - wall.start.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return null;
  const n = { x: -dy / len, y: dx / len };
  const mid = { x: (wall.start.x + wall.end.x) / 2, y: (wall.start.y + wall.end.y) / 2 };
  const probe = wall.thickness / 2 + 8;
  return { front: { x: mid.x + n.x * probe, y: mid.y + n.y * probe }, back: { x: mid.x - n.x * probe, y: mid.y - n.y * probe } };
}
