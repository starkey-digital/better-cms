import type { GetUserFn } from './auth/types.js';
import type { CollectionDef, InferRows, SchemaIR } from './ir/types.js';
import type { CMSPlugin } from './plugin/types.js';
import type { ContentStore } from './store/content.js';
import type { MediaStore } from './store/media.js';

export type CollectionsRecord = Record<string, CollectionDef<any, any>>;

export type LazyAdapter<T> = T | (() => T | Promise<T>);

export async function resolveLazy<T>(value: LazyAdapter<T>): Promise<T> {
	return typeof value === 'function' ? await (value as () => T | Promise<T>)() : value;
}

export interface CMSConfig<C extends CollectionsRecord = CollectionsRecord> {
	collections: C;
	adapter: LazyAdapter<ContentStore>;
	media?: LazyAdapter<MediaStore>;
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
