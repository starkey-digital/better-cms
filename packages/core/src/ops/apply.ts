import type { CmsConfig } from '../config.js';
import { checkAccess } from '../handler/access.js';
import { runHooks } from '../handler/hooks.js';
import type { CollectionDef, HookVerb, SchemaIR } from '../ir/types.js';
import type { ContentStore } from '../store/content.js';
import { generateId } from '../util/id.js';
import { CmsError, errors } from '../util/result.js';
import type { StandardSchemaV1 } from '../util/standard-schema.js';
import { deserializeRow, serializeRow } from '../util/validate.js';
import type { CmsOp, OpResult } from './types.js';

export interface ApplyDeps {
	store: ContentStore;
	schema: SchemaIR;
	/** When set, access checks + lifecycle hooks run for each op. Bare adapter calls skip these. */
	config?: CmsConfig<any, any>;
	/** Request-scoped context resolved by `auth.context(request)`. Threaded into access fns + hooks. */
	ctx?: unknown;
}

function opVerb(op: CmsOp): HookVerb {
	if (op.op === 'create') return 'create';
	if (op.op === 'remove' && !op.path) return 'delete';
	return 'update';
}

/** Apply a single op. Validates via Standard Schema, serializes, persists. */
export async function applyOp(op: CmsOp, deps: ApplyDeps): Promise<OpResult> {
	try {
		const def = deps.schema.collections[op.collection];
		if (!def) throw errors.notFound(`collection "${op.collection}"`);

		const verb = opVerb(op);
		const prev =
			verb === 'create' || op.op === 'create'
				? undefined
				: ((await deps.store.findOne(op.collection, { id: op.id! })) ?? undefined);

		if (verb !== 'create' && !prev) {
			throw errors.notFound(`${op.collection}#${op.id}`);
		}

		const allowed = await checkAccess(
			deps.config,
			op.collection,
			verb,
			deps.ctx,
			prev ? deserializeRow(def, prev) : undefined,
		);
		if (!allowed) throw errors.forbidden(`${op.collection}.${verb} denied`);

		const now = Date.now();
		const hookBase = {
			ctx: deps.ctx,
			collection: op.collection,
			verb,
			id: op.id,
			prev: prev ? deserializeRow(def, prev) : undefined,
		};

		if (op.op === 'create') {
			const id = (op.data.id as string | undefined) ?? generateId();
			const validated = await validateAgainst(def, 'create', op.data, op.collection);
			await runHooks(deps.config, op.collection, 'before', 'create', {
				...hookBase,
				id,
				data: validated,
			});
			const row = await deps.store.create(
				op.collection,
				serializeRow(def, {
					...validated,
					id,
					createdAt: (op.data.createdAt as number | undefined) ?? now,
					updatedAt: (op.data.updatedAt as number | undefined) ?? now,
				}),
			);
			const result = deserializeRow(def, row);
			await runHooks(deps.config, op.collection, 'after', 'create', {
				...hookBase,
				id,
				data: validated,
				result,
			});
			return { op, ok: true, row: result };
		}

		if (op.op === 'set') {
			const validated = await validateAgainst(
				def,
				'update',
				{ id: op.id, ...op.data },
				op.collection,
			);
			const { id: _id, ...patch } = validated;
			await runHooks(deps.config, op.collection, 'before', 'update', {
				...hookBase,
				data: validated,
			});
			const row = await deps.store.update(
				op.collection,
				{ id: op.id },
				serializeRow(def, { ...patch, updatedAt: now }),
			);
			const result = deserializeRow(def, row);
			await runHooks(deps.config, op.collection, 'after', 'update', {
				...hookBase,
				data: validated,
				result,
			});
			return { op, ok: true, row: result };
		}

		if (op.op === 'remove' && !op.path) {
			await runHooks(deps.config, op.collection, 'before', 'delete', hookBase);
			await deps.store.delete(op.collection, { id: op.id });
			await runHooks(deps.config, op.collection, 'after', 'delete', hookBase);
			return { op, ok: true };
		}

		if (op.op === 'patch' || op.op === 'append' || op.op === 'remove' || op.op === 'move') {
			const merged = applyJsonOp(deserializeRow(def, prev!), op);
			merged.updatedAt = now;
			await runHooks(deps.config, op.collection, 'before', 'update', {
				...hookBase,
				data: merged,
			});
			const row = await deps.store.update(op.collection, { id: op.id }, serializeRow(def, merged));
			const result = deserializeRow(def, row);
			await runHooks(deps.config, op.collection, 'after', 'update', {
				...hookBase,
				data: merged,
				result,
			});
			return { op, ok: true, row: result };
		}

		throw errors.badRequest('unsupported op');
	} catch (e) {
		const cms =
			e instanceof CmsError
				? e
				: new CmsError((e as Error).message ?? 'unknown error', 'INTERNAL', 500);
		return { op, ok: false, error: { code: cms.code, message: cms.message } };
	}
}

