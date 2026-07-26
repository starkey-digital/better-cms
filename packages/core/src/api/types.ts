import type { CollectionsRecord } from '../config.js';
import type {
	CollectionDef,
	CollectionSchemas,
	FieldsRecord,
	InferRows,
	SchemaIR,
} from '../ir/types.js';
import type { FindManyQuery, WhereClause } from '../store/content.js';

/**
 * The read/write surface for one collection. There is exactly one
 * implementation ({@link createCollectionApi}); the HTTP handler and every
 * framework binding call it rather than reaching for the store directly.
 * Access policies and field (de)serialization are enforced inside, so no
 * caller can accidentally skip them.
 */
export interface CollectionApi<T> {
	list(query?: FindManyQuery): Promise<T[]>;
	find(id: string): Promise<T | null>;
	/** Look up by id first; falls back to the collection's slug-tagged field when one exists. */
	get(idOrSlug: string): Promise<T | null>;
	count(where?: WhereClause): Promise<number>;
	create(data: Partial<T>): Promise<T>;
	update(id: string, data: Partial<T>): Promise<T>;
	delete(id: string): Promise<void>;
	/**
	 * Standard Schema validators for this collection. Pass straight to
	 * SvelteKit `command(schema, fn)` / `form(schema, fn)`, tRPC, hono, or
	 * anywhere Standard Schema is accepted.
	 */
	readonly schemas: CollectionSchemas;
}

/** Singletons are a single row under the fixed id `"default"`. */
export interface SingletonApi<T> {
	get(): Promise<T | null>;
	set(data: Partial<T>): Promise<T>;
	readonly schemas: CollectionSchemas;
}

/** Maps a collections record to its typed API, discriminating singletons from collections. */
export type CmsApi<C extends CollectionsRecord> = {
	[K in keyof C]: C[K] extends CollectionDef<FieldsRecord, 'singleton'>
		? SingletonApi<InferRows<SchemaIR<C>>[K]>
		: CollectionApi<InferRows<SchemaIR<C>>[K]>;
};

/**
 * Resolves the request-scoped auth context. Called lazily on every operation
 * so a module-scope API object still sees per-request state. Returning
 * `undefined` means "no context" — access functions receive it verbatim.
 */
export type CtxResolver = () => unknown | Promise<unknown>;
