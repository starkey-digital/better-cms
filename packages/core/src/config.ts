import type { Access, AuthContextFn } from './auth/types.js';
import type { CollectionDef, HooksIR, InferRows, SchemaIR } from './ir/types.js';
import type { CmsPlugin } from './plugin/types.js';
import type { ContentStore } from './store/content.js';
import type { MediaStore } from './store/media.js';

export type CollectionsRecord = Record<string, CollectionDef<any, any>>;

export interface CmsConfig<
	C extends CollectionsRecord = CollectionsRecord,
	Ctx = unknown,
> {
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
}

export type InferConfig<Cfg> = Cfg extends CmsConfig<infer C> ? InferRows<SchemaIR<C>> : never;

/**
 * Browser-safe slice of `CmsConfig`. Strips `schemas` (lazy getter, recreated
 * server-side), `validation` (function refs), `access`, and `hooks` (function
 * refs — non-serializable). The optional `Ctx` phantom carries the
 * auth-context type forward to `createCmsClient` so `cmsClient.auth.context()`
 * stays typed without an explicit generic at the call site.
 */
export type ClientCollectionDef = Omit<
	CollectionDef,
	'schemas' | 'validation' | 'access' | 'hooks'
>;

export interface ClientCmsConfig<
	C extends Record<string, ClientCollectionDef> = Record<string, ClientCollectionDef>,
	Ctx = unknown,
> {
	collections: C;
	basePath?: string;
	/** Phantom — never set at runtime. Carries Ctx forward to `createCmsClient` for type inference. */
	readonly __ctx?: Ctx;
}

/**
 * Strip server-only fields (`schemas`, `validation`, `access`, `hooks`) from
 * each collection definition so the result is browser-bundle safe. Pass
 * `<typeof collections, AppCtx>` to pin the auth-context type — propagates
 * to `createCmsClient` via the phantom slot.
 */
export function clientCmsConfig<C extends CollectionsRecord, Ctx = unknown>(input: {
	collections: C;
	basePath?: string;
}): ClientCmsConfig<C, Ctx> {
	const collections: Record<string, ClientCollectionDef> = {};
	for (const [name, def] of Object.entries(input.collections)) {
		const {
			schemas: _s,
			validation: _v,
			access: _a,
			hooks: _h,
			toJsonSchema: _t,
			__schema: _ss,
			...rest
		} = def as CollectionDef & { __schema?: unknown };
		collections[name] = rest as ClientCollectionDef;
	}
	return { collections, basePath: input.basePath } as ClientCmsConfig<C, Ctx>;
}
