import { libsqlAdapter } from '@better-cms/adapter-libsql';
import type { ContentStore } from '@better-cms/core';
import type { Client } from '@libsql/client';

export interface DrizzleAdapterOpts<DB> {
	/** Drizzle db instance; must expose `$client` so the libsql layer can reuse the connection. */
	db: DB & { $client: Client };
	/** Skip table creation and column adds in init(); drizzle-kit owns migrations. Defaults true. */
	skipDDL?: boolean;
}

export interface DrizzleAdapter<DB> extends ContentStore {
	readonly db: DB;
}

/**
 * Drizzle ContentStore. Delegates SQL execution to the libsql adapter and exposes the drizzle `db`
 * for typed queries elsewhere. With `skipDDL` (default) it never touches the schema — drizzle-kit owns migrations, so a new field needs a `drizzle-kit generate`/`migrate`.
 */
export function drizzleAdapter<DB>(opts: DrizzleAdapterOpts<DB>): DrizzleAdapter<DB> {
	// init() must always reach the inner adapter: it is what hands it the schema
	// that every query resolves table names from. `migrate` only gates DDL.
	const inner = libsqlAdapter({
		url: '',
		client: opts.db.$client,
		migrate: !(opts.skipDDL ?? true),
	});
	return { ...inner, db: opts.db };
}
