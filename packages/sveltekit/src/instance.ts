import type { CmsConfig, CmsInstance, CollectionsRecord, CreateCmsOpts } from '@better-cms/core';
import { createCMS } from '@better-cms/core';

/**
 * Booted instances, keyed by the config object that produced them.
 *
 * Keying matters: an app may mount more than one CMS (multi-tenant, or a
 * separate store for a sub-site), and tests build a fresh config per case. A
 * single module-level instance would hand every caller whichever CMS happened
 * to boot first. The map is weak so a discarded config does not pin its
 * adapter and connections in memory.
 */
const instances = new WeakMap<object, Promise<CmsInstance>>();

/**
 * Boot the CMS for `config`, or return the in-flight/booted instance. The
 * promise is cached rather than the resolved value so concurrent first calls
 * share one boot instead of racing to create tables.
 *
 * A failed boot is evicted rather than cached: booting opens a database
 * connection and may run DDL, so a transient failure must not poison the
 * config for the lifetime of the process. The next call retries.
 */
export function cmsInstance<C extends CollectionsRecord, Ctx = unknown>(
	config: CmsConfig<C, Ctx>,
	opts?: CreateCmsOpts,
): Promise<CmsInstance> {
	const existing = instances.get(config);
	if (existing) return existing;
	const booting = createCMS(config as CmsConfig<C>, opts).catch((e) => {
		instances.delete(config);
		throw e;
	});
	instances.set(config, booting);
	return booting;
}

/** Drop the cached instance for `config`. Test helper — closes nothing, just forgets. */
export function _resetCms(config?: object): void {
	if (config) instances.delete(config);
}
