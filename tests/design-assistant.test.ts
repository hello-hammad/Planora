import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { activeFloor, createDefaultProject, currentProject, loadProject } from '$lib/stores/project';
import { executeTool, planSummary } from '$lib/ai/designTools';
import { assistantSettings, runAssistantTurn } from '$lib/ai/assistant';

const house = {
  plot_width_m: 9.14, plot_depth_m: 15.24,
  rooms: [
    { name: 'Master bedroom', type: 'master' }, { name: 'Bedroom 2', type: 'bedroom' }, { name: 'Bathroom', type: 'bathroom' },
    { name: 'Kitchen', type: 'kitchen' }, { name: 'Living room', type: 'living' },
  ],
};

beforeEach(() => loadProject(createDefaultProject('AI test')));

describe('design tools', () => {
  it('design_house builds named rooms with doors, windows, furniture and landscape', () => {
    const result = executeTool('design_house', house);
    expect(result.ok).toBe(true);
    const floor = get(activeFloor)!;
    expect(floor.rooms.map(r => r.name).sort()).toEqual(['Bathroom', 'Bedroom 2', 'Kitchen', 'Living room', 'Master bedroom']);
    expect(floor.doors.length).toBeGreaterThanOrEqual(5);
    expect(floor.windows.length).toBeGreaterThanOrEqual(5);
    expect(floor.furniture.length).toBeGreaterThan(5);
    expect(floor.entourage?.some(e => e.defId === 'car-sedan')).toBe(true);
    expect(planSummary()).toContain('"Kitchen"');
  });

  it('edits rooms by name and reports unknown names instead of guessing', () => {
    executeTool('design_house', { ...house, furnish: false, landscape: false });
    const windows = get(activeFloor)!.windows.length;
    expect(executeTool('add_window', { room: 'kitchen', side: 'north', count: 2 }).ok).toBe(true);
    expect(get(activeFloor)!.windows.length).toBe(windows + 2);
    expect(executeTool('set_floor', { room: 'Living room', material: 'marble' }).ok).toBe(true);
    expect(get(activeFloor)!.rooms.find(r => r.name === 'Living room')!.floorTexture).toMatch(/marble/);
    expect(executeTool('set_wall_finish', { target: 'outside', finish: 'Exposed Brick' }).ok).toBe(true);
    expect(get(activeFloor)!.walls.some(w => w.exteriorTexture === 'exposed-brick')).toBe(true);
    expect(executeTool('add_door', { room: 'Garden shed', side: 'south' })).toEqual({ ok: false, message: 'No room named "Garden shed".' });
    expect(executeTool('set_floor', { room: 'all', material: 'lava' }).ok).toBe(false);
  });
});

describe('assistant conversation', () => {
  it('runs a Gemini tool call, executes it and returns the model reply as one undo step', async () => {
    assistantSettings.set({ provider: 'gemini', model: 'gemini-2.5-flash', apiKey: 'test-key', baseUrl: 'https://example.test/v1beta' });
    const replies = [
      { candidates: [{ content: { parts: [{ functionCall: { name: 'design_house', args: house } }] } }] },
      { candidates: [{ content: { parts: [{ text: 'Built a 2 bedroom home. Want a garage?' }] } }] },
    ];
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(replies.shift()), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const seen: string[] = [];
    const reply = await runAssistantTurn([], 'Design a 2 bedroom house', a => seen.push(a.tool));
    expect(reply.text).toBe('Built a 2 bedroom home. Want a garage?');
    expect(seen).toEqual(['design_house']);
    expect(get(activeFloor)!.rooms).toHaveLength(5);
    // The key travels in a header, and the plan summary and tools are sent to the model.
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).not.toContain('test-key');
    expect((init!.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key');
    const body = JSON.parse(String(init!.body));
    expect(body.tools[0].functionDeclarations.map((t: { name: string }) => t.name)).toContain('design_house');
    expect(get(currentProject)!.floors[0].walls.length).toBeGreaterThan(4);
  });

  it('explains quota errors in plain words', async () => {
    assistantSettings.set({ provider: 'groq', model: 'llama', apiKey: 'k', baseUrl: 'https://example.test/v1' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 429 })));
    await expect(runAssistantTurn([], 'hi', () => {})).rejects.toThrow(/free quota/);
  });
});
