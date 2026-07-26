<script lang="ts">
import { savePost } from '$lib/cms/cms.remote';

const { data } = $props();
const post = $derived(data.post);
</script>

<main>
	<h1>Edit post</h1>
	<!--
		`.as(type, initial)` wires each input's name, value binding and
		aria-invalid to the form's field state. Hand-writing name/value
		instead leaves the field outside that state, so submitted values and
		`issues()` never populate.
	-->
	<form {...savePost} data-testid="edit-form">
		<input {...savePost.fields.id.as('hidden', post.id)} />

		<label>
			Title
			<input {...savePost.fields.title.as('text', post.title)} />
		</label>
		{#each savePost.fields.title.issues() ?? [] as issue}
			<p class="error">{issue.message}</p>
		{/each}

		<label>
			Slug
			<input {...savePost.fields.slug.as('text', post.slug)} />
		</label>
		{#each savePost.fields.slug.issues() ?? [] as issue}
			<p class="error">{issue.message}</p>
		{/each}

		<label>
			Excerpt
			<input {...savePost.fields.excerpt.as('text', post.excerpt ?? '')} />
		</label>
		{#each savePost.fields.excerpt.issues() ?? [] as issue}
			<p class="error">{issue.message}</p>
		{/each}

		<label class="inline">
			<input {...savePost.fields.published.as('checkbox', post.published ?? false)} />
			Published
		</label>

		<button type="submit">Save</button>
		{#if savePost.result}<p class="ok" data-testid="saved">Saved.</p>{/if}
	</form>
</main>

<style>
	main {
		max-width: 720px;
		margin: 1rem auto;
		padding: 0 2rem;
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.875rem;
	}
	label.inline {
		flex-direction: row;
		align-items: center;
		gap: 0.5rem;
	}
	input {
		font: inherit;
		padding: 0.375rem 0.5rem;
		border: 1px solid #e4e4e7;
		border-radius: 6px;
	}
	label.inline input {
		width: auto;
	}
	button {
		align-self: flex-start;
		padding: 0.375rem 0.875rem;
		border: 1px solid #e4e4e7;
		border-radius: 6px;
		background: transparent;
		cursor: pointer;
		font: inherit;
	}
	.error {
		color: #b91c1c;
		font-size: 0.8125rem;
		margin: 0;
	}
	.ok {
		color: #15803d;
		font-size: 0.875rem;
	}
</style>
