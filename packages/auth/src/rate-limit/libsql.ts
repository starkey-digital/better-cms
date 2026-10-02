import type { RateLimitHit, RateLimitStore } from './types.js';

/** The slice of `@libsql/client`'s `Client` this store uses, so `@better-cms/auth` needn't depend on it. */
export interface LibsqlLike {
	execute(stmt: { sql: string; args: (string | number)[] }): Promise<{ rows: unknown[] }>;
}

export interface LibsqlStoreOpts {
	/** Defaults to `bcms_rate_limit`. */
	table?: string;
	/** Chance (0–1) that an `incr` also deletes expired rows. Defaults to 0.02. */
	sweepProbability?: number;
}

/**
 * Rate-limit counters in the CMS's own libsql database — no extra service, and
 * correct across Workers isolates because every increment is one atomic upsert.
 * Share the client with the adapter: `libsqlAdapter({ client })`.
 */
export function libsqlStore(client: LibsqlLike, opts: LibsqlStoreOpts = {}): RateLimitStore {
	const table = opts.table ?? 'bcms_rate_limit';
	if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) {
		throw new Error(`libsqlStore: invalid table name "${table}"`);
	}
	const sweepProbability = opts.sweepProbability ?? 0.02;

	let ready: Promise<unknown> | undefined;
	const ensureTable = () => {
		if (!ready) {
			ready = client
				.execute({
					sql: `CREATE TABLE IF NOT EXISTS ${table} (key TEXT PRIMARY KEY NOT NULL, count INTEGER NOT NULL, reset_at INTEGER NOT NULL)`,
					args: [],
				})
				.catch((e) => {
					ready = undefined;
					throw e;
				});
		}
		return ready;
	};

	return {
		async incr(key, windowSec) {
			await ensureTable();
			const now = Date.now();
			const resetAt = now + windowSec * 1000;
			const res = await client.execute({
				sql: `INSERT INTO ${table} (key, count, reset_at) VALUES (?, 1, ?)
ON CONFLICT(key) DO UPDATE SET
  count = CASE WHEN reset_at <= ? THEN 1 ELSE count + 1 END,
  reset_at = CASE WHEN reset_at <= ? THEN excluded.reset_at ELSE reset_at END
RETURNING count, reset_at`,
				args: [key, resetAt, now, now],
			});
			if (Math.random() < sweepProbability) {
				await client.execute({ sql: `DELETE FROM ${table} WHERE reset_at <= ?`, args: [now] });
			}
			const row = res.rows[0] as { count: number | bigint; reset_at: number | bigint };
			return { count: Number(row.count), resetAt: Number(row.reset_at) } satisfies RateLimitHit;
		},
		async reset(key) {
			await ensureTable();
			await client.execute({ sql: `DELETE FROM ${table} WHERE key = ?`, args: [key] });
		},
	};
}
