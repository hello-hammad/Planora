<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { PreviewKind } from '$lib/utils/catalogPreviews';

  /** Rendered preview of a door, window or furnished room; the fallback shows if rendering fails. */
  let { kind, type, mode = '3d', label, fallback }: { kind: PreviewKind; type: string; mode?: '2d' | '3d'; label: string; fallback?: Snippet } = $props();
  let element: HTMLDivElement;
  let visible = $state(false);
  let src = $state<string | null>(null);
  let failed = $state(false);

  $effect(() => {
    if (!element) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { visible = true; observer.disconnect(); }
    }, { rootMargin: '120px' });
    observer.observe(element);
    return () => observer.disconnect();
  });

  $effect(() => {
    if (!visible) return;
    const key = `${kind}:${type}:${mode}`;
    let disposed = false;
    failed = false;
    void import('$lib/utils/catalogPreviews')
      .then(({ catalogPreview }) => catalogPreview(kind, type, mode))
      .then(url => { if (!disposed && key === `${kind}:${type}:${mode}`) { src = url; failed = !url; } })
      .catch(() => { if (!disposed) failed = true; });
    return () => { disposed = true; };
  });
</script>

<div bind:this={element} class="relative flex h-full w-full items-center justify-center">
  {#if src}
    {#key src}<img {src} alt={label} class="preview-img h-full w-full object-contain" draggable="false" />{/key}
  {:else if failed && fallback}
    {@render fallback()}
  {:else}
    <div class="preview-skeleton absolute inset-1.5 rounded-lg" aria-hidden="true"></div>
  {/if}
</div>

<style>
  .preview-img { animation: preview-in .35s ease-out; }
  .preview-skeleton { background: linear-gradient(90deg, rgba(0,0,0,.035) 25%, rgba(0,0,0,.07) 50%, rgba(0,0,0,.035) 75%) 0 0 / 200% 100%; animation: preview-shimmer 1.3s linear infinite; }
  @keyframes preview-in { from { opacity: 0; transform: scale(.97); } }
  @keyframes preview-shimmer { to { background-position: -200% 0; } }
</style>
