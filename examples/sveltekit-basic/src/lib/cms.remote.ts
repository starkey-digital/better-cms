import { command, query } from '$app/server';
import config, { cms as cmsApi } from '$lib/server/cms';
import { listCollection, runOps } from 'better-cms/sveltekit/remote';

/** Latest N published posts (ordered by createdAt desc). */
export const recentPosts = query('unchecked', async (limit: number) =>
	listCollection(config, 'posts', {
		limit,
		where: { published: true },
		orderBy: [{ field: 'createdAt', dir: 'desc' }],
	}),
);

/** All posts including drafts (admin-only). */
export const allPosts = query(async () => {
	const user = await cmsApi.auth.getUser();
	if (!user) throw new Error('unauthorized');
	return listCollection(config, 'posts', { limit: 50 });
});

/** Flip a post's `published` flag. Admin-only. */
export const togglePublished = command(
	'unchecked',
	async (input: { id: string; published: boolean }) => {
		const user = await cmsApi.auth.getUser();
		if (!user) throw new Error('unauthorized');
		return runOps(config, [
			{ op: 'set', collection: 'posts', id: input.id, data: { published: input.published } },
		]);
	},
);
