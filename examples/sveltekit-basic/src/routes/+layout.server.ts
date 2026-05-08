import { cms } from '$lib/cms/server/cms';

export async function load() {
	const ctx = await cms.auth.context();
	return { ctx };
}
