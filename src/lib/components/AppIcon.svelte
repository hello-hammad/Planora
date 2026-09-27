<script lang="ts">
  import { iconFor } from '$lib/icons';

  /**
   * One Lucide icon by name. Decorative by default (hidden from screen readers);
   * pass `label` when the icon is the only content of a control.
   */
  let { name, size = 16, strokeWidth = 1.9, class: className = '', label, fill = 'none' }: {
    name: string; size?: number; strokeWidth?: number; class?: string; label?: string; fill?: string;
  } = $props();

  const Icon = $derived(iconFor(name));
</script>

<Icon {size} {strokeWidth} {fill} class="inline-block shrink-0 align-[-0.15em] {className}" aria-hidden={label ? undefined : 'true'} aria-label={label} role={label ? 'img' : undefined} />
