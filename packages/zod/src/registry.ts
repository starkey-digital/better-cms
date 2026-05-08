import type { CollectionDef } from '@better-cms/core';
import { z } from 'zod';

/**
 * Reference to another collection. Either a direct `CollectionDef` (declared
 * earlier in the file) or a lazy thunk for forward / circular refs:
 *
 *   const posts = collection({ schema: PostSchema });
 *   const authors = collection({
 *     schema: z.object({ posts: relation(() => posts, { many: true }) }),
 *   });
 *
 * `defineCMS()` resolves the ref to a string name at registration time by
 * matching the def against `config.collections`. Typo-safe — TS rejects
 * anything that isn't a CollectionDef.
 */
export type CollectionRef = CollectionDef | (() => CollectionDef);

export interface BcmsFieldMeta {
	/** Override the kind the walker would otherwise infer from the zod type. */
	kind?: 'richText' | 'image' | 'file' | 'slug' | 'relation';
	/** Override storage hint (column vs json). Defaults follow `kind`. */
	storage?: 'column' | 'json';
	unique?: boolean;
	indexed?: boolean;
	relation?: {
		target: CollectionRef;
		many: boolean;
		onDelete?: 'cascade' | 'set null' | 'restrict';
	};
}

/**
 * Library-owned zod registry. The walker reads metadata from here to derive
 * the IR — kind, storage, relation refs, unique/indexed flags. Helpers below
 * write to it; users may also `schema.register(bcmsRegistry, {...})` directly.
 */
export const bcmsRegistry = z.registry<BcmsFieldMeta>();
