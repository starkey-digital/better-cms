import { cms } from '$lib/server/cms';

export async function load() {
	const user = await cms.auth.getUser();
	return { user };
}
