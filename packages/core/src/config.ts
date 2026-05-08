import type { GetUserFn } from './auth/types.js';
import type { CollectionDef, InferRows, SchemaIR } from './ir/types.js';
import type { CmsPlugin } from './plugin/types.js';
import type { ContentStore } from './store/content.js';
import type { MediaStore } from './store/media.js';
import type { StandardSchemaV1 } from './util/standard-schema.js';

export type CollectionsRecord = Record<string, CollectionDef<any, any>>;

/**
 * Optional validator integration. Plug a "schema → JSON Schema" converter
 * (e.g. zod 4's `z.toJSONSchema`, `@valibot/to-json-schema`) so the admin
 * UI and MCP descriptors get rich constraint metadata for free.
 */
export interface ValidatorIntegration {
	toJsonSchema?: (schema: StandardSchemaV1) => unknown;
}

export interface CmsConfig<C extends CollectionsRecord = CollectionsRecord> {
	collections: C;
	adapter: ContentStore;
	media?: MediaStore;
	auth?: { getUser: GetUserFn };
	plugins?: CmsPlugin[];
	basePath?: string;
	live?: boolean;
	validator?: ValidatorIntegration;
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
/**
 * Browser-safe slice of `CmsConfig`. Strips `schemas` (function references —
 * non-serializable) and `validation` (server-only). Server reattaches schemas
 * lazily; admin only needs static field metadata.
 */
export type ClientCollectionDef = Omit<CollectionDef, 'schemas' | 'validation'>;

export interface ClientCmsConfig<
	C extends Record<string, ClientCollectionDef> = Record<string, ClientCollectionDef>,
> {
	collections: C;
	basePath?: string;
}

export function clientCmsConfig<C extends CollectionsRecord>(
	config: CmsConfig<C>,
): ClientCmsConfig {
	const collections: Record<string, ClientCollectionDef> = {};
	for (const [name, def] of Object.entries(config.collections)) {
		const { schemas: _s, validation: _v, ...rest } = def as CollectionDef;
		collections[name] = rest as ClientCollectionDef;
	}
	return { collections, basePath: config.basePath };
}
