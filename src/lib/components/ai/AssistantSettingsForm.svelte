<script lang="ts">
  import { assistantSettings, listModels, PROVIDERS, saveAssistantSettings, type ProviderId } from '$lib/ai/assistant';

  /** Choose the AI provider, key and model for the design assistant. */
  let { onSaved, size = 'sm' }: { onSaved?: () => void; size?: 'sm' | 'md' } = $props();

  let draft = $state({ ...$assistantSettings });
  let models = $state<string[]>([]);
  let loading = $state(false);
  let message = $state('');
  const field = $derived(size === 'md' ? 'h-10 text-sm' : 'h-9 text-xs');

  function pickProvider(id: ProviderId) {
    const p = PROVIDERS[id];
    draft = { provider: id, model: p.model, baseUrl: p.baseUrl, apiKey: id === $assistantSettings.provider ? $assistantSettings.apiKey : '' };
    models = []; message = '';
  }

  async function loadModels() {
    loading = true; message = '';
    try {
      models = await listModels(draft);
      message = models.length ? `${models.length} models available${models.includes(draft.model) ? '' : ' — pick one below'}.` : 'No tool-capable models found.';
    } catch (error) { message = error instanceof Error ? error.message : 'Could not load models.'; }
    finally { loading = false; }
  }
</script>

<form class="space-y-2" onsubmit={(e) => { e.preventDefault(); saveAssistantSettings(draft); onSaved?.(); }}>
  <select value={draft.provider} onchange={(e) => pickProvider((e.target as HTMLSelectElement).value as ProviderId)} aria-label="AI provider"
    class="{field} w-full rounded-[10px] border border-line bg-cream px-2">
    {#each Object.entries(PROVIDERS) as [id, p] (id)}<option value={id}>{p.label}</option>{/each}
  </select>
  <p class="text-[11px] text-muted">{PROVIDERS[draft.provider].note}
    {#if PROVIDERS[draft.provider].keyUrl}<a class="font-semibold text-walnut underline" href={PROVIDERS[draft.provider].keyUrl} target="_blank" rel="noreferrer">Get a free key</a>{/if}</p>
  {#if PROVIDERS[draft.provider].needsKey}
    <input type="password" bind:value={draft.apiKey} placeholder="API key" aria-label="API key" autocomplete="off"
      class="{field} w-full rounded-[10px] border border-line bg-cream px-3 outline-none focus:border-walnut" />
  {/if}
  {#if draft.provider === 'custom' || draft.provider === 'ollama'}
    <input bind:value={draft.baseUrl} placeholder="Base URL, e.g. http://localhost:11434/v1" aria-label="Base URL"
      class="{field} w-full rounded-[10px] border border-line bg-cream px-3 outline-none focus:border-walnut" />
  {/if}
  <div class="flex gap-2">
    <input bind:value={draft.model} list="assistant-models" placeholder="Model" aria-label="Model"
      class="{field} min-w-0 flex-1 rounded-[10px] border border-line bg-cream px-3 outline-none focus:border-walnut" />
    <button type="button" onclick={loadModels} disabled={loading || (PROVIDERS[draft.provider].needsKey && !draft.apiKey)}
      class="{field} shrink-0 rounded-[10px] border border-line bg-white px-3 font-semibold text-charcoal hover:bg-hover disabled:opacity-40">{loading ? 'Loading…' : 'Load models'}</button>
  </div>
  <datalist id="assistant-models">{#each models as m}<option value={m}></option>{/each}</datalist>
  {#if models.length}
    <select aria-label="Available models" value={models.includes(draft.model) ? draft.model : ''} onchange={(e) => draft.model = (e.target as HTMLSelectElement).value}
      class="{field} w-full rounded-[10px] border border-line bg-white px-2">
      <option value="" disabled>Choose a model…</option>
      {#each models as m}<option value={m}>{m}</option>{/each}
    </select>
  {/if}
  {#if message}<p class="text-[11px] text-muted" role="status">{message}</p>{/if}
  <p class="text-[10.5px] text-muted">Your key stays in this browser. Planora only contacts the provider when you send a message or load models.</p>
  <button type="submit" class="{field} w-full rounded-[10px] bg-walnut font-semibold text-white hover:bg-walnut-dark">Save</button>
</form>
