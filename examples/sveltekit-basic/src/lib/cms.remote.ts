import { command, query } from '$app/server';
import config, { cms } from '$lib/server/cms';
import { listCollection, runOps } from 'better-cms/sveltekit/remote';
import { z } from 'zod';

async function requireUser() {
	const user = await cms.auth.getUser();
	if (!user) throw new Error('unauthorized');
	return user;
}

// `posts.schemas.create` / `.update` are auto-composed Standard Schemas
// derived from each field's `validation` slot in cms.config. Drop straight
// into SvelteKit's command/query (any Standard-Schema validator works).
const PostsCreate = config.collections.posts.schemas.create;
const PostsUpdate = config.collections.posts.schemas.update;

// Bespoke shapes (e.g. for a partial update with explicit field set) still
// hand-roll their schema — the composed `schemas` only cover full-row CRUD.
const RecentLimit = z.number().int().min(1).max(50);
const ToggleInput = z.object({ id: z.string(), published: z.boolean() });

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
