<script lang="ts">
  import AppIcon from '$lib/components/AppIcon.svelte';
  import { tick } from 'svelte';
  import { currentProject, undo } from '$lib/stores/project';
  import { assistantReady, assistantSettings, loadChat, runAssistantTurn, saveChat, type ChatAction, type ChatMessage } from '$lib/ai/assistant';
  import AssistantSettingsForm from './AssistantSettingsForm.svelte';

  /** Chat with the design assistant. `panel` sits in the side panel; `studio` fills the AI studio column. */
  let { variant = 'panel', initialPrompt = '', onSent }: { variant?: 'panel' | 'studio'; initialPrompt?: string; onSent?: () => void } = $props();

  let messages = $state<ChatMessage[]>([]);
  let input = $state('');
  let busy = $state(false);
  let live = $state<ChatAction[]>([]);
  let showSettings = $state(false);
  let scroller = $state<HTMLDivElement>();
  let controller: AbortController | null = null;
  let loadedFor = '';

  const ready = $derived(assistantReady($assistantSettings));
  const suggestions = [
    'Design a 3 bedroom house on a 30 × 50 ft plot with 2 bathrooms, a kitchen and a lounge',
    'Make the outside walls exposed brick and the floors walnut',
    'Add two windows to the kitchen on the north side',
    'Put a car and two trees in the front garden',
  ];

  // Chat history belongs to the open project (kept in this browser).
  $effect(() => {
    const id = $currentProject?.id;
    if (id && id !== loadedFor) { loadedFor = id; messages = loadChat(id); scrollDown(); }
  });

  let sentInitial = false;
  $effect(() => {
    if (initialPrompt && !sentInitial && $currentProject) { sentInitial = true; void send(initialPrompt); }
  });

  async function scrollDown() { await tick(); scroller?.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' }); }

  async function send(text = input) {
    const prompt = text.trim();
    if (!prompt || busy) return;
    if (!ready) { showSettings = true; return; }
    input = '';
    const prior = messages;
    messages = [...messages, { role: 'user', text: prompt }];
    onSent?.();
    busy = true; live = [];
    controller = new AbortController();
    scrollDown();
    try {
      const reply = await runAssistantTurn(prior, prompt, action => { live = [...live, action]; scrollDown(); }, controller.signal);
      messages = [...messages, reply];
    } catch (error) {
      const aborted = error instanceof DOMException && error.name === 'AbortError';
      messages = [...messages, { role: 'assistant', text: aborted ? 'Stopped.' : error instanceof Error ? error.message : 'Something went wrong.', error: true, actions: live.length ? live : undefined }];
    } finally {
      busy = false; live = []; controller = null;
      if ($currentProject) saveChat($currentProject.id, messages);
      scrollDown();
    }
  }

  function undoTurn(index: number) {
    undo();
    messages = messages.map((m, i) => i === index ? { ...m, text: `${m.text} (undone)`, actions: undefined } : m);
    if ($currentProject) saveChat($currentProject.id, messages);
  }

  /** Safe, minimal formatting for replies: **bold** and "- " bullet lines. */
  function formatReply(text: string): string {
    const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const bold = (line: string) => line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Models often inline bullets ("with: - A - B"); put each on its own line.
    const lines = esc.replace(/\s+-\s+(?=\S)/g, (m: string, offset: number) => offset === 0 ? m : '\n- ').split('\n');
    let html = '', inList = false;
    for (const raw of lines) {
      const line = raw.trim();
      if (line.startsWith('- ')) { if (!inList) { html += '<ul class="my-1 list-disc space-y-0.5 pl-4">'; inList = true; } html += `<li>${bold(line.slice(2))}</li>`; }
      else { if (inList) { html += '</ul>'; inList = false; } if (line) html += `<p class="my-1">${bold(line)}</p>`; }
    }
    return inList ? html + '</ul>' : html;
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); }
  }
</script>

