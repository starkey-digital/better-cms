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

# pick one media backend
bun add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner

# framework
bun add @sveltejs/kit svelte

# CLI (dev-only)
bun add -D @better-cms/cli
```

## Define content

```ts
// src/lib/cms.config.ts
import { defineCMS, collection, singleton, text, slug, richText, image, boolean } from 'better-cms';
import { libsqlAdapter } from 'better-cms/adapters/libsql';
import { s3Media } from 'better-cms/media/s3';

export default defineCMS({
  collections: {
    posts: collection({
      fields: {
        title: text({ required: true, max: 120 }),
        slug:  slug({ from: 'title' }),
        body:  richText(),
        cover: image(),
        published: boolean({ defaultValue: false }),
      },
    }),
    settings: singleton({
      fields: {
        siteTitle: text({ required: true }),
        logo: image(),
      },
    }),
  },
  adapter: libsqlAdapter({ url: process.env.DATABASE_URL!, authToken: process.env.DATABASE_AUTH_TOKEN }),
  media:   s3Media({ bucket: process.env.S3_BUCKET!, /* ... */ }),
  auth:    { getUser: async () => ({ id: 'dev', role: 'admin' }) },
});
```

## Wire SvelteKit

```ts
// src/hooks.server.ts
import { cmsHandle } from 'better-cms/sveltekit';
import config from '$lib/cms.config';
export const handle = cmsHandle(config);
```

## Drop-in admin UI

```svelte
<!-- src/routes/cms/+page.svelte -->
<script>
  import { CmsAdmin } from 'better-cms/admin';
  import config from '$lib/cms.config';
</script>
<CmsAdmin {config} />
```

## Generate drizzle schema

```sh
bunx -p @better-cms/cli bcms generate
bunx drizzle-kit push
```

## Subpath map

| Import | What |
|---|---|
| `better-cms` | Core DSL — `defineCMS`, `collection`, `singleton`, all field builders, types. |
| `better-cms/adapters/libsql` | Direct libsql `ContentStore`. Owns DDL via `init(schema)`. |
| `better-cms/adapters/drizzle` | Drizzle `ContentStore`. drizzle-kit owns DDL. |
| `better-cms/media/s3` | S3-compatible `MediaStore` (R2/Wasabi/B2/MinIO/AWS). |
| `better-cms/sveltekit` | `cmsHandle` hook + `cms()` lazy singleton + typed `serverApi`. |
| `better-cms/sveltekit/remote` | Remote-function helpers (`listCollection`, `runOps`, `uploadMedia`, ...). |
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
