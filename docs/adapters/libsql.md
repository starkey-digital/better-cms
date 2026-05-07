# libSQL adapter

Direct adapter for libSQL / Turso / local SQLite via `@libsql/client`.

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

Schema derives from your collections via `getCmsTables(config)` — never reach into `config.collections` directly. The adapter creates tables, columns, and indexes on first run.

## Migrations

The CLI reads `getCmsTables` and generates migration SQL. See [CLI reference](/reference/cli).
