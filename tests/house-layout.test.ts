import { describe, expect, it } from 'vitest';
import { layoutHouse, mergeEdges, roomKind } from '$lib/ai/houseLayout';

describe('layoutHouse', () => {
  const plot = { width: 914, depth: 1524 }; // 30 × 50 ft
  const rooms = [
    { name: 'Master bedroom' }, { name: 'Bedroom 2' }, { name: 'Bedroom 3' }, { name: 'Bathroom' }, { name: 'Bathroom 2' },
    { name: 'Kitchen' }, { name: 'Living room' },
  ];
  const house = layoutHouse(plot, rooms);

  it('keeps every room inside the plot and without overlaps', () => {
    for (const r of house.rooms) {
      expect(r.x).toBeGreaterThanOrEqual(0); expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(plot.width + 0.5); expect(r.y + r.d).toBeLessThanOrEqual(plot.depth + 0.5);
    }
    for (const a of house.rooms) for (const b of house.rooms) if (a !== b) {
      const overlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1 && Math.min(a.y + a.d, b.y + b.d) - Math.max(a.y, b.y) > 1;
      expect(overlap).toBe(false);
    }
  });

  it('puts living spaces at the front and gives the house one entrance', () => {
    const front = Math.max(...house.rooms.map(r => r.row));
    expect(house.rooms.find(r => r.name === 'Living room')!.row).toBe(front);
    expect(house.rooms.find(r => r.name === 'Master bedroom')!.row).toBeLessThan(front);
    expect(house.openings.filter(o => o.kind === 'entrance')).toHaveLength(1);
  });

  it('gives every room a door and outside rooms windows', () => {
    for (const r of house.rooms) expect(house.openings.some(o => o.room === r.name && o.kind !== 'window')).toBe(true);
    expect(house.openings.filter(o => o.kind === 'window').length).toBeGreaterThanOrEqual(house.rooms.length);
  });

  it('creates each shared wall once', () => {
    const key = (s: { start: { x: number; y: number }; end: { x: number; y: number } }) => `${s.start.x},${s.start.y},${s.end.x},${s.end.y}`;
    const keys = house.walls.map(key);
    expect(new Set(keys).size).toBe(keys.length);
    // Two side-by-side 3 × 3 m rooms: 1 top + 1 bottom + 3 verticals.
    expect(mergeEdges([{ x: 0, y: 0, w: 300, d: 300 }, { x: 300, y: 0, w: 300, d: 300 }])).toHaveLength(5);
  });

  it('recognises room types from names', () => {
    expect(roomKind(undefined, 'Main bedroom')).toBe('master');
    expect(roomKind(undefined, 'Lounge')).toBe('living');
    expect(roomKind('bath', 'Ensuite')).toBe('bathroom');
    expect(roomKind(undefined, 'Car porch')).toBe('garage');
  });
});
