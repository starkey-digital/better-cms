import type { CmsConfig, CollectionsRecord, CreateCmsOpts } from '@better-cms/core';
import { cms } from './server.js';

/**
 * Helpers for SvelteKit remote functions (`*.remote.ts`).
 *
 * Most callers should use the `cms` server instance from `createCms(config)`
 * directly — `cms.posts.list({...})` / `cms.posts.create(data)` /
 * `cms.auth.requireUser()` covers query, command, and auth in one surface,
 * runs through the same op pipeline, and publishes live events.
 *
 * `uploadMedia()` stays here because it's the one helper without a typed
 * equivalent on the `cms` server API.
 */
export async function uploadMedia<C extends CollectionsRecord>(
	config: CmsConfig<C>,
	body: Blob | ArrayBuffer | Uint8Array,
	opts: { folder?: string; mime?: string; key?: string } = {},
	cmsOpts?: CreateCmsOpts,
) {
	const instance = await cms(config, cmsOpts);
	if (!instance.context.media) {
		throw new Error('[better-cms] media store not configured');
	}
	return instance.context.media.put(body, opts);
}
