<script>
  import '../app.css';
  import { initializeLocale } from '$lib/i18n';
  import { onMount } from 'svelte';
  import { account } from '$lib/stores/account';
  import DeploymentNotice from '$lib/components/DeploymentNotice.svelte';
  onMount(initializeLocale);
  let { children, data } = $props();
  // Set before children render so project storage already targets the right account.
  $effect.pre(() => { account.set(data.user ?? null); });
</script>

{@render children()}
<DeploymentNotice />
