import type { CMSConfig, CollectionsRecord, CreateCMSOpts } from '@better-cms/core';
import type { Handle } from '@sveltejs/kit';
import { cms } from './server.js';

/**
 * SvelteKit hook — delegates requests under `config.basePath` (default `/cms`) to the CMS handler.
 *
 *   // src/hooks.server.ts
 *   import { cmsHandle } from '@better-cms/sveltekit';
 *   import config from '$lib/cms.config';
 *   export const handle = cmsHandle(config);
 */
export function cmsHandle<C extends CollectionsRecord>(
	config: CMSConfig<C>,
	opts?: CreateCMSOpts,
): Handle {
	const basePath = (config.basePath ?? '/cms').replace(/\/$/, '');
	const handle: Handle = async ({ event, resolve }) => {
		const url = new URL(event.request.url);
		if (url.pathname === basePath || url.pathname.startsWith(`${basePath}/`)) {
			const instance = await cms(config, opts);
			return instance.handler(event.request);
		}
		return resolve(event);
	};
	return handle;
}
