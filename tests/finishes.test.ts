import { describe, expect, it } from 'vitest';
import type { Floor, Wall } from '$lib/models/types';
import { roomWallFinishUpdates, wallFinishUpdates, finishPalettes } from '$lib/utils/finishes';
import { readProject } from '$lib/utils/projectValidation';
import { sceneSignature } from '$lib/utils/sceneSignature';
import { benchmarkProject } from './fixtures/render-benchmark';
import { resolveRoomGeometry } from '$lib/utils/roomDetection';

const wall = (id: string, sx: number, sy: number, ex: number, ey: number): Wall =>
  ({ id, start: { x: sx, y: sy }, end: { x: ex, y: ey }, thickness: 20, height: 260, color: '#cccccc' }) as Wall;

// One 600 × 400 room; two walls drawn clockwise and two counter-clockwise.
const floor = {
  id: 'f', name: 'Ground', level: 0, walls: [wall('a', 0, 0, 600, 0), wall('b', 600, 400, 600, 0), wall('c', 600, 400, 0, 400), wall('d', 0, 0, 0, 400)],
  doors: [], windows: [], rooms: [], furniture: [],
} as unknown as Floor;

const finish = { color: '#b5553a', texture: 'exposed-brick' };

describe('wallFinishUpdates', () => {
  it('paints only the outside slot of every perimeter wall for the house exterior', () => {
    const updates = wallFinishUpdates(floor, 'outside', finish);
    expect([...updates.keys()].sort()).toEqual(['a', 'b', 'c', 'd']);
    for (const change of updates.values()) expect(change).toEqual({ exteriorColor: '#b5553a', exteriorTexture: 'exposed-brick' });
  });

  it('paints only the room-facing slot for all interiors', () => {
    for (const change of wallFinishUpdates(floor, 'inside', { color: '#faf7f2' }).values())
      expect(change).toEqual({ interiorColor: '#faf7f2', interiorTexture: 'none' });
  });

  it('respects the chosen side for the selected wall only', () => {
    const updates = wallFinishUpdates(floor, 'selected', finish, { selectedId: 'b', side: 'exterior' });
    expect([...updates.keys()]).toEqual(['b']);
    expect(updates.get('b')).toEqual({ exteriorColor: '#b5553a', exteriorTexture: 'exposed-brick' });
    expect(wallFinishUpdates(floor, 'selected', finish, { selectedId: 'b' }).get('b')).toHaveProperty('interiorColor');
  });

  it('paints every face that looks into a room for a board', () => {
    // Boards link to saved rooms (a detected room's id is only stable once saved).
    const [{ room }] = resolveRoomGeometry(floor);
    const saved = { ...floor, rooms: [room] } as Floor;
    const updates = roomWallFinishUpdates(saved, room.id, { color: '#d4e2d4' });
    expect([...updates.keys()].sort()).toEqual(['a', 'b', 'c', 'd']);
    for (const change of updates.values()) expect(change).toEqual({ interiorColor: '#d4e2d4', interiorTexture: 'none' });
    expect(roomWallFinishUpdates(saved, 'missing', finish).size).toBe(0);
  });

  it('ships complete palettes', () => {
    for (const palette of finishPalettes) {
      expect(palette.floor).toBeTruthy();
      expect(Object.keys(palette.trim).sort()).toEqual(['ceiling', 'doors', 'windowFrames']);
    }
  });
});

describe('project finishes and boards', () => {
  it('survive validation and reject unknown board item kinds', () => {
    const project = benchmarkProject('small');
    const withBoards = { ...structuredClone(project), finishes: { doors: '#ffffff' },
      boards: [{ id: 'b1', name: 'Lounge', items: [{ id: 'i1', kind: 'note', label: 'Note', note: 'Bright' }], createdAt: '2026-09-27T00:00:00Z' }] };
    const read = readProject(withBoards);
    expect(read.finishes?.doors).toBe('#ffffff');
    expect(read.boards?.[0].items[0].note).toBe('Bright');
    const bad = structuredClone(withBoards);
    (bad.boards[0].items[0] as { kind: string }).kind = 'hologram';
    expect(() => readProject(bad)).toThrow(/known board item kind/);
  });

  it('rebuild 3D when trim finishes change but not when a board changes', () => {
    const project = benchmarkProject('small');
    const sig = () => sceneSignature(project, project.floors[0], false, 'metric');
    const before = sig();
    project.boards = [{ id: 'b', name: 'x', items: [], createdAt: '' }];
    expect(sig()).toBe(before);
    project.finishes = { ceiling: '#f5f5f0' };
    expect(sig()).not.toBe(before);
  });
});
