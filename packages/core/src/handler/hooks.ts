import type { CmsConfig } from '../config.js';
import type { HookContext, HookFn, HookVerb, HookWhen, HooksIR } from '../ir/types.js';

const KEYS: Record<`${HookWhen}-${HookVerb}`, keyof HooksIR> = {
	'before-create': 'beforeCreate',
	'after-create': 'afterCreate',
	'before-update': 'beforeUpdate',
	'after-update': 'afterUpdate',
	'before-delete': 'beforeDelete',
	'after-delete': 'afterDelete',
};

function asArray<T>(v: T | T[] | undefined): T[] {
	if (v == null) return [];
	return Array.isArray(v) ? v : [v];
}

/**
 * Run lifecycle hooks for a verb in chain order: global → collection. Hooks
 * run sequentially; a throw aborts the chain (and the surrounding op).
 */
export async function runHooks(
	config: CmsConfig<any, any> | undefined,
	collectionName: string,
	when: HookWhen,
	verb: HookVerb,
	hc: HookContext,
): Promise<void> {
	if (!config) return;
	const key = KEYS[`${when}-${verb}` as const];
	const col = config.collections[collectionName];
	const fns: HookFn[] = [
		...asArray(config.hooks?.[key] as HookFn | HookFn[] | undefined),
		...asArray(col?.hooks?.[key] as HookFn | HookFn[] | undefined),
	];
	for (const fn of fns) await fn(hc);
}
