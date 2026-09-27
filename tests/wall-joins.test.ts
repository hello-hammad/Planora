import { describe, expect, it } from 'vitest';
import type { Wall } from '$lib/models/types';
import { frontFacesInterior, wallEndExtensions } from '$lib/utils/wallJoins';

const wall = (id: string, sx: number, sy: number, ex: number, ey: number, thickness = 20): Wall =>
  ({ id, start: { x: sx, y: sy }, end: { x: ex, y: ey }, thickness, height: 280, color: '#cccccc' }) as Wall;

describe('wallEndExtensions', () => {
  it('butt-joins a right-angle corner: one wall runs through, the other stops at its face', () => {
    const ext = wallEndExtensions([wall('a', 0, 0, 400, 0), wall('b', 400, 0, 400, 300, 10)]);
    expect(ext.get('a')?.end).toBeCloseTo(5);    // reaches the outer face of b
    expect(ext.get('b')?.start).toBeCloseTo(-10); // stops at the inner face of a
    expect(ext.get('a')?.start).toBe(0);
  });

  it('extends both walls of a non-right corner to the outer meeting point', () => {
    // 120° between the walls: each extends (t/2)/tan(60°).
    const ext = wallEndExtensions([wall('a', 0, 0, 400, 0), wall('b', 400, 0, 400 + 200, 200 * Math.sqrt(3))]);
    expect(ext.get('a')?.end).toBeCloseTo(10 / Math.tan(Math.PI / 3));
    expect(ext.get('b')?.start).toBeCloseTo(10 / Math.tan(Math.PI / 3));
  });

  it('leaves collinear joints and free ends alone', () => {
    const ext = wallEndExtensions([wall('a', 0, 0, 200, 0), wall('b', 200, 0, 400, 0)]);
    expect(ext.size).toBe(0);
  });

  it('clamps very acute joints', () => {
    const ext = wallEndExtensions([wall('a', 0, 0, 400, 0), wall('b', 0, 0, 400, 10)]);
    expect(ext.get('a')!.start).toBeLessThanOrEqual(30);
  });

  it('honours the viewer minimum thickness', () => {
    const ext = wallEndExtensions([wall('a', 0, 0, 400, 0, 5), wall('b', 400, 0, 400, 300, 5)], 15);
    expect(ext.get('a')?.end).toBeCloseTo(7.5);
    expect(ext.get('b')?.start).toBeCloseTo(-7.5);
  });
});

describe('frontFacesInterior', () => {
  const room = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }];
  const centre = { x: 200, y: 150 };

  it('detects the room side for either drawing direction', () => {
    // Front normal is left of start→end: (0,1) for a wall drawn along +x on y=0.
    expect(frontFacesInterior(wall('a', 0, 0, 400, 0), [room], centre)).toBe(true);
    expect(frontFacesInterior(wall('a', 400, 0, 0, 0), [room], centre)).toBe(false);
  });

  it('falls back to the plan centre without rooms', () => {
    expect(frontFacesInterior(wall('a', 0, 0, 400, 0), [], centre)).toBe(true);
    expect(frontFacesInterior(wall('a', 400, 0, 0, 0), [], centre)).toBe(false);
  });
});
