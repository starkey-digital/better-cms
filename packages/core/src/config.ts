import type { GetUserFn } from './auth/types.js';
import type { CollectionDef, InferRows, SchemaIR } from './ir/types.js';
import type { CMSPlugin } from './plugin/types.js';
import type { ContentStore } from './store/content.js';
import type { MediaStore } from './store/media.js';

export type CollectionsRecord = Record<string, CollectionDef<any, any>>;

export interface CMSConfig<C extends CollectionsRecord = CollectionsRecord> {
	collections: C;
	adapter: ContentStore;
	media?: MediaStore;
	auth?: { getUser: GetUserFn };
	plugins?: CMSPlugin[];
	basePath?: string;
	live?: boolean;
}

export interface CMSContext<C extends CollectionsRecord = CollectionsRecord> {
	config: CMSConfig<C>;
	schema: SchemaIR<C>;
	store: ContentStore;
	media?: MediaStore;
}

export type InferConfig<Cfg> = Cfg extends CMSConfig<infer C> ? InferRows<SchemaIR<C>> : never;

/**
 *   // src/routes/cms/+page.server.ts
 *   import cms from '$lib/server/cms';
 *   import { clientCMSConfig } from 'better-cms/sveltekit';
 *   export const load = () => ({ cms: clientCMSConfig(cms) });
 */
export interface ClientCMSConfig {
	collections: Record<string, CollectionDef>;
	basePath?: string;
}

export function clientCMSConfig<C extends CollectionsRecord>(
	config: CMSConfig<C>,
): ClientCMSConfig {
	return { collections: config.collections, basePath: config.basePath };
}
