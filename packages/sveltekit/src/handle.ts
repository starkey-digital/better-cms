import type { CmsConfig, CollectionsRecord, CreateCmsOpts } from '@better-cms/core';
import type { Handle } from '@sveltejs/kit';
import { withRequest } from './request-context.js';
import { cms } from './server.js';

/**
 * SvelteKit hook — wraps every request in an AsyncLocalStorage scope so
 * `cms.auth.getUser()` and the SSR-aware client fetch resolve their
 * request-scoped state without an explicit argument. Requests under
 * `config.basePath` (default `/api/cms`) are delegated to the CMS handler.
 *
 *   // src/hooks.server.ts
 *   import { cmsHandle } from 'better-cms/sveltekit/server';
 *   import config from '$lib/server/cms';
 *   export const handle = cmsHandle(config);
 */
export function cmsHandle<C extends CollectionsRecord>(
	config: CmsConfig<C>,
	opts?: CreateCmsOpts,
): Handle {
	const basePath = (config.basePath ?? '/api/cms').replace(/\/$/, '');
	const handle: Handle = ({ event, resolve }) =>
		withRequest({ request: event.request, fetch: event.fetch }, async () => {
			const url = new URL(event.request.url);
			if (url.pathname === basePath || url.pathname.startsWith(`${basePath}/`)) {
				const instance = await cms(config, opts);
				return instance.handler(event.request);
			}
			return resolve(event);
		}) as Promise<Response>;
	return handle;
}
