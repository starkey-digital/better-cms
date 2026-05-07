import type {
	CmsConfig,
	CmsOp,
	CollectionsRecord,
	CreateCmsOpts,
	InferRows,
	OpResult,
	SchemaIR,
} from '@better-cms/core';
import { applyOps, opToEventType } from '@better-cms/core';
import { cms, serverApi } from './server.js';

/**
 * Helpers for SvelteKit remote functions (`*.remote.ts`). Skip the HTTP handler — call
 * adapter directly so the request stays in-process (better latency, typed end-to-end).
 *
 *   // src/lib/cms.remote.ts
 *   import { query, command } from '$app/server';
 *   import { listCollection, runOps } from '@better-cms/sveltekit/remote';
 *   import config from '$lib/cms.config';
 *
 *   export const posts = query(async () => listCollection(config, 'posts'));
 *   export const save = command(async (ops) => runOps(config, ops));
 */

export async function listCollection<C extends CollectionsRecord, K extends keyof C>(
	config: CmsConfig<C>,
	collection: K,
	opts?: { limit?: number; offset?: number; where?: Record<string, unknown> },
	cmsOpts?: CreateCmsOpts,
): Promise<InferRows<SchemaIR<C>>[K][]> {
	const instance = await cms(config, cmsOpts);
	return serverApi(instance.context as never).list(collection as never, opts) as Promise<never>;
}

export async function getRecord<C extends CollectionsRecord, K extends keyof C>(
	config: CmsConfig<C>,
	collection: K,
	id: string,
	cmsOpts?: CreateCmsOpts,
): Promise<InferRows<SchemaIR<C>>[K] | null> {
	const instance = await cms(config, cmsOpts);
	return serverApi(instance.context as never).find(collection as never, id) as Promise<never>;
}

export async function runOps<C extends CollectionsRecord>(
	config: CmsConfig<C>,
	ops: CmsOp[],
	cmsOpts?: CreateCmsOpts,
): Promise<OpResult[]> {
	const instance = await cms(config, cmsOpts);
	const results = await applyOps(ops, {
		store: instance.context.store,
		schema: instance.context.schema,
	});
	for (const r of results) {
		if (!r.ok) continue;
		await instance.live.publish({
			type: opToEventType(r.op),
			collection: r.op.collection,
			id: r.op.id ?? (r.row?.id as string | undefined),
			at: Date.now(),
		});
	}
	return results;
}

export async function uploadMedia<C extends CollectionsRecord>(
	config: CmsConfig<C>,
	body: Blob | ArrayBuffer | Uint8Array,
	opts: { folder?: string; mime?: string; key?: string } = {},
	cmsOpts?: CreateCmsOpts,
) {
	const instance = await cms(config, cmsOpts);
	if (!instance.context.media) {
		throw new Error('[better-cms] media store not configured');
	}
	return instance.context.media.put(body, opts);
}
