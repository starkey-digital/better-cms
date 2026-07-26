import { command, form, prerender, query } from '$app/server';
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

export const allPosts = query(async () =>
	cms.posts.list({ limit: 50, orderBy: [{ field: 'createdAt', dir: 'desc' }] }),
);

export const postBySlug = query(z.string(), async (slug) => cms.posts.get(slug));

/**
 * Site settings change rarely, so serve them from prerendered output.
 * `dynamic` keeps dev and non-prerendered requests working.
 */
export const siteSettings = prerender(async () => cms.settings.get(), { dynamic: true });

/**
 * One request per render rather than one per post: each card asks for its own
 * author and `query.batch` answers the whole render from a single `in` query.
 */
export const authorName = query.batch(z.string(), async (ids) => {
	const rows = await cms.authors.list({ where: { id: { in: ids } }, limit: ids.length });
	const byId = new Map(rows.map((a) => [a.id, a.name]));
	return (id: string) => byId.get(id) ?? 'Unknown';
});

export const togglePublished = command(ToggleInput, async ({ id, published }) => {
	await cms.posts.update(id, { published });
	await recentPosts(5).refresh();
	await allPosts().refresh();
});

/**
 * `schemas.form` is the collection's create schema with FormData coercion and
 * an optional `id`, so this one handler serves both the new-post and
 * edit-post forms. Field errors come from the same zod schema that guards
 * every other write path.
 */
export const savePost = form(cms.posts.schemas.form, async (data) => {
	const { id, ...values } = data as { id?: string } & Record<string, unknown>;
	const row = id ? await cms.posts.update(id, values) : await cms.posts.create(values);
	await allPosts().refresh();
	return { id: row.id as string, slug: row.slug as string };
});

export const deletePost = command(z.string(), async (id) => {
	await cms.posts.delete(id);
	await allPosts().refresh();
});