export async function applyOps(ops: CmsOp[], deps: ApplyDeps): Promise<OpResult[]> {
	const results: OpResult[] = [];
	for (const op of ops) results.push(await applyOp(op, deps));
	return results;
}

async function validateAgainst(
	def: CollectionDef,
	variant: 'create' | 'update' | 'full',
	input: Record<string, unknown>,
	collection: string,
): Promise<Record<string, unknown>> {
	const schema = def.schemas[variant];
	const result = await schema['~standard'].validate(input);
	if (result.issues) throw errors.validation(formatIssues(collection, result.issues));
	return (result.value ?? input) as Record<string, unknown>;
}

function formatIssues(collection: string, issues: ReadonlyArray<StandardSchemaV1.Issue>): string {
	return issues
		.map((i) => {
			const path = (i.path ?? [])
				.map((p) => (typeof p === 'object' && p !== null && 'key' in p ? String(p.key) : String(p)))
				.join('.');
			return path ? `${collection}.${path}: ${i.message}` : `${collection}: ${i.message}`;
		})
		.join('; ');
}

function applyJsonOp(
	row: Record<string, unknown>,
	op: Extract<CmsOp, { op: 'patch' | 'append' | 'remove' | 'move' }>,
): Record<string, unknown> {
	const out = { ...row };
	const path = 'path' in op ? op.path : undefined;
	const segs = (path ?? '').split('.').filter(Boolean);

	if (op.op === 'patch') return setIn(out, segs, op.value);
	if (op.op === 'append') {
		const arr = (getIn(out, segs) as unknown[] | undefined) ?? [];
		return setIn(out, segs, [...arr, op.value]);
	}
	if (op.op === 'remove' && segs.length) {
		if (typeof op.index === 'number') {
			const arr = (getIn(out, segs) as unknown[] | undefined) ?? [];
			return setIn(
				out,
				segs,
				arr.filter((_, i) => i !== op.index),
			);
		}
		return unsetIn(out, segs);
	}
	if (op.op === 'move') {
		const arr = ((getIn(out, segs) as unknown[] | undefined) ?? []).slice();
		const [item] = arr.splice(op.from, 1);
		arr.splice(op.to, 0, item);
		return setIn(out, segs, arr);
	}
	return out;
}

function getIn(obj: Record<string, unknown>, segs: string[]): unknown {
	let cur: unknown = obj;
	for (const s of segs) {
		if (cur == null || typeof cur !== 'object') return undefined;
		cur = (cur as Record<string, unknown>)[s];
	}
	return cur;
}

function setIn(
	obj: Record<string, unknown>,
	segs: string[],
	value: unknown,
): Record<string, unknown> {
	if (!segs.length) return obj;
	const [head, ...rest] = segs as [string, ...string[]];
	const next = { ...obj };
	if (rest.length === 0) {
		next[head] = value;
	} else {
		const child = (next[head] as Record<string, unknown> | undefined) ?? {};
		next[head] = setIn(child, rest, value);
	}
	return next;
}

function unsetIn(obj: Record<string, unknown>, segs: string[]): Record<string, unknown> {
	if (!segs.length) return obj;
	const [head, ...rest] = segs as [string, ...string[]];
	const next = { ...obj };
	if (rest.length === 0) {
		delete next[head];
	} else if (next[head] && typeof next[head] === 'object') {
		next[head] = unsetIn(next[head] as Record<string, unknown>, rest);
	}
	return next;
}
