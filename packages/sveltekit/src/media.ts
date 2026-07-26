import type { CmsConfig, CollectionsRecord, MediaObject } from '@better-cms/core';
import type { Cms } from './api.js';
import { _cmsConfigOf, isCmsInstance } from './api.js';
import { cmsInstance } from './instance.js';

/**
 * Upload an asset from server code — a remote `command`, a form action, or a
 * `+server.ts` route. The browser client posts to `/api/cms/media` instead;
 * this is the in-process equivalent, and the one media helper without a
 * typed slot on the `cms` object.
 */
export async function uploadMedia<C extends CollectionsRecord, Ctx = unknown>(
	cmsOrConfig: Cms<C, Ctx> | CmsConfig<C, Ctx>,
	body: Blob | ArrayBuffer | Uint8Array,
	opts: { folder?: string; mime?: string; key?: string } = {},
): Promise<MediaObject> {
	const config = isCmsInstance(cmsOrConfig) ? _cmsConfigOf(cmsOrConfig) : cmsOrConfig;
	const instance = await cmsInstance(config);
	if (!instance.context.media) {
		throw new Error('[better-cms] media store not configured');
	}
	return instance.context.media.put(body, opts);
}
