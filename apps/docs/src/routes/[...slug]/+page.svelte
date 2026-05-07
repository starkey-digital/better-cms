<script lang="ts">
const { data } = $props();
</script>

<svelte:head>
	<title>{data.title} — better-cms</title>
</svelte:head>

<article class="prose">
	{@html data.html}
</article>
