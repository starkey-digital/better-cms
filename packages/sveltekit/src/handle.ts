import type { CmsConfig, CollectionsRecord, CreateCmsOpts } from '@better-cms/core';
import type { Handle } from '@sveltejs/kit';
import { type Cms, _cmsConfigOf, isCmsInstance } from './api.js';
import { withRequest } from './request-context.js';
import { cms as resolveCms } from './server.js';
import { normalizeBasePath } from './utils.js';

/**
 * SvelteKit hook — wraps every request in an AsyncLocalStorage scope so
 * `cms.auth.context()` and the SSR-aware client fetch resolve their
 * request-scoped state without an explicit argument. Requests under
 * `config.basePath` (default `/api/cms`) are delegated to the CMS handler.
 *
 *   // src/hooks.server.ts
 *   import { cmsHandle } from 'better-cms/sveltekit/server';
 *   import { cms } from '$lib/cms/server/cms';
 *   export const handle = cmsHandle(cms);
 *
 * Accepts either a `Cms` instance (from `createCms`) or a raw `CmsConfig`.
 */
export function cmsHandle<C extends CollectionsRecord, Ctx = unknown>(
	cmsOrConfig: Cms<C, Ctx> | CmsConfig<C, Ctx>,
	opts?: CreateCmsOpts,
): Handle {
	const config = isCmsInstance(cmsOrConfig) ? _cmsConfigOf(cmsOrConfig) : cmsOrConfig;
	const basePath = normalizeBasePath(config.basePath);
	const handle: Handle = ({ event, resolve }) =>
		withRequest({ request: event.request, fetch: event.fetch }, async () => {
			const url = new URL(event.request.url);
			if (url.pathname === basePath || url.pathname.startsWith(`${basePath}/`)) {
				const instance = await resolveCms(config, opts);
				return instance.handler(event.request);
			}
			return resolve(event);
		}) as Promise<Response>;
	return handle;
}