<div class="flex h-full min-h-0 flex-col text-charcoal {variant === 'studio' ? 'bg-cream' : ''}">
  <!-- Header -->
  <div class="flex items-center justify-between gap-2 {variant === 'studio' ? 'border-b border-line px-4 py-3' : 'pb-2'}">
    <div class="flex items-center gap-2">
      <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-terracotta-tint text-terracotta-ink" aria-hidden="true">
        <AppIcon name="bot" size={16} />
      </span>
      <span class="text-sm font-bold">Design assistant</span>
    </div>
    <button type="button" class="rounded-lg px-2 py-1 text-[11px] font-semibold text-muted hover:bg-hover hover:text-charcoal" aria-expanded={showSettings}
      onclick={() => showSettings = !showSettings}>AI settings</button>
  </div>

  {#if showSettings}
    <div class="mb-3 rounded-[12px] border border-line bg-white p-3 {variant === 'studio' ? 'mx-4 mt-3' : ''}">
      <span class="mb-2 block text-xs font-bold">AI provider</span>
      <AssistantSettingsForm onSaved={() => showSettings = false} />
    </div>
  {/if}

  <!-- Messages -->
  <div bind:this={scroller} class="min-h-0 flex-1 space-y-3 overflow-y-auto {variant === 'studio' ? 'px-4 py-4' : 'pb-3'}" aria-live="polite">
    {#if !messages.length && !busy}
      <div class="space-y-2">
        <p class="text-xs text-muted">Describe a change and I'll make it in the plan — in 2D and 3D. Everything I do can be undone.</p>
        {#each suggestions as s}
          <button type="button" class="w-full rounded-[10px] border border-line bg-white px-3 py-2 text-left text-xs text-charcoal transition-colors hover:border-walnut hover:bg-walnut-tint" onclick={() => send(s)}>{s}</button>
        {/each}
      </div>
    {/if}
    {#each messages as message, i (i)}
      {#if message.role === 'user'}
        <div class="ml-6 rounded-[14px] rounded-br-md bg-walnut px-3 py-2 text-[13px] leading-snug text-white">{message.text}</div>
      {:else}
        <div class="mr-4 space-y-1.5">
          {#if message.actions?.length}
            <ul class="space-y-1 rounded-[12px] border border-line bg-white p-2">
              {#each message.actions as action}
                <li class="flex gap-1.5 text-[11.5px] {action.ok ? 'text-charcoal' : 'text-danger'}"><AppIcon name={action.ok ? 'check' : 'circle-x'} size={13} class="mt-0.5" />{action.message}</li>
              {/each}
            </ul>
          {/if}
          <div class="rounded-[14px] rounded-bl-md px-3 py-2 text-[13px] leading-snug {message.error ? 'bg-terracotta-tint text-charcoal' : 'bg-ivory text-charcoal'}">{@html formatReply(message.text)}</div>
          {#if message.actions?.some(a => a.ok) && i === messages.length - 1}
            <button type="button" class="text-[11px] font-semibold text-walnut hover:underline" onclick={() => undoTurn(i)}>Undo these changes</button>
          {/if}
        </div>
      {/if}
    {/each}
    {#if busy}
      <div class="mr-4 space-y-1.5">
        {#if live.length}
          <ul class="space-y-1 rounded-[12px] border border-line bg-white p-2">
            {#each live as action}<li class="flex gap-1.5 text-[11.5px]"><AppIcon name={action.ok ? 'check' : 'circle-x'} size={13} class="mt-0.5" />{action.message}</li>{/each}
          </ul>
        {/if}
        <div class="flex items-center gap-2 rounded-[14px] bg-ivory px-3 py-2 text-[13px] text-muted">
          <span class="flex gap-1" aria-hidden="true"><span class="dot"></span><span class="dot"></span><span class="dot"></span></span>
          Designing…
          <button type="button" class="ml-auto text-[11px] font-semibold text-walnut" onclick={() => controller?.abort()}>Stop</button>
        </div>
      </div>
    {/if}
  </div>

  <!-- Composer -->
  <form class="{variant === 'studio' ? 'border-t border-line p-3' : 'pt-2'}" onsubmit={(e) => { e.preventDefault(); void send(); }}>
    <div class="flex items-end gap-2 rounded-[14px] border border-line bg-white p-1.5 focus-within:border-walnut focus-within:ring-2 focus-within:ring-walnut/15">
      <textarea bind:value={input} onkeydown={onKey} rows={variant === 'studio' ? 2 : 2} placeholder={ready ? 'Ask for a change…' : 'Set up AI first (free)…'} aria-label="Message the design assistant"
        class="max-h-32 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-1.5 text-[13px] text-charcoal outline-none placeholder:text-muted"></textarea>
      <button type="submit" disabled={busy || !input.trim()} aria-label="Send"
        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-walnut text-white transition-colors hover:bg-walnut-dark disabled:opacity-40">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </button>
    </div>
  </form>
</div>

<style>
  .dot { width: 5px; height: 5px; border-radius: 999px; background: var(--color-muted); animation: pulse 1.2s ease-in-out infinite; }
  .dot:nth-child(2) { animation-delay: .15s; } .dot:nth-child(3) { animation-delay: .3s; }
  @keyframes pulse { 0%, 100% { opacity: .25; transform: translateY(0); } 50% { opacity: 1; transform: translateY(-2px); } }
  @media (prefers-reduced-motion: reduce) { .dot { animation: none; opacity: .6; } }
</style>
