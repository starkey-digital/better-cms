import cmsConfig from '$lib/server/cms';
import { cms, serverApi } from 'better-cms/sveltekit';

export async function load() {
	const instance = await cms(cmsConfig);
	const api = serverApi(instance.context);
	const [posts, settings] = await Promise.all([
		api.list('posts', { limit: 20 }),
		api.getSingleton('settings'),
	]);
	return { posts, settings };
}
