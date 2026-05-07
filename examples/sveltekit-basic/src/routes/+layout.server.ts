import cms from '$lib/server/cms';

export async function load({ request }) {
	const user = (await cms.auth?.getUser(request)) ?? null;
	return { user };
}
