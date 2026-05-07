<script lang="ts">
	let { data } = $props();
	const settings = $derived(data.settings as { siteTitle?: string; tagline?: string } | null);
</script>

<svelte:head>
	<title>{settings?.siteTitle ?? 'better-cms example'}</title>
</svelte:head>

<header>
	<h1>{settings?.siteTitle ?? 'better-cms example'}</h1>
	{#if settings?.tagline}<p class="tagline">{settings.tagline}</p>{/if}
	<nav>
		<a href="/cms">Open admin →</a>
	</nav>
</header>

<main>
	<h2>Posts</h2>
	{#if data.posts.length === 0}
		<p>No posts yet. <a href="/cms">Create one in the admin</a>.</p>
	{:else}
		<ul>
			{#each data.posts as post (post.id)}
				<li>
					<strong>{post.title}</strong>
					{#if post.published === false}<small>(draft)</small>{/if}
					{#if post.excerpt}<p>{post.excerpt}</p>{/if}
				</li>
			{/each}
		</ul>
	{/if}
</main>

<style>
	:global(body) {
		font-family:
			system-ui,
			-apple-system,
			sans-serif;
		margin: 0;
		padding: 2rem;
		max-width: 720px;
		margin-inline: auto;
	}
	header h1 {
		margin-bottom: 0.25rem;
	}
	.tagline {
		color: #71717a;
		margin-top: 0;
	}
	nav a {
		display: inline-block;
		margin-block: 0.5rem 1.5rem;
		color: #18181b;
		text-decoration: none;
		border-bottom: 1px solid currentColor;
	}
	main h2 {
		margin-top: 2rem;
	}
	ul {
		list-style: none;
		padding: 0;
	}
	li {
		padding: 1rem;
		border: 1px solid #e4e4e7;
		border-radius: 8px;
		margin-bottom: 0.75rem;
	}
	li small {
		color: #a1a1aa;
		margin-left: 0.5rem;
	}
	li p {
		color: #52525b;
		margin: 0.5rem 0 0;
	}
</style>
