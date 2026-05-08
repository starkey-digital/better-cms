import type { FieldDef } from '../ir/types.js';

export function slugify(input: string): string {
	return input
		.toLowerCase()
		.normalize('NFKD')
		.replace(/\p{M}/gu, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 200);
}

/** First field with `kind: 'slug'`, or undefined. Used by client + server `get(idOrSlug)` to fall back from id to slug lookup. */
export function detectSlugField(
	fields: Record<string, { kind: string } | FieldDef>,
): string | undefined {
	for (const [name, field] of Object.entries(fields)) {
		if (field?.kind === 'slug') return name;
	}
	return undefined;
}
