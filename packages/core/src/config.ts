import type { GetUserFn } from './auth/types.js';
import type { CollectionDef, InferRows, SchemaIR } from './ir/types.js';
import type { CmsPlugin } from './plugin/types.js';
import type { ContentStore } from './store/content.js';
import type { MediaStore } from './store/media.js';

export type CollectionsRecord = Record<string, CollectionDef<any, any>>;

export interface CmsConfig<C extends CollectionsRecord = CollectionsRecord> {
	collections: C;
	adapter: ContentStore;
	media?: MediaStore;
	auth?: { getUser: GetUserFn };
	plugins?: CmsPlugin[];
	basePath?: string;
	live?: boolean;
}

export interface CmsContext<C extends CollectionsRecord = CollectionsRecord> {
	config: CmsConfig<C>;
	schema: SchemaIR<C>;
	store: ContentStore;
	media?: MediaStore;
}

export type InferConfig<Cfg> = Cfg extends CmsConfig<infer C> ? InferRows<SchemaIR<C>> : never;

/**
 *   // src/routes/cms/+page.server.ts
 *   import cms from '$lib/server/cms';
 *   import { clientCmsConfig } from 'better-cms/sveltekit';
 *   export const load = () => ({ cms: clientCmsConfig(cms) });
 */
export interface ClientCmsConfig<
	C extends Record<string, CollectionDef> = Record<string, CollectionDef>,
> {
	collections: C;
	basePath?: string;
}

export function clientCmsConfig<C extends CollectionsRecord>(
	config: CmsConfig<C>,
): ClientCmsConfig<C> {
	return { collections: config.collections, basePath: config.basePath };
}
