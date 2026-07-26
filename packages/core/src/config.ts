import type { Access, AuthContextFn } from './auth/types.js';
import type { LiveTransport } from './handler/live.js';
import type { CollectionDef, HooksIR, InferRows, SchemaIR } from './ir/types.js';
import type { CmsPlugin } from './plugin/types.js';
import type { ContentStore } from './store/content.js';
import type { MediaStore } from './store/media.js';

export type CollectionsRecord = Record<string, CollectionDef<any, any>>;

export interface CmsConfig<C extends CollectionsRecord = CollectionsRecord, Ctx = unknown> {
	collections: C;
	adapter: ContentStore;
	media?: MediaStore;
	auth?: { context: AuthContextFn<Ctx> };
	/** Global default access policies. Per-collection `access` slots override per verb. */
	access?: Access<Ctx>;
	/** Global lifecycle hooks. Fire before per-collection hooks. */
	hooks?: HooksIR<Ctx>;
	plugins?: CmsPlugin[];
	basePath?: string;
	live?: boolean;
}

export interface CmsContext<C extends CollectionsRecord = CollectionsRecord> {
	config: CmsConfig<any, any>;
	schema: SchemaIR<C>;
	store: ContentStore;
	media?: MediaStore;
	/** Broadcast channel for live preview / inline-edit fan-out. Every write through the API publishes here. */
	live: LiveTransport;
}

export type InferConfig<Cfg> = Cfg extends CmsConfig<infer C> ? InferRows<SchemaIR<C>> : never;
