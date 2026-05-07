import type {
	ContentStore,
	FindManyQuery,
	Row,
	SchemaIR,
	WhereClause,
} from '@better-cms/core';
import { errors } from '@better-cms/core';
import { type Client, createClient, type InValue } from '@libsql/client';
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
	const client =
		opts.client ?? createClient({ url: opts.url, authToken: opts.authToken });
	let schema: SchemaIR | null = null;

	function defOf(collection: string) {
		const def = schema?.collections[collection];
		if (!def) throw errors.notFound(`collection "${collection}"`);
		return def;
	}

	return {
		async init(s) {
			schema = s;
			for (const stmt of ddlForSchema(s)) {
				await client.execute(stmt);
			}
		},

		async create(collection, data) {
			const def = defOf(collection);
			const tn = tableName(collection, def);
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
			const def = defOf(collection);
			const tn = tableName(collection, def);
			const cols = Object.keys(data);
			if (cols.length === 0) return (await this.findOne(collection, where)) ?? {};
			const setClause = cols.map((c) => `${quoteIdent(c)} = ?`).join(', ');
			const w = compileWhere(where as Record<string, unknown>);
			await client.execute({
				sql: `UPDATE ${quoteIdent(tn)} SET ${setClause}${w.sql}`,
				args: [...cols.map((c) => data[c] as InValue), ...(w.args as InValue[])],
			});
			return (await this.findOne(collection, where)) ?? data;
		},

		async delete(collection, where) {
			const def = defOf(collection);
			const tn = tableName(collection, def);
			const w = compileWhere(where as Record<string, unknown>);
			const res = await client.execute({
				sql: `DELETE FROM ${quoteIdent(tn)}${w.sql}`,
				args: w.args as InValue[],
			});
			return Number(res.rowsAffected ?? 0);
		},

		async findOne(collection, where, select) {
			const def = defOf(collection);
			const tn = tableName(collection, def);
			const w = compileWhere(where as Record<string, unknown>);
			const cols = select?.length ? select.map(quoteIdent).join(', ') : '*';
			const res = await client.execute({
				sql: `SELECT ${cols} FROM ${quoteIdent(tn)}${w.sql} LIMIT 1`,
				args: w.args as InValue[],
			});
			return (res.rows[0] as unknown as Row) ?? null;
		},

		async findMany(collection, query: FindManyQuery = {}) {
			const def = defOf(collection);
			const tn = tableName(collection, def);
			const w = compileWhere(query.where as Record<string, unknown> | undefined);
			const cols = query.select?.length ? query.select.map(quoteIdent).join(', ') : '*';
			const orderBy = query.orderBy?.length
				? ` ORDER BY ${query.orderBy
						.map((o) => `${quoteIdent(o.field)} ${o.dir === 'desc' ? 'DESC' : 'ASC'}`)
						.join(', ')}`
				: '';
			const limit = query.limit != null ? ` LIMIT ${Number(query.limit)}` : '';
			const offset = query.offset != null ? ` OFFSET ${Number(query.offset)}` : '';
			const res = await client.execute({
				sql: `SELECT ${cols} FROM ${quoteIdent(tn)}${w.sql}${orderBy}${limit}${offset}`,
				args: w.args as InValue[],
			});
			return res.rows as unknown as Row[];
		},

		async count(collection, where?: WhereClause) {
			const def = defOf(collection);
			const tn = tableName(collection, def);
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
