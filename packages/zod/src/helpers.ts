import { z } from 'zod';
import { type CollectionRef, bcmsRegistry } from './registry.js';

/**
 * Rich text content — stored as a string (markdown / HTML / ProseMirror JSON
 * stringified — depends on the editor your front end mounts). Walker emits
 * `kind: 'richText'`, `storage: 'json'` so the admin UI picks the rich-text
 * editor widget. Chain `.optional()` / `.min(1)` / `.refine(...)` as you
 * would any other `z.string()`.
 */
export const richText = () =>
	z.string().register(bcmsRegistry, { kind: 'richText', storage: 'json' });

const imageRefShape = {
	key: z.string(),
	url: z.string(),
	mime: z.string().optional(),
	size: z.number().optional(),
	width: z.number().optional(),
	height: z.number().optional(),
	alt: z.string().optional(),
};

/** Reference to an uploaded image — `{ key, url, mime?, size?, width?, height?, alt? }`. */
export const image = () =>
	z.object(imageRefShape).register(bcmsRegistry, { kind: 'image', storage: 'json' });

const fileRefShape = {
	key: z.string(),
	url: z.string(),
	mime: z.string().optional(),
	size: z.number().optional(),
	name: z.string().optional(),
};

/** Reference to an uploaded file — `{ key, url, mime?, size?, name? }`. */
export const file = () =>
	z.object(fileRefShape).register(bcmsRegistry, { kind: 'file', storage: 'json' });

export interface SlugOpts {
	/** Source field for auto-generation in the admin UI. */
	from?: string;
	/** Override the default pattern (kebab-case lowercase). */
	pattern?: RegExp;
}

/** URL-friendly slug — lowercase letters, digits and dashes by default. */
export function slug(opts: SlugOpts = {}) {
	const re = opts.pattern ?? /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
	return z
		.string()
		.regex(re, 'must be lowercase letters, digits and dashes')
		.register(bcmsRegistry, { kind: 'slug' });
}

export interface RelationOpts<M extends boolean = false> {
	many?: M;
	onDelete?: 'cascade' | 'set null' | 'restrict';
}

/**
 * Type-safe relation to another collection. Pass the `CollectionDef` directly
 * (or a thunk for forward / circular refs). `defineCMS()` resolves the ref to
 * the registered name at startup; typos are TS errors.
 */
export function relation<M extends boolean = false>(
	target: CollectionRef,
	opts: RelationOpts<M> = {} as RelationOpts<M>,
) {
	const many = (opts.many ?? false) as boolean;
	const base = many ? z.array(z.string()) : z.string();
	return base.register(bcmsRegistry, {
		kind: 'relation',
		relation: { target, many, onDelete: opts.onDelete ?? 'set null' },
	});
}

/** Mark a field as `UNIQUE` at the column level. */
export function unique<T extends z.ZodType>(s: T): T {
	bcmsRegistry.add(s, { unique: true });
	return s;
}

/** Mark a field as indexed (single-column index). */
export function indexed<T extends z.ZodType>(s: T): T {
	bcmsRegistry.add(s, { indexed: true });
	return s;
}
