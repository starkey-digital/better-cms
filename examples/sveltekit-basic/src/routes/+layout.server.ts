import config from '$lib/server/cms';

export async function load({ request }) {
	const user = (await config.auth?.getUser(request)) ?? null;
	return { user };
}
