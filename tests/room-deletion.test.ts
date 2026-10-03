import { beforeEach, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { get } from 'svelte/store';
import { currentProject, detectedRoomsStore, removeRoom, undo, redo } from '$lib/stores/project';
import { benchmarkProject } from './fixtures/render-benchmark';
import { roomProject } from './fixtures/project';
import { resolveRooms } from '$lib/utils/roomDetection';
import { getRoomPolygon } from '$lib/utils/roomDetection';
import { pointInPolygon } from '$lib/utils/wallJoins';

beforeEach(() => detectedRoomsStore.set([]));

for (const saved of [true, false]) it(`deletes ${saved ? 'saved' : 'detected'} room boundaries with one reversible operation`, () => {
  const project = JSON.parse(readFileSync('tests/fixtures/connected-dimensions.openplan.json', 'utf8'));
  const floor = project.floors[0];
  const target = floor.rooms[0];
  if (!saved) {
    floor.rooms = [];
    detectedRoomsStore.set([target]);
  }
  const otherWall = { ...floor.walls[0], id: 'unrelated-wall', start: { x: 1000, y: 0 }, end: { x: 1300, y: 0 } };
  const otherRoom = { ...target, id: 'unrelated-room', walls: [otherWall.id] };
  floor.walls.push(otherWall); floor.rooms.push(otherRoom);
  currentProject.set(project);
  const before = JSON.parse(JSON.stringify(floor));
  removeRoom(target.id);
  const after = JSON.parse(JSON.stringify(get(currentProject)!.floors[0]));
  expect(after).toEqual({ ...before, rooms: [otherRoom], walls: [otherWall], doors: [], windows: [] });
  expect(get(detectedRoomsStore).some(room => room.id === target.id)).toBe(false);
  undo();
  expect(get(currentProject)!.floors[0]).toEqual(before);
  redo();
  expect(get(currentProject)!.floors[0]).toEqual(after);
});

for (const detected of [false, true]) it(`preserves shared walls and openings used by ${detected ? 'detected' : 'saved'} neighbors`, () => {
  const project = benchmarkProject('small');
  const floor = project.floors[0];
  const target = floor.rooms[0];
  const neighbors = floor.rooms.slice(1);
  const shared = new Set(neighbors.flatMap(room => room.walls));
  const removed = new Set(target.walls.filter(id => !shared.has(id)));
  if (detected) {
    floor.rooms = [target];
    detectedRoomsStore.set(neighbors);
  }
  currentProject.set(project);
  const before = structuredClone(floor);
  removeRoom(target.id);
  const expected = {
    ...before, rooms: detected ? [] : neighbors,
    walls: before.walls.filter(wall => !removed.has(wall.id)),
    doors: before.doors.filter(door => !removed.has(door.wallId)),
    windows: before.windows.filter(win => !removed.has(win.wallId)),
    furniture: before.furniture.filter(item => !pointInPolygon(item.position, getRoomPolygon(target, before.walls))),
  };
  expect(get(currentProject)!.floors[0]).toEqual(expected);
  undo(); expect(get(currentProject)!.floors[0]).toEqual(before);
  redo(); expect(get(currentProject)!.floors[0]).toEqual(expected);
});

it('deletes all components anchored inside a room, preserves outside components, and restores them on undo', () => {
  const project = roomProject();
  const floor = project.floors[0];
  const room = resolveRooms(floor)[0];
  floor.rooms = [room];
  floor.furniture = [
    { id: 'inside-furniture', position: { x: 100, y: 100 } } as any,
    { id: 'outside-furniture', position: { x: 500, y: 100 } } as any,
  ];
  floor.stairs = [
    { id: 'inside-stair', position: { x: 120, y: 120 } } as any,
    { id: 'outside-stair', position: { x: 500, y: 120 } } as any,
  ];
  floor.columns = [
    { id: 'inside-column', position: { x: 140, y: 140 } } as any,
    { id: 'outside-column', position: { x: 500, y: 140 } } as any,
  ];
  floor.entourage = [
    { id: 'inside-entourage', position: { x: 160, y: 160 } } as any,
    { id: 'outside-entourage', position: { x: 500, y: 160 } } as any,
  ];
  floor.textAnnotations = [
    { id: 'inside-text', x: 180, y: 180 } as any,
    { id: 'outside-text', x: 500, y: 180 } as any,
  ];
  floor.measurements = [
    { id: 'inside-measurement', x1: 100, y1: 200, x2: 200, y2: 200 },
    { id: 'outside-measurement', x1: 500, y1: 200, x2: 600, y2: 200 },
  ];
  floor.annotations = [
    { id: 'inside-annotation', x1: 100, y1: 220, x2: 200, y2: 220 } as any,
    { id: 'outside-annotation', x1: 500, y1: 220, x2: 600, y2: 220 } as any,
  ];
  floor.groups = [{ id: 'mixed-group', elementIds: ['inside-furniture', 'outside-furniture'] }];
  currentProject.set(project);
  const before = structuredClone(floor);

  removeRoom(room.id);

  const after = get(currentProject)!.floors[0];
  expect(after.furniture.map(item => item.id)).toEqual(['outside-furniture']);
  expect(after.stairs.map(item => item.id)).toEqual(['outside-stair']);
  expect(after.columns.map(item => item.id)).toEqual(['outside-column']);
  expect(after.entourage?.map(item => item.id)).toEqual(['outside-entourage']);
  expect(after.textAnnotations.map(item => item.id)).toEqual(['outside-text']);
  expect(after.measurements.map(item => item.id)).toEqual(['outside-measurement']);
  expect(after.annotations.map(item => item.id)).toEqual(['outside-annotation']);
  expect(after.groups).toEqual([]);
  undo();
  expect(get(currentProject)!.floors[0]).toEqual(before);
});
