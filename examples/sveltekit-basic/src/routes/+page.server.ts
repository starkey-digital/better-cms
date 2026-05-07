import { cms, serverApi } from 'better-cms/sveltekit';
import config from '$lib/cms.config';

export async function load() {
	const instance = await cms(config);
	const api = serverApi(instance.context);
	const [posts, settings] = await Promise.all([
		api.list('posts', { limit: 20 }),
		api.getSingleton('settings'),
	]);
	return { posts, settings };
}
