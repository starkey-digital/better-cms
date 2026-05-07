import type { CMSConfig, CMSContext } from '../config.js';
import { getCMSTables } from '../ir/tables.js';
import { applyOps } from '../ops/apply.js';
import { opToEventType } from '../ops/types.js';
import type { CMSOp } from '../ops/types.js';
import type { PluginEndpoint } from '../plugin/types.js';
import { CMSError, errors } from '../util/result.js';
import { inMemoryTransport, type LiveTransport, sseResponse } from './live.js';

const LIST_RE = /^\/collections\/([^/]+)$/;
const ONE_RE = /^\/collections\/([^/]+)\/([^/]+)$/;
const SINGLETON_RE = /^\/singletons\/([^/]+)$/;
type RouteKey = `${string} ${string}`;
export const SINGLETON_ID = 'default';

export interface CMSInstance {
	context: CMSContext;
	handler: (request: Request) => Promise<Response>;
	live: LiveTransport;
	close(): Promise<void>;
}

export interface CreateCMSOpts {
	live?: LiveTransport;
}

/**
 * Build the runtime from a config. Returns:
 *  - context (schema, store, media) for direct server-side calls (SSR loaders)
 *  - handler (Request→Response) for the HTTP boundary
 *  - live transport for SSE broadcasts
 */
export async function createCMS(config: CMSConfig, opts: CreateCMSOpts = {}): Promise<CMSInstance> {
	const schema = getCMSTables(config);
	const live = opts.live ?? inMemoryTransport();
	const context: CMSContext = {
		config,
		schema,
		store: config.adapter,
		media: config.media,
	};

	if (config.adapter.init) await config.adapter.init(schema);
	const pluginRoutes = new Map<RouteKey, PluginEndpoint>();
	for (const plugin of config.plugins ?? []) {
		if (plugin.init) await plugin.init(context);
		for (const ep of plugin.endpoints ?? []) {
			pluginRoutes.set(`${ep.method} ${ep.path}`, ep);
		}
	}

	const basePath = (config.basePath ?? '/api/cms').replace(/\/$/, '');

	async function handler(request: Request): Promise<Response> {
		const url = new URL(request.url);
		if (!url.pathname.startsWith(basePath)) {
			return new Response('Not handled', { status: 404 });
		}
		const sub = url.pathname.slice(basePath.length) || '/';

		try {
			const user = config.auth ? await config.auth.getUser(request) : null;

			if (sub === '/_live' && request.method === 'GET') {
				return sseResponse(live);
			}

			if (sub === '/ops' && request.method === 'POST') {
				if (!user) throw errors.unauthorized();
				const body = (await request.json()) as { ops: CMSOp[] };
				const results = await applyOps(body.ops ?? [], { store: context.store, schema });
				for (const r of results) {
					if (!r.ok) continue;
					await live.publish({
						type: opToEventType(r.op),
						collection: r.op.collection,
						id: r.op.id ?? (r.row?.id as string | undefined),
						at: Date.now(),
					});
				}
				return Response.json({ results });
			}

			if (request.method === 'GET') {
				const listMatch = LIST_RE.exec(sub);
				if (listMatch) {
					const name = listMatch[1]!;
					const def = schema.collections[name];
					if (!def) throw errors.notFound(`collection "${name}"`);
					if (def.kind === 'singleton') throw errors.badRequest(`${name} is a singleton`);
					const limit = Number(url.searchParams.get('limit') ?? '50');
					const offset = Number(url.searchParams.get('offset') ?? '0');
					const rows = await context.store.findMany(name, { limit, offset });
					return Response.json({ rows });
				}
				const oneMatch = ONE_RE.exec(sub);
				if (oneMatch) {
					const name = oneMatch[1]!;
					const id = oneMatch[2]!;
					const row = await context.store.findOne(name, { id });
					if (!row) throw errors.notFound(`${name}#${id}`);
					return Response.json({ row });
				}
				const singletonMatch = SINGLETON_RE.exec(sub);
				if (singletonMatch) {
					const name = singletonMatch[1]!;
					const def = schema.collections[name];
					if (!def || def.kind !== 'singleton')
						throw errors.notFound(`singleton "${name}"`);
					const row = await context.store.findOne(name, { id: SINGLETON_ID });
					return Response.json({ row });
				}
			}

			if (request.method === 'PUT') {
				const singletonMatch = SINGLETON_RE.exec(sub);
				if (singletonMatch) {
					if (!user) throw errors.unauthorized();
					const name = singletonMatch[1]!;
					const def = schema.collections[name];
					if (!def || def.kind !== 'singleton')
						throw errors.notFound(`singleton "${name}"`);
					const body = (await request.json()) as Record<string, unknown>;
					const existing = await context.store.findOne(name, { id: SINGLETON_ID });
					const op: CMSOp = existing
						? { op: 'set', collection: name, id: SINGLETON_ID, data: body }
						: { op: 'create', collection: name, data: { ...body, id: SINGLETON_ID } };
					const [res] = await applyOps([op], { store: context.store, schema });
					if (!res?.ok)
						throw errors.validation(res?.error?.message ?? 'singleton write failed');
					await live.publish({
						type: opToEventType(res.op),
						collection: name,
						id: SINGLETON_ID,
						at: Date.now(),
					});
					return Response.json({ row: res.row });
				}
			}

			const ep = pluginRoutes.get(`${request.method} ${sub}`);
			if (ep) return ep.handler(request, context);

			return new Response('Not found', { status: 404 });
		} catch (e) {
			if (e instanceof CMSError) {
				return Response.json(
					{ error: { code: e.code, message: e.message, details: e.details } },
					{ status: e.status },
				);
			}
			return Response.json(
				{ error: { code: 'INTERNAL', message: (e as Error).message ?? 'unknown' } },
				{ status: 500 },
			);
		}
	}

	return {
		context,
		handler,
		live,
		async close() {
			await context.store.close?.();
			await context.media?.close?.();
		},
	};
}
