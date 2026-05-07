import { libsqlAdapter } from '@better-cms/adapter-libsql';
import type { ContentStore, SchemaIR } from '@better-cms/core';
import type { Client } from '@libsql/client';

export interface DrizzleAdapterOpts<DB> {
	db: DB;
	client: Client;
	/** Skip CREATE TABLE in init(); drizzle-kit owns DDL. Defaults true. */
	skipDDL?: boolean;
}

export interface DrizzleAdapter<DB> extends ContentStore {
	readonly db: DB;
}

/**
 * Drizzle ContentStore. Delegates SQL execution to the libsql adapter and exposes the drizzle `db`
 * for typed queries elsewhere. `init()` no-ops when `skipDDL` (default) — drizzle-kit owns DDL.
 */
export function drizzleAdapter<DB>(opts: DrizzleAdapterOpts<DB>): DrizzleAdapter<DB> {
	const inner = libsqlAdapter({ url: '', client: opts.client });
	const skipDDL = opts.skipDDL ?? true;
	return {
		...inner,
		db: opts.db,
		async init(schema: SchemaIR) {
			if (skipDDL) return;
			await inner.init?.(schema);
		},
	};
}
