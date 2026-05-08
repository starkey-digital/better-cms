import { command, query } from '$app/server';
import config, { cms } from '$lib/server/cms';
import { buildSchema } from 'better-cms';
import { listCollection, runOps } from 'better-cms/sveltekit/remote';
import * as v from 'valibot';

async function requireUser() {
	const user = await cms.auth.getUser();
	if (!user) throw new Error('unauthorized');
	return user;
}

// Validators derived from the collection field defs in cms.config — same
// rules the CMS itself enforces on writes. Drop-in for SvelteKit's
// command/query (any Standard-Schema-compatible validator works).
const PostsCreate = buildSchema(config.collections.posts, 'create');
const PostsUpdate = buildSchema(config.collections.posts, 'update');

// Bespoke shapes (e.g. for a partial update with explicit field set) still
// hand-roll their schema — buildSchema only generates per-collection.
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

export const createPost = command(PostsCreate, async (input) => {
	await requireUser();
	return runOps(config, [{ op: 'create', collection: 'posts', data: input }]);
});

export const updatePost = command(PostsUpdate, async (input) => {
	await requireUser();
	const { id, ...rest } = input as { id: string } & Record<string, unknown>;
	return runOps(config, [{ op: 'set', collection: 'posts', id, data: rest }]);
});
