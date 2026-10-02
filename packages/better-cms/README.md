# better-cms

Drop-in headless CMS. BYO database, BYO storage. SvelteKit today, React/Next planned. Inspired by [better-auth](https://better-auth.com).

## Install

```sh
bun add better-cms
```

That's the only line. Subpath imports work via `package.json#exports` — peer deps are optional, so you only install what you use.

```sh
# pick one DB driver
bun add @libsql/client
# pick one ORM (optional — libsql adapter works without)
bun add drizzle-orm

# framework
bun add @sveltejs/kit svelte

# CLI (dev-only)
bun add -D @better-cms/cli
```

## Define content

Schema-first: write a zod schema, the CMS derives fields, validators and the admin form from it.

```ts
// src/lib/cms/server/cms.ts  (server-only: any `server/` path segment is guarded by SvelteKit)
import { createCms } from 'better-cms/sveltekit/server';
import { libsqlAdapter } from 'better-cms/adapters/libsql';
import { s3Media } from 'better-cms/media/s3';
import { image, richText, slug } from 'better-cms/zod';
import { z } from 'zod';

export const cms = createCms({
  collections: ({ collection, singleton }) => ({
    posts: collection({
      label: 'Blog posts',
      schema: z.object({
        title: z.string().min(1).max(120).meta({ label: 'Headline' }),
        slug: slug(),
        body: richText(),
        cover: image().optional(),
        published: z.boolean().default(false),
      }),
      admin: { title: 'title', sort: { field: 'createdAt', direction: 'desc' } },
    }),
    settings: singleton({
      schema: z.object({ siteTitle: z.string(), logo: image().optional() }),
    }),
  }),
  adapter: libsqlAdapter({ url: process.env.DATABASE_URL!, authToken: process.env.DATABASE_AUTH_TOKEN }),
  media: s3Media({ bucket: process.env.S3_BUCKET!, /* ... */ }),
  auth: { context: async () => ({ user: { id: 'dev', role: 'admin' as const } }) },
});

export type Cms = typeof cms;
```

## Wire SvelteKit

```ts
// src/hooks.server.ts
import { cmsHandle } from 'better-cms/sveltekit/server';
import { cms } from '#lib/cms/server/cms.ts';
export const handle = cmsHandle(cms);
```

## Drop-in admin UI

The admin takes a client, not a config. It reads field metadata from `GET /api/cms/_meta`.

```ts
// src/lib/cms/client.ts
import { createCmsClient } from 'better-cms/sveltekit';
import type { Cms } from './server/cms';
export const cmsClient = createCmsClient<Cms>({ basePath: '/api/cms' });
```

```svelte
<!-- src/routes/cms/+page.svelte -->
<script>
  import { CmsAdmin } from 'better-cms/admin';
  import { cmsClient } from '#lib/cms/client.ts';
</script>
<CmsAdmin client={cmsClient} />
```

## Database schema

`libsqlAdapter` creates tables and adds new columns on startup. With `drizzleAdapter`, generate the schema and let drizzle-kit migrate:

```sh
bunx -p @better-cms/cli bcms generate
bunx drizzle-kit push
```

## Subpath map

| Import | What |
|---|---|
| `better-cms` | Core runtime + types (`createCMS`, `RowOf`, `CollectionDef`, ops). |
| `better-cms/zod` | Schema-first DSL — `collection`, `singleton`, `richText`, `image`, `slug`, `relation`. |
| `better-cms/adapters/libsql` | Direct libsql `ContentStore`. Creates tables and adds missing columns on init. |
| `better-cms/adapters/drizzle` | Drizzle `ContentStore`. drizzle-kit owns DDL. |
| `better-cms/media/s3` | S3-compatible `MediaStore` (R2/Wasabi/B2/MinIO/AWS). |
| `better-cms/sveltekit` | Browser-safe: `createCmsClient` (admin UI + external clients). |
| `better-cms/sveltekit/server` | Server-only: `createCms`, `cmsHandle`. |
| `better-cms/auth` | Password plugin, signed-cookie sessions, rate limiting, Turnstile. |
| `better-cms/admin` | `<CmsAdmin>` and `<FieldEditor>` Svelte 5 components. |
| `better-cms/types` | Re-export of every public type. |

## CLI

```sh
bunx -p @better-cms/cli bcms init        # scaffold cms.config.ts + .env.example
bunx -p @better-cms/cli bcms generate    # emit drizzle schema file from cms.config
bunx -p @better-cms/cli bcms generate --target=types   # emit TS interfaces
bunx -p @better-cms/cli bcms mcp         # boot stdio MCP server (Claude Code, Claude Desktop)
```

## Status

Pre-alpha. Architecture in flux.
