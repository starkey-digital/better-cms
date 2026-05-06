import type { CollectionDef, FieldDef, SchemaIR } from '@better-cms/core';

const RESERVED = new Set(['order', 'group', 'select', 'from', 'where']);

export function tableName(name: string, def: CollectionDef): string {
	return def.tableName ?? name;
}

function sqlColumnType(field: FieldDef): string {
	switch (field.columnType) {
		case 'integer':
			return 'INTEGER';
		case 'real':
			return 'REAL';
		case 'blob':
			return 'BLOB';
		default:
			return 'TEXT';
	}
}

export function ddlForCollection(name: string, def: CollectionDef): string[] {
	const tn = tableName(name, def);
	const cols: string[] = [];
	for (const [field, fd] of Object.entries(def.fields)) {
		const safe = quoteIdent(field);
		const type = sqlColumnType(fd);
		const pk = field === 'id' ? ' PRIMARY KEY' : '';
		const unique = fd.unique && field !== 'id' ? ' UNIQUE' : '';
		cols.push(`${safe} ${type}${pk}${unique}`);
	}
	const stmts = [`CREATE TABLE IF NOT EXISTS ${quoteIdent(tn)} (\n  ${cols.join(',\n  ')}\n)`];
	for (const idx of def.indexes ?? []) {
		const idxName = idx.name ?? `idx_${tn}_${idx.fields.join('_')}`;
		const u = idx.unique ? 'UNIQUE ' : '';
		stmts.push(
			`CREATE ${u}INDEX IF NOT EXISTS ${quoteIdent(idxName)} ON ${quoteIdent(tn)} (${idx.fields
				.map(quoteIdent)
				.join(', ')})`,
		);
	}
	for (const [field, fd] of Object.entries(def.fields)) {
		if (fd.indexed && !def.indexes?.some((i) => i.fields.length === 1 && i.fields[0] === field)) {
			stmts.push(
				`CREATE INDEX IF NOT EXISTS ${quoteIdent(`idx_${tn}_${field}`)} ON ${quoteIdent(
					tn,
				)} (${quoteIdent(field)})`,
			);
		}
	}
	return stmts;
}

export function ddlForSchema(schema: SchemaIR): string[] {
	return Object.entries(schema.collections).flatMap(([n, d]) => ddlForCollection(n, d));
}

export function quoteIdent(name: string): string {
	if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name) || RESERVED.has(name.toLowerCase())) {
		return `"${name.replace(/"/g, '""')}"`;
	}
	return name;
}

export interface CompiledWhere {
	sql: string;
	args: unknown[];
}

const OPS: Record<string, string> = {
	eq: '=',
	ne: '!=',
	gt: '>',
	gte: '>=',
	lt: '<',
	lte: '<=',
	like: 'LIKE',
};

export function compileWhere(where: Record<string, unknown> | undefined): CompiledWhere {
	if (!where || Object.keys(where).length === 0) return { sql: '', args: [] };
	const parts: string[] = [];
	const args: unknown[] = [];
	for (const [field, val] of Object.entries(where)) {
		if (val == null) {
			parts.push(`${quoteIdent(field)} IS NULL`);
			continue;
		}
		if (typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date)) {
			const v = val as Record<string, unknown>;
			if ('in' in v && Array.isArray(v.in)) {
				const placeholders = v.in.map(() => '?').join(', ');
				parts.push(`${quoteIdent(field)} IN (${placeholders})`);
				args.push(...v.in);
				continue;
			}
			for (const [opName, opVal] of Object.entries(v)) {
				const op = OPS[opName];
				if (!op) throw new Error(`unknown where op "${opName}"`);
				parts.push(`${quoteIdent(field)} ${op} ?`);
				args.push(opVal);
			}
			continue;
		}
		parts.push(`${quoteIdent(field)} = ?`);
		args.push(val);
	}
	return { sql: ` WHERE ${parts.join(' AND ')}`, args };
}
