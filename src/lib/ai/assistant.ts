import { writable, get } from 'svelte/store';
import { designTools, executeTool, planSummary, type ToolOutcome } from '$lib/ai/designTools';
import { beginUndoGroup, endUndoGroup } from '$lib/stores/project';

/**
 * Planora's design assistant: a chat model that edits the plan through the tools
 * in designTools.ts. It works with free models:
 *
 * - Google Gemini (free tier via Google AI Studio key) — native function calling.
 * - Any OpenAI-compatible endpoint with tool calling: Groq (free tier, Llama),
 *   OpenRouter (":free" models) or a local Ollama server (fully offline, no key).
 *
 * The model does not "learn" by training: every turn it receives the live plan,
 * the tool list and the conversation, so it always acts on the current design.
 * Keys stay in this browser (localStorage) and requests go straight from the
 * browser to the chosen provider only when the user sends a message.
 */

export type ProviderId = 'gemini' | 'groq' | 'openrouter' | 'ollama' | 'custom';
export interface AssistantSettings { provider: ProviderId; model: string; apiKey: string; baseUrl: string }

export const PROVIDERS: Record<ProviderId, { label: string; baseUrl: string; model: string; keyUrl?: string; note: string; needsKey: boolean }> = {
  gemini: { label: 'Google Gemini (free tier)', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.5-flash',
    keyUrl: 'https://aistudio.google.com/apikey', note: 'Best free option: strong tool use and a generous free quota.', needsKey: true },
  groq: { label: 'Groq (free tier)', baseUrl: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-120b',
    keyUrl: 'https://console.groq.com/keys', note: 'Very fast, free tier. gpt-oss-120b handles design tools well.', needsKey: true },
  openrouter: { label: 'OpenRouter (free models)', baseUrl: 'https://openrouter.ai/api/v1', model: 'openrouter/free',
    keyUrl: 'https://openrouter.ai/keys', note: '"openrouter/free" picks whichever free model is available right now.', needsKey: true },
  ollama: { label: 'Ollama (runs on this computer)', baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5:7b',
    note: 'Private and offline. Install Ollama, run "ollama pull qwen2.5:7b".', needsKey: false },
  custom: { label: 'Other OpenAI-compatible', baseUrl: '', model: '', note: 'Any endpoint that supports tool calling.', needsKey: true },
};

const SETTINGS_KEY = 'planora_assistant_settings';
/** Defaults that providers have since retired; upgraded on load. */
const RETIRED_MODELS: Record<string, string> = {
  'llama-3.3-70b-versatile': 'openai/gpt-oss-120b',
  'meta-llama/llama-3.3-70b-instruct:free': 'openrouter/free',
};
const GEMINI_KEY = 'o3d_gemini_key'; // shared with the AI render feature

function readSettings(): AssistantSettings {
  const fallback: AssistantSettings = { provider: 'gemini', model: PROVIDERS.gemini.model, apiKey: '', baseUrl: PROVIDERS.gemini.baseUrl };
  if (typeof window === 'undefined') return fallback;
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    const settings = saved && PROVIDERS[saved.provider as ProviderId] ? { ...fallback, ...saved } : fallback;
    if (RETIRED_MODELS[settings.model]) settings.model = RETIRED_MODELS[settings.model];
    if (settings.provider === 'gemini') settings.apiKey = localStorage.getItem(GEMINI_KEY) || settings.apiKey || '';
    return settings;
  } catch { return fallback; }
}

export const assistantSettings = writable<AssistantSettings>(readSettings());

export function saveAssistantSettings(settings: AssistantSettings) {
  const clean = { ...settings, apiKey: settings.apiKey.trim(), model: settings.model.trim(), baseUrl: settings.baseUrl.trim().replace(/\/+$/, '') };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...clean, apiKey: clean.provider === 'gemini' ? '' : clean.apiKey }));
    if (clean.provider === 'gemini') localStorage.setItem(GEMINI_KEY, clean.apiKey);
  } catch { /* storage blocked: settings last for this session */ }
  assistantSettings.set(clean);
}

export function assistantReady(settings: AssistantSettings): boolean {
  return !!settings.model && !!settings.baseUrl && (!PROVIDERS[settings.provider].needsKey || !!settings.apiKey);
}

