<script lang="ts">
import { cmsClient } from '$lib/cmsClient';

const { params } = $props();
const post = $derived(await cmsClient.posts.get(params.slug));
</script>

{#if post}
	<article>
		<h1>{post.title}</h1>
		{#if post.excerpt}<p class="excerpt">{post.excerpt}</p>{/if}
		{#if post.published === false}<small>(draft)</small>{/if}
	</article>
{:else}
	<p>Post not found.</p>
{/if}

<style>
	article {
		max-width: 720px;
		margin: 1rem auto;
		padding: 0 2rem;
	}
	.excerpt {
		color: #71717a;
	}
</style>
