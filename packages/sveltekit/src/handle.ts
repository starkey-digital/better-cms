import type { CmsConfig, CollectionsRecord, CreateCmsOpts } from '@better-cms/core';
import type { RequestEvent } from '@sveltejs/kit';
import { type Cms, _cmsConfigOf, _cmsRuntimeOf, isCmsInstance } from './api.js';
import { cmsInstance } from './instance.js';
import { withRequestEvent } from './request.js';
import { normalizeBasePath } from './utils.js';

// `Handle` moved to `@sveltejs/kit/hooks` in Kit 3; this structural equivalent
// is assignable to it on both Kit 2 and Kit 3.
type Handle = (input: {
	event: RequestEvent;
	resolve: (event: RequestEvent) => Response | Promise<Response>;
}) => Response | Promise<Response>;

/**
 * SvelteKit hook — opens the request scope that `cms.*` reads, and serves the
 * CMS HTTP endpoints under `config.basePath` (default `/api/cms`). Those
 * endpoints back the admin UI and external clients; app code should call the
 * `cms` object directly instead.
 *
 *   // src/hooks.server.ts
 *   import { cmsHandle } from 'better-cms/sveltekit/server';
 *   import { cms } from '#lib/cms/server/cms.ts';
 *   export const handle = cmsHandle(cms);
 *
 * This hook must be installed: without it `cms.auth.context()` has no request
 * to read and access policies see an undefined context.
 *
 * Accepts either a `Cms` instance (from `createCms`) or a raw `CmsConfig`.
 */
export function cmsHandle<C extends CollectionsRecord, Ctx = unknown>(
	cmsOrConfig: Cms<C, Ctx> | CmsConfig<C, Ctx>,
	opts?: CreateCmsOpts,
): Handle {
	const fromCreateCms = isCmsInstance(cmsOrConfig);
	const config = fromCreateCms ? _cmsConfigOf(cmsOrConfig) : cmsOrConfig;

	// Whichever caller boots the config first supplies its runtime options, and
	// an HTTP request frequently beats the first `cms.*` call. Reuse the options
	// the instance was built with so the booted CMS is identical either way —
	// otherwise a configured live transport is installed or lost by ordering.
	if (fromCreateCms && opts) {
		console.warn(
			'[better-cms] cmsHandle(cms, opts) ignores opts for an instance built by createCms — pass them as createCms({ runtime }) instead.',
		);
	}
	const runtime = fromCreateCms ? _cmsRuntimeOf(cmsOrConfig) : opts;
	const basePath = normalizeBasePath(config.basePath);
	return ({ event, resolve }) =>
		withRequestEvent(event, async () => {
			const { pathname } = event.url;
			if (pathname !== basePath && !pathname.startsWith(`${basePath}/`)) {
				return resolve(event);
			}
			const instance = await cmsInstance(config, runtime);
			return instance.handler(event.request);
		}) as Promise<Response>;
}
