import type { CollectionDef } from '@better-cms/core';

/**
 * Subset of the CMS config the admin UI actually needs at runtime.
 * Adapter / media / auth never cross to the client.
 */
export interface ClientCMSConfig {
	collections: Record<string, CollectionDef>;
	basePath?: string;
}
