import type { CMSConfig, CollectionsRecord } from '../config.js';

/**
 * Author entry point. Captures collection types verbatim so downstream APIs are typed.
 */
export function defineCMS<const C extends CollectionsRecord>(config: CMSConfig<C>): CMSConfig<C> {
	return config;
}
