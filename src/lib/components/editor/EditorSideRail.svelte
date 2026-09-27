<script lang="ts" module>
  export type RailAction = 'project' | 'assistant' | 'build' | 'rooms' | 'objects' | 'info' | 'styleboards' | 'finishes' | 'exports' | 'history' | 'help';
</script>

<script lang="ts">
  import { t } from '$lib/i18n';

  let {
    active = 'build',
    panelOpen = false,
    layersOpen = false,
    historyOpen = false,
    onAction = () => {},
  }: {
    active?: RailAction;
    /** Whether the build panel beside the rail is showing. */
    panelOpen?: boolean;
    layersOpen?: boolean;
    historyOpen?: boolean;
    onAction?: (action: RailAction, trigger: HTMLButtonElement) => void;
  } = $props();

  type Item = { id: RailAction; label: string; aria?: string; path: string; soon?: boolean };

  const primary: Item[] = $derived([
    { id: 'assistant', label: 'AI', aria: 'AI design assistant', path: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 17l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z' },
    { id: 'build', label: $t('buildTools.build'), path: 'M3 21h18M5 21V9l7-5 7 5v12M10 21v-6h4v6' },
    { id: 'rooms', label: $t('buildTools.rooms'), path: 'M3 3h18v18H3zM12 3v10M3 13h18' },
    { id: 'objects', label: $t('buildTools.objects'), path: 'M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3M3 11h18v6H3zM5 17v2M19 17v2' },
    { id: 'info', label: $t('layers.title'), aria: $t('editorPanels.layers'), path: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5' },
    { id: 'finishes', label: 'Finishes', path: 'M4 4h16v16H4zM4 12h16M12 4v16' },
    { id: 'styleboards', label: 'Boards', aria: 'Styleboards', path: 'M4 5h16v14H4zM9 5v14M9 11h11' },
    { id: 'exports', label: 'Exports', path: 'M12 4v11M7 10l5 5 5-5M5 20h14' },
  ]);

  const secondary: Item[] = $derived([
    { id: 'help', label: 'Help', aria: $t('shortcuts.title'), path: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7M12 17h.01' },
  ]);

  function isActive(id: RailAction) {
    if (id === 'assistant' || id === 'build' || id === 'rooms' || id === 'objects' || id === 'finishes' || id === 'styleboards') return panelOpen && active === id;
    if (id === 'info') return layersOpen;
    if (id === 'history') return historyOpen;
    return false;
  }
</script>

{#snippet railButton(item: Item)}
  {@const on = isActive(item.id)}
  <button
    type="button"
    class="group relative flex w-[60px] max-md:w-[52px] flex-col items-center justify-center gap-1 rounded-xl py-2 text-center transition-colors duration-150 {on ? 'bg-walnut-tint text-walnut-dark font-bold' : 'text-muted font-medium hover:bg-hover hover:text-charcoal'}"
    aria-pressed={item.id === 'assistant' || item.id === 'build' || item.id === 'rooms' || item.id === 'objects' || item.id === 'finishes' || item.id === 'styleboards' ? on : undefined}
    aria-expanded={item.id === 'info' || item.id === 'history' ? on : undefined}
    aria-label={item.aria ?? item.label}
    title={item.soon ? `${item.aria ?? item.label} — coming soon` : item.id === 'help' ? `${$t('shortcuts.title')} (?)` : item.label}
    onclick={(e) => onAction(item.id, e.currentTarget)}
  >
    {#if on}
      <!-- Active marker: a short wall segment on the rail edge -->
      <span class="absolute -left-2 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r bg-walnut" aria-hidden="true"></span>
    {/if}
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="transition-transform duration-150 group-hover:-translate-y-px">
      <path d={item.path} />
    </svg>
    <span class="max-w-full truncate px-0.5 text-[10.5px] leading-none tracking-tight">{item.label}</span>
    {#if item.soon}
      <span class="absolute right-1 top-1 rounded bg-ivory px-1 text-[8px] font-bold uppercase leading-[12px] tracking-wide text-muted" aria-hidden="true">Soon</span>
    {/if}
  </button>
{/snippet}

<nav aria-label="Editor sections" class="z-30 flex h-full w-[76px] max-md:w-[64px] shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-line bg-cream py-3">
  <button
    type="button"
    class="mb-1 flex h-10 w-10 items-center justify-center rounded-xl text-muted transition-colors hover:bg-hover hover:text-charcoal"
    aria-label="Project"
    title="All projects"
    onclick={(e) => onAction('project', e.currentTarget)}
  >
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h6v6H4zM14 5h6v6h-6zM4 15h6v4H4zM14 15h6v4h-6z" /></svg>
  </button>
  <div class="mb-1 h-px w-8 bg-line" aria-hidden="true"></div>

  {#each primary as item (item.id)}
    {@render railButton(item)}
  {/each}

  <div class="min-h-3 flex-1" aria-hidden="true"></div>
  <!-- Desktop only: keyboard shortcuts do not apply on touch screens.
       Undo History lives in the top bar beside Undo/Redo. -->
  <div class="flex flex-col items-center gap-1 max-md:hidden">
    <div class="mb-1 h-px w-8 bg-line" aria-hidden="true"></div>
    {#each secondary as item (item.id)}
      {@render railButton(item)}
    {/each}
  </div>
</nav>
