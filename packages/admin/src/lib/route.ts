import type { CmsMeta } from '@better-cms/sveltekit';

export type Route =
	| { kind: 'home' }
	| { kind: 'list'; name: string }
	| { kind: 'new'; name: string }
	| { kind: 'edit'; name: string; id: string }
	| { kind: 'singleton'; name: string };

export function parseRoute(hash: string, meta: CmsMeta | null): Route {
	if (!meta) return { kind: 'home' };
	const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
	const name = parts[0];
	const def = name ? meta.collections[name] : undefined;
	if (!name || !def) return { kind: 'home' };
	if (def.kind === 'singleton') return { kind: 'singleton', name };
	if (parts.length === 1) return { kind: 'list', name };
	if (parts[1] === 'new') return { kind: 'new', name };
	return { kind: 'edit', name, id: parts[1]! };
}
