import { command, query } from '$app/server';
import config, { cms } from '$lib/server/cms';
import { listCollection, runOps } from 'better-cms/sveltekit/remote';
import * as v from 'valibot';

async function requireUser() {
	const user = await cms.auth.getUser();
	if (!user) throw new Error('unauthorized');
	return user;
}

// Standard-Schema validators (any compatible lib works — zod, valibot,
// arktype). SvelteKit's command/query reject bad input before our handler
// runs, so we never see invalid shapes inside the body.
const RecentLimit = v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(50));
const ToggleInput = v.object({
	id: v.string(),
	published: v.boolean(),
});

export const recentPosts = query(RecentLimit, async (limit) =>
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

export const togglePublished = command(ToggleInput, async (input) => {
	await requireUser();
	return runOps(config, [
		{ op: 'set', collection: 'posts', id: input.id, data: { published: input.published } },
	]);
});
