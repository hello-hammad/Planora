<script lang="ts">
  type RailAction = 'project' | 'build' | 'info' | 'objects' | 'styleboards' | 'finishes' | 'exports' | 'help';

  let {
    active = 'build',
    onAction = () => {},
  }: {
    active?: RailAction;
    onAction?: (action: RailAction) => void;
  } = $props();

  const items: { id: RailAction; label: string; path: string }[] = [
    { id: 'project', label: 'Project', path: 'M5 4h14v16H5zM8 8h8M8 12h5' },
    { id: 'build', label: 'Build', path: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.2-3.2a6 6 0 0 1-7.8 7.8l-6.5 6.5a2 2 0 0 1-2.8-2.8l6.5-6.5a6 6 0 0 1 7.8-7.8z' },
    { id: 'info', label: 'Info', path: 'M12 8h.01M11 11h1v5h1M5 4h14v16H5z' },
    { id: 'objects', label: 'Objects', path: 'M4 10h16v8H4zM7 10V7h10v3M8 18v2M16 18v2' },
    { id: 'styleboards', label: 'Styleboards', path: 'M4 5h16v14H4zM8 5v14M4 10h16' },
    { id: 'finishes', label: 'Finishes', path: 'M5 5h14v14H5zM8 8h8v8H8z' },
    { id: 'exports', label: 'Exports', path: 'M12 4v10M8 10l4 4 4-4M5 19h14' },
    { id: 'help', label: 'Help', path: 'M12 17h.01M9.1 9a3 3 0 1 1 5.2 2c-.9.8-1.8 1.2-1.8 2.5M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z' },
  ];
</script>

<aside class="absolute left-3 top-1/2 z-40 flex -translate-y-1/2 flex-col items-center gap-1 rounded-2xl border border-slate-200/80 bg-white/95 px-1.5 py-2 shadow-[0_12px_35px_rgba(15,23,42,0.14)] backdrop-blur-md">
  {#each items as item}
    <button
      type="button"
      class="group flex w-[68px] flex-col items-center justify-center gap-1 rounded-xl px-1 py-2.5 text-center transition-colors duration-150 hover:bg-slate-100 {active === item.id ? 'bg-slate-100 text-slate-900' : 'text-slate-500'}"
      class:font-semibold={active === item.id}
      aria-current={active === item.id ? 'page' : undefined}
      aria-label={item.label}
      title={item.label}
      onclick={() => onAction(item.id)}
    >
      <span class="flex h-6 w-6 items-center justify-center text-slate-700 transition-transform duration-150 group-hover:-translate-y-0.5">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d={item.path} />
        </svg>
      </span>
      <span class="max-w-full truncate text-[10px] leading-tight tracking-tight">{item.label}</span>
    </button>
  {/each}
</aside>
