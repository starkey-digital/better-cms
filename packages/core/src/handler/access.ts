import type { CmsConfig } from '../config.js';
import type { AccessVerb } from '../auth/types.js';

/**
 * Default policy when no explicit access function is configured. Reads are
 * public; writes are denied. Set the matching slot in `defineCMS({ access })`
 * or per-collection on `collection({ access })` to override.
 */
const DEFAULTS: Record<AccessVerb, boolean> = {
	read: true,
	create: false,
	update: false,
	delete: false,
};

/**
 * Resolve the access function for a verb. Resolution order:
 *   1. Per-collection `def.access[verb]`
 *   2. Global `config.access[verb]`
 *   3. Built-in default (allow for read/list, deny for writes)
 */
export async function checkAccess(
	config: CmsConfig<any, any> | undefined,
	collectionName: string,
	verb: AccessVerb,
	ctx: unknown,
	doc?: unknown,
): Promise<boolean> {
	if (!config) return true;
	const col = config.collections[collectionName];
	const fn = col?.access?.[verb] ?? config.access?.[verb];
	if (!fn) return DEFAULTS[verb];
	return await (fn as (c: unknown, d?: unknown) => boolean | Promise<boolean>)(ctx, doc);
}