// ── Conversation ─────────────────────────────────────────────────────────
export interface ChatAction { tool: string; ok: boolean; message: string }
export interface ChatMessage { role: 'user' | 'assistant'; text: string; actions?: ChatAction[]; error?: boolean }

const SYSTEM = `You are Planora's home design assistant inside a 2D/3D floor plan editor.
You change the design ONLY by calling the provided tools; never describe changes you did not make.
Units: metres. The plan's x grows to the right (east) and y grows downward (south). South is the front of the house.
Rules:
- For a new house or a full redesign, call design_house once with every room the user needs (bedrooms, bathrooms, kitchen, living, etc.). Convert feet to metres (1 ft = 0.3048 m). If the plot size is missing, assume a sensible one and say so.
- design_house already furnishes every room and adds a car and planting; don't repeat that with other tools unless asked.
- For small edits use the specific tools. Room names must match the plan summary.
- Pick finishes from the names listed in the tool descriptions.
- After acting, reply in 1-3 short sentences: what you changed and one helpful suggestion. Ask a question only when the request is truly ambiguous.`;

type Turn = { role: 'user' | 'model'; parts: any[] };

/** Free tiers are often briefly busy: retry a rate-limited request once. */
async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  const res = await fetch(url, init);
  if (res.status !== 429) return res;
  await new Promise(resolve => setTimeout(resolve, 2500));
  return fetch(url, init);
}

async function callGemini(settings: AssistantSettings, contents: Turn[], signal?: AbortSignal) {
  const res = await fetchWithRetry(`${settings.baseUrl}/models/${encodeURIComponent(settings.model)}:generateContent`, {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': settings.apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: `${SYSTEM}\n\nCurrent plan:\n${planSummary()}` }] },
      contents,
      tools: [{ functionDeclarations: designTools.map(t => ({ name: t.name, description: t.description, parameters: t.parameters })) }],
      generationConfig: { temperature: 0.4 },
    }),
  });
  if (!res.ok) throw new Error(await providerError(res));
  const json = await res.json();
  const parts: any[] = json.candidates?.[0]?.content?.parts ?? [];
  return { parts, calls: parts.filter(p => p.functionCall).map(p => ({ id: '', name: p.functionCall.name, args: p.functionCall.args ?? {} })), text: parts.map(p => p.text ?? '').join('').trim() };
}

