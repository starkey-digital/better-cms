<script lang="ts">
import { authorName, postBySlug } from '$lib/cms/cms.remote';

const { params } = $props();
const post = $derived(await postBySlug(params.slug));
</script>

{#if post}
	<article>
		<h1>{post.title}</h1>
		{#if post.authorId}<p class="byline">by {await authorName(post.authorId)}</p>{/if}
		{#if post.excerpt}<p class="excerpt">{post.excerpt}</p>{/if}
		{#if post.published === false}<small>(draft)</small>{/if}
		<p><a href="/posts/{post.slug}/edit">Edit this post</a></p>
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
	.byline {
		color: #a1a1aa;
		font-size: 0.875rem;
		margin-top: -0.5rem;
	}
</style>
