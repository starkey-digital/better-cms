import type { CollectionDef, FieldDef, SchemaIR } from '@better-cms/core';
import type { Client } from '@libsql/client';
import {
	addColumnSql,
	createTableSql,
	expectedColumnType,
	indexSql,
	quoteIdent,
	tableName,
	uniqueIndexSql,
} from './sql.js';

async function existingColumns(client: Client, tn: string): Promise<Map<string, string>> {
	const res = await client.execute(`PRAGMA table_info(${quoteIdent(tn)})`);
	return new Map(res.rows.map((r) => [String(r.name), String(r.type ?? '').toUpperCase()]));
}

/** Another cold start may add the same column between our PRAGMA and our ALTER; that is success, not failure. */
function isDuplicateColumn(e: unknown): boolean {
	return /duplicate column name/i.test((e as Error)?.message ?? '');
}

/**
 * Create missing tables, then add any columns the schema gained since the
 * table was created. Never drops or alters an existing column — a type
 * mismatch only warns, because rewriting data on boot is not something a CMS
 * should do unasked. Safe to run concurrently and repeatedly.
 */
export async function migrateSchema(client: Client, schema: SchemaIR): Promise<void> {
	for (const [name, def] of Object.entries(schema.collections) as [string, CollectionDef][]) {
		const tn = tableName(name, def);
		await client.execute(createTableSql(name, def));
		const existing = await existingColumns(client, tn);

		for (const [field, fd] of Object.entries(def.fields) as [string, FieldDef][]) {
			const actual = existing.get(field);
			if (actual === undefined) {
				try {
					await client.execute(addColumnSql(name, def, field));
				} catch (e) {
					if (!isDuplicateColumn(e)) throw e;
				}
				if (fd.unique) await client.execute(uniqueIndexSql(name, def, field));
			} else if (actual && actual !== expectedColumnType(fd)) {
				console.warn(
					`[better-cms] ${tn}.${field} is ${actual} in the database but the schema expects ${expectedColumnType(fd)}. Leaving it unchanged; migrate it manually if needed.`,
				);
			}
		}

		for (const stmt of indexSql(name, def)) await client.execute(stmt);
	}
}
