# Drizzle adapter

Use Drizzle ORM as the persistence layer. Works with any Drizzle-supported database (Postgres, MySQL, SQLite).

`drizzle-orm` is an optional peer dependency — install it, plus your database driver, alongside `better-cms`:

```bash
bun add drizzle-orm postgres
```

```ts
import { drizzleAdapter } from 'better-cms/adapters/drizzle';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const client = postgres(process.env.DATABASE_URL);
const db = drizzle(client);

const adapter = drizzleAdapter({ db, dialect: 'postgres' });
```

## When to choose Drizzle

- You already use Drizzle in your app
- You need Postgres or MySQL features (full-text, GIS, etc.)
- You want to share the connection pool with the rest of your app

For greenfield SQLite use [libSQL](/adapters/libsql) — fewer moving parts.

## Schema integration

The adapter exposes the generated Drizzle schema via `getCmsTables(config)`. You can reference CMS tables in your own queries.

## Migrations

**drizzle-kit owns migrations.** Unlike the [libSQL adapter](/adapters/libsql), this adapter never creates tables or adds columns by default (`skipDDL: true`). After adding or changing a field, regenerate the schema and migrate:

```bash
bunx -p @better-cms/cli bcms generate
bunx drizzle-kit generate && bunx drizzle-kit migrate   # or `drizzle-kit push` in dev
```

Sorting, `limit`/`offset` and totals work the same as on every adapter.
