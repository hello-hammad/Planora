<script lang="ts">
  /** The one Planora mark: sage tile, white "P", terracotta dot. Matches static/logo.svg and the favicon. */
  let { size = 36, wordmark = true, class: className = '' }: { size?: number; wordmark?: boolean; class?: string } = $props();
</script>

<span class="inline-flex items-center gap-2.5 {className}">
  <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true" class="shrink-0">
    <rect width="36" height="36" rx="10" fill="#52765B" />
    <g transform="translate(6 6)" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M7 20V5h7a4.5 4.5 0 0 1 0 9H7" /><circle cx="17.5" cy="19" r="1.6" fill="#E7A37F" stroke="none" />
    </g>
  </svg>
  {#if wordmark}<span class="text-lg font-bold tracking-tight text-charcoal">Planora</span>{/if}
</span>
