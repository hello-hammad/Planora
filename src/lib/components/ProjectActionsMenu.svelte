<script lang="ts">
  import { t } from '$lib/i18n';
  import { tick } from 'svelte';

  let { name, disabled = false, onaction }: {
    name: string;
    disabled?: boolean;
    onaction: (action: 'open' | 'rename' | 'duplicate' | 'delete') => void;
  } = $props();
  const id = $props.id();
  let open = $state(false);
  let trigger = $state<HTMLButtonElement>();
  let menu = $state<HTMLDivElement>();
  const actions = ['open', 'rename', 'duplicate', 'delete'] as const;

  function close(restore = false) {
    open = false;
    if (restore) trigger?.focus({ preventScroll: true });
  }
  async function show(last = false) {
    if (disabled) return;
    open = true;
    await tick();
    const items = menu?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    items?.[last ? items.length - 1 : 0]?.focus();
  }
  function outside(event: Event) {
    const target = event.target as Node;
    if (open && !menu?.contains(target) && !trigger?.contains(target)) close();
  }
  function keydown(event: KeyboardEvent) {
    const items = [...(menu?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
    else if (event.key === 'Tab') {
      // Continue the page's normal tab order from the menu button.
      close(true);
    } else {
      let next: number | undefined;
      if (event.key === 'ArrowDown') next = (index + 1) % items.length;
      else if (event.key === 'ArrowUp') next = (index - 1 + items.length) % items.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = items.length - 1;
      else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        // Repeated letters cycle matching actions (Duplicate / Delete).
        for (let offset = 1; offset <= items.length; offset++) {
          const candidate = (index + offset) % items.length;
          if (items[candidate].textContent?.trim().toLowerCase().startsWith(event.key.toLowerCase())) { next = candidate; break; }
        }
      }
      if (next !== undefined) { event.preventDefault(); items[next]?.focus(); }
    }
  }
</script>

<svelte:window onpointerdown={outside} onfocusin={outside} />
<button bind:this={trigger} type="button" {disabled}
  onclick={() => open ? close(true) : show()}
  onkeydown={(event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); void show(event.key === 'ArrowUp');
    }
  }}
  aria-label={$t('library.actions', { name: name || $t('library.untitled') })}
  aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
  class="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-lg border border-[#71808a] bg-[#3d4a4e] shadow-sm backdrop-blur transition-opacity hover:bg-[#47565b] focus-visible:opacity-100 disabled:opacity-40 md:opacity-0 md:group-hover:opacity-100">
  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" class="text-[#f3eee7]"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
</button>
{#if open}
  <div bind:this={menu} {id} role="menu" tabindex="-1" aria-label={$t('library.actions', { name: name || $t('library.untitled') })}
    onkeydown={keydown} class="absolute top-12 right-3 z-50 w-40 rounded-[12px] border border-[#69757a] bg-[#2f383a] py-1 shadow-[0_12px_40px_rgba(11,14,16,0.32)]">
    {#each actions as action}
      <button type="button" role="menuitem" tabindex="-1"
        onclick={() => { close(true); onaction(action); }}
        class="w-full px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none {action === 'delete' ? 'text-[#f39a8a] hover:bg-[#4b2f2b] focus:bg-[#4b2f2b]' : 'text-[#f3eee7] hover:bg-[#46555c] focus:bg-[#46555c]'}">
        {$t(`library.${action}`)}
      </button>
    {/each}
  </div>
{/if}
