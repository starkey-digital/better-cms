import { command, query } from '$app/server';
import { posts } from '$lib/cms/schemas';
import { cms } from '$lib/cms/server/cms';
import { z } from 'zod';

const RecentLimit = z.number().int().min(1).max(50);
const ToggleInput = z.object({ id: z.string(), published: z.boolean() });

export const recentPosts = query(RecentLimit, async (limit) =>
	cms.posts.list({
		limit,
		where: { published: true },
		orderBy: [{ field: 'createdAt', dir: 'desc' }],
	}),
);

export const allPosts = query(async () => {
	await cms.auth.requireUser();
	return cms.posts.list({ limit: 50 });
});

export const togglePublished = command(ToggleInput, async ({ id, published }) => {
	await cms.auth.requireUser();
	return cms.posts.update(id, { published });
});

export const createPost = command(posts.schemas.create, async (input) => {
	await cms.auth.requireUser();
	return cms.posts.create(input);
});

export const updatePost = command(posts.schemas.update, async (input) => {
	await cms.auth.requireUser();
	const { id, ...rest } = input as { id: string } & Record<string, unknown>;
	return cms.posts.update(id, rest);
});
