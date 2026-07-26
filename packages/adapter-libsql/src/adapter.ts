import type {
	CollectionDef,
	ContentStore,
	FindManyQuery,
	Row,
	SchemaIR,
	WhereClause,
} from '@better-cms/core';
import { errors } from '@better-cms/core';
import { type Client, type InValue, createClient } from '@libsql/client';
import { compileWhere, ddlForSchema, quoteIdent, tableName } from './sql.js';

export interface LibsqlAdapterOpts {
	url: string;
	authToken?: string;
	client?: Client;
}

/**
 * Direct libsql ContentStore. Owns DDL — `init(schema)` runs CREATE TABLE IF NOT EXISTS.
 * For users who don't want a drizzle build step.
 */
export function libsqlAdapter(opts: LibsqlAdapterOpts): ContentStore {
	const client = opts.client ?? createClient({ url: opts.url, authToken: opts.authToken });
	let schema: SchemaIR | null = null;

	function defOf(collection: string): CollectionDef {
		if (!schema) throw new Error('libsqlAdapter: init() has not been called');
		const def = schema.collections[collection];
		if (!def) throw errors.notFound(`collection "${collection}"`);
		return def;
	}

	function tableOf(collection: string): { def: CollectionDef; tn: string } {
		const def = defOf(collection);
		return { def, tn: tableName(collection, def) };
	}

	async function _findOneRow(
		collection: string,
		where: WhereClause | undefined,
		select?: string[],
	): Promise<Row | null> {
		const { tn } = tableOf(collection);
		const w = compileWhere(where as Record<string, unknown>);
		const cols = select?.length ? select.map(quoteIdent).join(', ') : '*';
		const res = await client.execute({
			sql: `SELECT ${cols} FROM ${quoteIdent(tn)}${w.sql} LIMIT 1`,
			args: w.args as InValue[],
		});
		return (res.rows[0] as unknown as Row) ?? null;
	}

	return {
		async init(s) {
			schema = s;
			for (const stmt of ddlForSchema(s)) {
				await client.execute(stmt);
			}
		},

		async create(collection, data) {
			const { tn } = tableOf(collection);
			const cols = Object.keys(data);
			const placeholders = cols.map(() => '?').join(', ');
			await client.execute({
				sql: `INSERT INTO ${quoteIdent(tn)} (${cols
					.map(quoteIdent)
					.join(', ')}) VALUES (${placeholders})`,
				args: cols.map((c) => data[c] as InValue),
			});
			return data;
		},

		async update(collection, where, data) {
			const { tn } = tableOf(collection);
			const cols = Object.keys(data);
			if (cols.length === 0) return (await _findOneRow(collection, where)) ?? {};
			const setClause = cols.map((c) => `${quoteIdent(c)} = ?`).join(', ');
			const w = compileWhere(where as Record<string, unknown>);
			await client.execute({
				sql: `UPDATE ${quoteIdent(tn)} SET ${setClause}${w.sql}`,
				args: [...cols.map((c) => data[c] as InValue), ...(w.args as InValue[])],
			});
			return (await _findOneRow(collection, where)) ?? data;
		},

		async delete(collection, where) {
			const { tn } = tableOf(collection);
			const w = compileWhere(where as Record<string, unknown>);
			const res = await client.execute({
				sql: `DELETE FROM ${quoteIdent(tn)}${w.sql}`,
				args: w.args as InValue[],
			});
			return Number(res.rowsAffected ?? 0);
		},

		async findOne(collection, where, select) {
			return _findOneRow(collection, where, select);
		},

		async findMany(collection, query: FindManyQuery = {}) {
			const { def, tn } = tableOf(collection);
			const w = compileWhere(query.where as Record<string, unknown> | undefined);
			const cols = query.select?.length ? query.select.map(quoteIdent).join(', ') : '*';
			const orderBy = query.orderBy?.length
				? ` ORDER BY ${query.orderBy
						.map((o) => {
							const field = o.field;
							if (!(field in def.fields)) throw new Error(`unknown field "${field}" in orderBy`);
							const dir = o.dir === 'desc' ? 'DESC' : 'ASC';
							return `${quoteIdent(field)} ${dir}`;
						})
						.join(', ')}`
				: '';
			const limit =
				query.limit != null
					? Number.isSafeInteger(query.limit) && query.limit >= 0
						? ` LIMIT ${query.limit}`
						: (() => {
								throw new Error(`invalid limit: ${query.limit}`);
							})()
					: '';
			const offset =
				query.offset != null
					? Number.isSafeInteger(query.offset) && query.offset >= 0
						? ` OFFSET ${query.offset}`
						: (() => {
								throw new Error(`invalid offset: ${query.offset}`);
							})()
					: '';
			const res = await client.execute({
				sql: `SELECT ${cols} FROM ${quoteIdent(tn)}${w.sql}${orderBy}${limit}${offset}`,
				args: w.args as InValue[],
			});
			return res.rows as unknown as Row[];
		},

		async count(collection, where?: WhereClause) {
			const { tn } = tableOf(collection);
			const w = compileWhere(where as Record<string, unknown> | undefined);
			const res = await client.execute({
				sql: `SELECT COUNT(*) as c FROM ${quoteIdent(tn)}${w.sql}`,
				args: w.args as InValue[],
			});
			return Number((res.rows[0] as unknown as { c: number } | undefined)?.c ?? 0);
		},

		async close() {
			await client.close?.();
		},
	};
}
