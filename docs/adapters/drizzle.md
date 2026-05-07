# Drizzle adapter

Use Drizzle ORM as the persistence layer. Works with any Drizzle-supported database (Postgres, MySQL, SQLite).

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

The adapter exposes the generated Drizzle schema via `getCMSTables(config)`. You can reference CMS tables in your own queries.
