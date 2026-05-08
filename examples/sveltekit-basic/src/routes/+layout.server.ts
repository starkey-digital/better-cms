import { cms } from '$lib/cms/server/cms';

export async function load() {
	const user = await cms.auth.getUser();
	return { user };
}
