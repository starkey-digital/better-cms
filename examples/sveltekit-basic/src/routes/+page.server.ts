import { cms } from '$lib/server/cms';

export async function load() {
	const [posts, settings] = await Promise.all([
		cms.posts.list({ limit: 20, orderBy: [{ field: 'createdAt', dir: 'desc' }] }),
		cms.settings.get(),
	]);
	return { posts, settings };
}
