<script lang="ts">
  import { getModelFile } from '$lib/utils/furnitureModelFiles';
  import { furnitureCatalog } from '$lib/utils/furnitureCatalog';
  import AppIcon from '../AppIcon.svelte';

  let { catalogId, name, color }: { catalogId: string; name: string; color: string } = $props();
  let element: HTMLDivElement;
  let src = $state<string | null>(null);
  const icon = $derived(furnitureCatalog.find(f => f.id === catalogId)?.icon ?? 'box');

  $effect(() => {
    const file = getModelFile(catalogId);
    if (!element) return;
    src = null;
    let disposed = false;
    let started = false;
    const load = async () => {
      if (started) return;
      started = true;
      if (!file) return;
      try {
        // Three.js and model bytes are needed only for visible catalog previews.
        const { generateThumbnail } = await import('$lib/utils/furnitureThumbnails');
        if (disposed) return;
        const result = await generateThumbnail(file);
        if (!disposed) src = result;
      } catch { /* Keep the usable color placeholder if a preview cannot load. */ }
    };
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        observer.disconnect();
        void load();
      }
    });
    observer.observe(element);
    return () => { disposed = true; observer.disconnect(); };
  });
</script>

<div bind:this={element} class="flex h-full w-full items-center justify-center">
  {#if src}
    <img {src} alt={name} class="max-h-full max-w-full object-contain drop-shadow-[0_3px_4px_rgba(40,40,30,0.18)]" />
  {:else}
    <div class="flex h-10 w-10 items-center justify-center rounded-xl" style:background-color={`${color}1f`} style:color={color}>
      <AppIcon name={icon} size={20} strokeWidth={1.7} class="brightness-75" />
    </div>
  {/if}
</div>
