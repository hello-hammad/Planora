<script lang="ts">
  import PlanoraLogo from '$lib/components/PlanoraLogo.svelte';
  /**
   * Planora loading state: a small floor plan draws itself wall by wall, its
   * doors swing in and the rooms fill with warm tints, then the cycle repeats.
   * Static (fully drawn) when the viewer prefers reduced motion.
   */
  let {
    label = 'Preparing your plan…',
    detail = '',
    variant = 'page',
  }: {
    label?: string;
    detail?: string;
    /** `page` fills the screen with the brand mark; `inline` sits inside a panel such as the 3D view. */
    variant?: 'page' | 'inline';
  } = $props();
</script>

<div
  class="planora-loader flex flex-col items-center justify-center gap-5 text-charcoal {variant === 'page' ? 'h-screen bg-ivory' : 'h-full w-full bg-paper'}"
  role="status"
  aria-live="polite"
>
  {#if variant === 'page'}
    <div class="flex items-center gap-2.5" aria-hidden="true">
      <PlanoraLogo />
    </div>
  {/if}

  <div class="relative rounded-[18px] border border-line bg-cream p-5 shadow-[0_8px_30px_rgba(50,40,30,0.08)]">
    <svg class="plan" width="168" height="120" viewBox="0 0 168 120" fill="none" aria-hidden="true">
      <!-- paper grid -->
      <g stroke="#EFE8DE" stroke-width="1">
        {#each [24, 48, 72, 96] as y}<line x1="0" y1={y} x2="168" y2={y} />{/each}
        {#each [24, 48, 72, 96, 120, 144] as x}<line x1={x} y1="0" x2={x} y2="120" />{/each}
      </g>
      <!-- room fills -->
      <rect class="fill f1" x="12" y="12" width="78" height="56" fill="#F2E6D8" />
      <rect class="fill f2" x="90" y="12" width="66" height="56" fill="#EDE4D6" />
      <rect class="fill f3" x="12" y="68" width="54" height="40" fill="#E3E8DF" />
      <rect class="fill f4" x="66" y="68" width="90" height="40" fill="#EFE9DF" />
      <!-- walls -->
      <path class="wall w1" pathLength="1" d="M12 12H156V108H12Z" stroke="#252321" stroke-width="4" stroke-linejoin="miter" />
      <path class="wall w2" pathLength="1" d="M90 12V44M90 58V68M12 68H40M52 68H120M132 68H156M66 68V108" stroke="#252321" stroke-width="2.4" stroke-linecap="square" />
      <!-- door swings -->
      <path class="door d1" pathLength="1" d="M40 68V56A12 12 0 0 1 52 68" stroke="#6B4636" stroke-width="1.4" />
      <path class="door d2" pathLength="1" d="M90 44H78A12 12 0 0 1 90 56" stroke="#6B4636" stroke-width="1.4" />
      <path class="door d3" pathLength="1" d="M120 68V56A12 12 0 0 1 132 68" stroke="#6B4636" stroke-width="1.4" />
      <!-- dimension line -->
      <g class="dim" stroke="#C96F4A" stroke-width="1">
        <path d="M12 4H156M12 1V7M156 1V7" />
      </g>
    </svg>
  </div>

  <div class="flex flex-col items-center gap-1.5 text-center">
    <p class="text-[15px] font-semibold">{label}</p>
    {#if detail}<p class="max-w-xs text-[13px] text-muted">{detail}</p>{/if}
    <span class="bar mt-1 block h-1 w-40 overflow-hidden rounded-full bg-line" aria-hidden="true"><span class="block h-full w-1/3 rounded-full bg-walnut"></span></span>
  </div>
</div>

<style>
  .plan .wall, .plan .door { stroke-dasharray: 1; stroke-dashoffset: 1; }
  .plan .w1 { animation: draw 3.6s cubic-bezier(.6,.1,.3,1) infinite; }
  .plan .w2 { animation: draw 3.6s cubic-bezier(.6,.1,.3,1) infinite; animation-delay: .35s; }
  .plan .d1 { animation: draw 3.6s ease-out infinite; animation-delay: .9s; }
  .plan .d2 { animation: draw 3.6s ease-out infinite; animation-delay: 1.05s; }
  .plan .d3 { animation: draw 3.6s ease-out infinite; animation-delay: 1.2s; }
  .plan .fill { opacity: 0; animation: fill 3.6s ease-out infinite; }
  .plan .f1 { animation-delay: 1.1s; } .plan .f2 { animation-delay: 1.25s; }
  .plan .f3 { animation-delay: 1.4s; } .plan .f4 { animation-delay: 1.55s; }
  .plan .dim { opacity: 0; animation: fill 3.6s ease-out infinite; animation-delay: 1.5s; }
  .bar > span { animation: slide 1.4s ease-in-out infinite; }

  /* Draw in, hold, then fade so the next cycle starts clean. */
  @keyframes draw {
    0% { stroke-dashoffset: 1; opacity: 1; }
    38% { stroke-dashoffset: 0; opacity: 1; }
    85% { stroke-dashoffset: 0; opacity: 1; }
    100% { stroke-dashoffset: 0; opacity: 0; }
  }
  @keyframes fill {
    0%, 8% { opacity: 0; }
    30%, 80% { opacity: 1; }
    100% { opacity: 0; }
  }
  @keyframes slide {
    0% { transform: translateX(-110%); }
    100% { transform: translateX(330%); }
  }

  @media (prefers-reduced-motion: reduce) {
    .plan .wall, .plan .door { animation: none; stroke-dashoffset: 0; }
    .plan .fill, .plan .dim { animation: none; opacity: 1; }
    .bar > span { animation: none; width: 100%; opacity: .35; }
  }
</style>
