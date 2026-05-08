import { command, query } from '$app/server';
import config, { cms } from '$lib/server/cms';
import { listCollection, runOps } from 'better-cms/sveltekit/remote';

async function requireUser() {
	const user = await cms.auth.getUser();
	if (!user) throw new Error('unauthorized');
	return user;
}

export const recentPosts = query('unchecked', async (limit: number) =>
	listCollection(config, 'posts', {
		limit,
		where: { published: true },
		orderBy: [{ field: 'createdAt', dir: 'desc' }],
	}),
);

export const allPosts = query(async () => {
	await requireUser();
	return listCollection(config, 'posts', { limit: 50 });
});

export const togglePublished = command(
	'unchecked',
	async (input: { id: string; published: boolean }) => {
		await requireUser();
		return runOps(config, [
			{ op: 'set', collection: 'posts', id: input.id, data: { published: input.published } },
		]);
	},
);
