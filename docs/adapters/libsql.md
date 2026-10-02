# libSQL adapter

Direct adapter for libSQL / Turso / local SQLite via `@libsql/client`.

`@libsql/client` is an optional peer dependency — install it alongside `better-cms` when you use this adapter:

```bash
bun add @libsql/client
```

```ts
import { libsqlAdapter } from 'better-cms/adapters/libsql';

const adapter = libsqlAdapter({
	url: 'libsql://my-db.turso.io',
	authToken: process.env.TURSO_TOKEN,
});
```

## Local development

```ts
libsqlAdapter({ url: 'file:cms.db' })
```

Creates a SQLite file in cwd. No external service.

## Schema

Schema derives from your collections via `getCmsTables(config)` — never reach into `config.collections` directly. On startup the adapter:

1. creates any missing tables and indexes (`CREATE TABLE IF NOT EXISTS`);
2. compares each table with `PRAGMA table_info` and runs `ALTER TABLE ... ADD COLUMN` for every field the schema gained since the table was created.

So adding a field to a collection after launch just works: redeploy and the column appears. Existing rows read the new field as absent, so make it `.optional()` or give it a `.default()` — added columns are always nullable.

Guarantees:

- Existing columns are **never dropped or altered**. Removing a field leaves its column in place, unused.
- If an existing column's type differs from what the schema expects, a single warning is logged and the column is left alone.
- A new `unique` field gets a unique index rather than an inline constraint (SQLite cannot add a `UNIQUE` column).
- Idempotent and safe when several instances cold-start at once; a "duplicate column" race is treated as success.

Renames, type changes and drops are not automatic. Run that SQL yourself.

To manage the schema with another tool, pass `migrate: false`; `init()` then only records the schema and issues no DDL.

```ts
libsqlAdapter({ url: process.env.DATABASE_URL!, migrate: false });
```
