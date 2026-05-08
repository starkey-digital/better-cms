<script lang="ts">
import { invalidateAll } from '$app/navigation';

const { data, children } = $props();

async function logout() {
	await fetch('/api/cms/logout', { method: 'POST' });
	await invalidateAll();
}
</script>

<header class="site-nav">
	<a href="/" class="brand">better-cms example</a>
	<nav>
		<a href="/recent">Recent</a>
		{#if data.user}
			<a href="/cms">Admin</a>
			<button type="button" onclick={logout}>Sign out</button>
		{:else}
			<a href="/cms">Sign in</a>
		{/if}
	</nav>
</header>

{@render children()}

<style>
	.site-nav {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem 2rem;
		border-bottom: 1px solid #e4e4e7;
		max-width: 720px;
		margin-inline: auto;
	}
	.brand {
		font-weight: 600;
		text-decoration: none;
		color: #18181b;
	}
	nav {
		display: flex;
		gap: 1rem;
		align-items: center;
	}
	nav a {
		color: #18181b;
		text-decoration: none;
		border-bottom: 1px solid currentColor;
	}
	nav button {
		background: transparent;
		border: 1px solid #e4e4e7;
		border-radius: 6px;
		padding: 0.25rem 0.625rem;
		cursor: pointer;
		font: inherit;
		font-size: 0.875rem;
	}
</style>
