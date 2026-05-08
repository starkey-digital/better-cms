<script lang="ts">
import { invalidateAll } from '$app/navigation';
import { recentPosts, togglePublished } from '$lib/cms.remote';

const posts = $derived(await recentPosts(5));

async function toggle(id: string, current: boolean) {
	await togglePublished({ id, published: !current });
	await invalidateAll();
}
</script>

<main>
	<h1>Recent posts</h1>
	{#if posts.length === 0}
		<p>No published posts yet.</p>
	{:else}
		<ul data-testid="recent-list">
			{#each posts as post (post.id)}
				<li>
					<a href="/posts/{post.slug}"><strong>{post.title}</strong></a>
					{#if post.excerpt}<p>{post.excerpt}</p>{/if}
					<button type="button" onclick={() => toggle(post.id!, post.published ?? false)}>
						{post.published ? 'Unpublish' : 'Publish'}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</main>

<style>
	main {
		max-width: 720px;
		margin: 1rem auto;
		padding: 0 2rem;
	}
	li {
		padding: 1rem 0;
		border-bottom: 1px solid #e4e4e7;
	}
	button {
		margin-top: 0.5rem;
		padding: 0.25rem 0.625rem;
		border: 1px solid #e4e4e7;
		border-radius: 6px;
		background: transparent;
		cursor: pointer;
	}
</style>