async function callOpenAI(settings: AssistantSettings, messages: any[], signal?: AbortSignal) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`;
  const res = await fetchWithRetry(`${settings.baseUrl}/chat/completions`, {
    method: 'POST', signal, headers,
    body: JSON.stringify({
      model: settings.model, temperature: 0.4,
      messages: [{ role: 'system', content: `${SYSTEM}\n\nCurrent plan:\n${planSummary()}` }, ...messages],
      tools: designTools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })),
      tool_choice: 'auto',
    }),
  });
  if (!res.ok) throw new Error(await providerError(res));
  const json = await res.json();
  const message = json.choices?.[0]?.message ?? {};
  const calls = (message.tool_calls ?? []).map((c: any) => {
    let args = {};
    try { args = typeof c.function?.arguments === 'string' ? JSON.parse(c.function.arguments || '{}') : c.function?.arguments ?? {}; } catch { /* model sent bad JSON */ }
    return { id: c.id, name: c.function?.name, args };
  });
  return { message, calls, text: (message.content ?? '').trim() };
}

async function providerError(res: Response): Promise<string> {
  let detail = '';
  try { const j = await res.json(); detail = j.error?.message ?? j.message ?? ''; } catch { /* not JSON */ }
  if (res.status === 401 || res.status === 403) return 'The API key was rejected. Check it in AI settings.';
  if (res.status === 404 || /model_not_found|does not exist|unavailable/i.test(detail))
    return `This model is not available from your provider any more. Open AI settings and press "Load models" to pick a current one.${detail ? ` (${detail})` : ''}`;
  if (res.status === 429) return 'The free model is busy or your free quota is used up. Wait a minute, or choose another model in AI settings.';
  return `The AI service returned ${res.status}${detail ? `: ${detail}` : ''}.`;
}

/** Provider-specific history, rebuilt from the visible chat each turn. */
function history(messages: ChatMessage[]) {
  return messages.filter(m => !m.error).slice(-12);
}

/**
 * Send one user message: let the model call tools (up to 6 rounds), execute them,
 * and return the assistant's reply. All edits of the turn form one undo step.
 */
export async function runAssistantTurn(prior: ChatMessage[], userText: string, onAction: (action: ChatAction) => void, signal?: AbortSignal): Promise<ChatMessage> {
  const settings = get(assistantSettings);
  if (!assistantReady(settings)) throw new Error('Set up an AI provider first (AI settings).');
  const actions: ChatAction[] = [];
  const run = (name: string, args: Record<string, any>): ToolOutcome => {
    const outcome = executeTool(name, args);
    const action = { tool: name, ok: outcome.ok, message: outcome.message };
    actions.push(action);
    onAction(action);
    return outcome;
  };

  beginUndoGroup();
  try {
    if (settings.provider === 'gemini') {
      const contents: Turn[] = history(prior).map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] }));
      contents.push({ role: 'user', parts: [{ text: userText }] });
      for (let round = 0; round < 6; round++) {
        const reply = await callGemini(settings, contents, signal);
        if (!reply.calls.length) return { role: 'assistant', text: reply.text || 'Done.', actions };
        contents.push({ role: 'model', parts: reply.parts });
        contents.push({ role: 'user', parts: reply.calls.map(c => ({ functionResponse: { name: c.name, response: run(c.name, c.args) } })) });
      }
    } else {
      const messages: any[] = history(prior).map(m => ({ role: m.role, content: m.text }));
      messages.push({ role: 'user', content: userText });
      for (let round = 0; round < 6; round++) {
        const reply = await callOpenAI(settings, messages, signal);
        if (!reply.calls.length) return { role: 'assistant', text: reply.text || 'Done.', actions };
        messages.push({ role: 'assistant', content: reply.message.content ?? '', tool_calls: reply.message.tool_calls });
        for (const call of reply.calls) messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(run(call.name, call.args)) });
      }
    }
    return { role: 'assistant', text: actions.length ? 'I made the changes above.' : 'I could not finish that request.', actions };
  } finally {
    endUndoGroup(`AI: ${userText.slice(0, 40)}`);
  }
}

// ── Per-project chat history (this browser only) ─────────────────────────
const chatKey = (projectId: string) => `planora_ai_chat_${projectId}`;

export function loadChat(projectId: string): ChatMessage[] {
  try { const v = JSON.parse(localStorage.getItem(chatKey(projectId)) || '[]'); return Array.isArray(v) ? v : []; }
  catch { return []; }
}

export function saveChat(projectId: string, messages: ChatMessage[]) {
  try { localStorage.setItem(chatKey(projectId), JSON.stringify(messages.slice(-40))); } catch { /* optional */ }
}

/** Models the provider offers right now (for the AI settings picker). */
export async function listModels(settings: AssistantSettings, signal?: AbortSignal): Promise<string[]> {
  if (settings.provider === 'gemini') {
    const res = await fetch(`${settings.baseUrl}/models?pageSize=200`, { signal, headers: { 'x-goog-api-key': settings.apiKey } });
    if (!res.ok) throw new Error(await providerError(res));
    const json = await res.json();
    return (json.models ?? [])
      .filter((m: any) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
      .map((m: any) => String(m.name).replace(/^models\//, ''))
      .filter((id: string) => /gemini/.test(id) && !/image|tts|embedding|audio/.test(id))
      .sort();
  }
  const headers: Record<string, string> = {};
  if (settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`;
  const res = await fetch(`${settings.baseUrl}/models`, { signal, headers });
  if (!res.ok) throw new Error(await providerError(res));
  const json = await res.json();
  const models: any[] = json.data ?? json.models ?? [];
  return models
    // OpenRouter lists tool support per model; keep only models that can call tools.
    .filter(m => !Array.isArray(m.supported_parameters) || m.supported_parameters.includes('tools'))
    .filter(m => !/whisper|guard|tts|orpheus|embed/i.test(String(m.id ?? m.name)))
    .map(m => String(m.id ?? m.name))
    .sort((a, b) => Number(b.endsWith(':free') || b === 'openrouter/free') - Number(a.endsWith(':free') || a === 'openrouter/free') || a.localeCompare(b));
}
