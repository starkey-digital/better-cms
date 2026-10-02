import { type Handle, sequence } from '@sveltejs/kit/hooks';
import { cmsHandle } from 'better-cms/sveltekit/server';
import cms from '#lib/cms/server/cms.ts';
import { auth, migrateAuth } from '#lib/server/auth.ts';

const ready = migrateAuth();

// better-auth serves /api/auth/* (sign-in, the emailed link's verify route, sign-out).
const authHandle: Handle = async ({ event, resolve }) => {
	await ready;
	if (event.url.pathname.startsWith('/api/auth/')) return auth.handler(event.request);
	return resolve(event);
};

export const handle = sequence(authHandle, cmsHandle(cms));
