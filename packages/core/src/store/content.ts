import type { SchemaIR } from '../ir/types.js';

export type Row = Record<string, unknown>;

export type WhereOp =
	| { eq: unknown }
	| { ne: unknown }
	| { in: unknown[] }
	| { gt: unknown }
	| { gte: unknown }
	| { lt: unknown }
	| { lte: unknown }
	| { like: string };

export type WhereClause = Row | { [field: string]: unknown | WhereOp };

export interface FindManyQuery {
	where?: WhereClause;
	orderBy?: { field: string; dir?: 'asc' | 'desc' }[];
	limit?: number;
	offset?: number;
	select?: string[];
}

/**
 * Storage adapter contract. Implementers translate this into Drizzle, raw libsql, prisma, etc.
 *
 * Rows are passed in already-serialized for storage:
 *  - column-storage fields are scalar values
 *  - json-storage fields arrive as JS values (adapter is responsible for JSON.stringify on write
 *    and JSON.parse on read).
 */
export interface ContentStore {
	/**
	 * Optional schema-aware setup (table creation for adapters that own DDL,
	 * such as `adapter-libsql`). Drizzle adapter is a no-op — user runs `drizzle-kit push`.
	 */
	init?(schema: SchemaIR): Promise<void>;

	create(collection: string, data: Row): Promise<Row>;
	update(collection: string, where: WhereClause, data: Row): Promise<Row>;
	delete(collection: string, where: WhereClause): Promise<number>;

	findOne(collection: string, where: WhereClause, select?: string[]): Promise<Row | null>;
	findMany(collection: string, query?: FindManyQuery): Promise<Row[]>;
	count(collection: string, where?: WhereClause): Promise<number>;

	transaction?<T>(fn: (tx: ContentStore) => Promise<T>): Promise<T>;

	/** Optional: lifecycle close for connection cleanup. */
	close?(): Promise<void> | void;
}
