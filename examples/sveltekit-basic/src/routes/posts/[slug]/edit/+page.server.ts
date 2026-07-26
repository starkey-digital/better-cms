import { cms } from '$lib/cms/server/cms';
import { error } from '@sveltejs/kit';

/**
 * Loaded server-side rather than through an awaited remote query: the form's
 * progressive-enhancement attachment has to be applied on first render, and a
 * form nested inside an async `$derived` boundary can miss it and fall back to
 * a native submit — which loses client-side validation state.
 */
export async function load({ params }) {
	const post = await cms.posts.get(params.slug);
	if (!post) error(404, 'Post not found');
	return { post };
}
