import type { CmsConfig, CollectionsRecord } from '../config.js';

/**
 * Author entry point. Captures collection types verbatim so downstream APIs are typed.
 */
export function defineCMS<const C extends CollectionsRecord>(config: CmsConfig<C>): CmsConfig<C> {
	return config;
}
