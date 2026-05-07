import type { GetUserFn } from './auth/types.js';
import type { CollectionDef, InferRows, SchemaIR } from './ir/types.js';
import type { CMSPlugin } from './plugin/types.js';
import type { ContentStore } from './store/content.js';
import type { MediaStore } from './store/media.js';

export type CollectionsRecord = Record<string, CollectionDef<any, any>>;

/**
 * Runtime context passed into every adapter/media factory. `env` is the
 * environment the CMS was booted with — populated by `cmsHandle`/`createCMS`
 * from `$env/dynamic/private` (SvelteKit) or `process.env` (Node) so that
 * adapter factories never have to read `process.env` themselves.
 *
 * Reading `process.env` at config module scope breaks client bundling: the
 * config module is imported by `<CMSAdmin {config}>`. Forcing the factory
 * form (and supplying env via context) keeps the module evaluation pure.
 */
export interface AdapterContext {
	env: Record<string, string | undefined>;
}

export type AdapterFactory<T> = (ctx: AdapterContext) => T | Promise<T>;

export interface CMSConfig<C extends CollectionsRecord = CollectionsRecord> {
	collections: C;
	adapter: AdapterFactory<ContentStore>;
	media?: AdapterFactory<MediaStore>;
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
