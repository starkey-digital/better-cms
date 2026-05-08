# Getting started

Five-minute setup for SvelteKit. Schema-first, zod-powered.

## 1. Scaffold

```bash
bunx -p @better-cms/cli bcms init
```

Writes the new `$lib/cms/` layout:

- `src/lib/cms/schemas.ts` — zod schemas + collection definitions
- `src/lib/cms/client.ts` — `cmsClient` + `cmsConfig` for the admin UI
- `src/lib/cms/server/cms.ts` — adapter + plugins + auth + `defineCMS`
- `src/hooks.server.ts` — wires `cmsHandle(cms)`
- `src/routes/cms/+page.svelte` — admin route
- `.env.example` — DB + S3 vars
- `drizzle.config.ts`

Then installs `better-cms`, `zod`, `dotenv` (runtime) and `drizzle-kit`, `@libsql/client` (dev). `--skip-install` prints the install commands instead.

## 2. Define your schemas

```ts
// src/lib/cms/schemas.ts
import { collection, image, richText, singleton, slug } from 'better-cms/zod';
import { z } from 'zod';

export const PostSchema = z.object({
	title: z.string().min(1).max(120),
	slug: slug(),
	excerpt: z.string().max(500).optional(),
	body: richText().optional(),
	cover: image().optional(),
	published: z.boolean().default(false),
});

export const SettingsSchema = z.object({
	siteTitle: z.string().min(1),
	tagline: z.string().optional(),
});

export const posts = collection({ schema: PostSchema });
export const settings = singleton({ schema: SettingsSchema });

export const collections = { posts, settings };

export type Post = z.infer<typeof PostSchema>;
export type Settings = z.infer<typeof SettingsSchema>;
```

The walker derives the IR (drizzle columns, admin widgets, MCP descriptors) from the zod schema. Schemas come from `better-cms/zod`'s helpers (`richText`, `image`, `file`, `slug`, `relation`, `unique`, `indexed`) which tag plain zod schemas with the metadata the walker reads.

## 3. Wire up the server

```ts
// src/lib/cms/server/cms.ts
import 'dotenv/config';
import { libsqlAdapter } from 'better-cms/adapters/libsql';
import { createCms } from 'better-cms/sveltekit/server';
import { defineCMS } from 'better-cms/zod';
import { collections } from '../schemas.js';

const config = defineCMS({
	collections,
	adapter: libsqlAdapter({
		url: process.env.DATABASE_URL!,
		authToken: process.env.DATABASE_AUTH_TOKEN,
	}),
});

export default config;
export const cms = createCms(config);
```

`defineCMS` resolves any `relation(otherCollection)` refs to the registered name strings and throws if a target isn't in `collections`.

## 4. Mount the handler

```ts
// src/hooks.server.ts
import cms from '$lib/cms/server/cms';
import { cmsHandle } from 'better-cms/sveltekit/server';

export const handle = cmsHandle(cms);
```

Default base path is `/api/cms`. Override with `config.basePath` if you need a different mount point.

## 5. Build the typed client

```ts
// src/lib/cms/client.ts
import { clientCmsConfig, createCmsClient } from 'better-cms/sveltekit';
import { collections } from './schemas.js';

export const cmsConfig = clientCmsConfig({ collections, basePath: '/api/cms' });
export const cmsClient = createCmsClient(cmsConfig);
```

`clientCmsConfig` strips the server-only fields (`schemas`, `validation`, `toJsonSchema`) so the result is browser-safe. No codegen — types flow from the zod schemas via `z.infer`.

> **Bundle note.** Importing `./schemas` into the client pulls zod (~30 kB gz) into the browser bundle. For zero-zod SSR-only sites, see the [CLI codegen path](/reference/cli#client-manifest-codegen) which bakes a static manifest instead.

## 6. Render the admin UI

```svelte
<!-- src/routes/cms/+page.svelte -->
<script lang="ts">
	import { cmsConfig } from '$lib/cms/client';
	import { CmsAdmin } from 'better-cms/admin';
</script>

<CmsAdmin config={cmsConfig} auth />
```

No `+page.server.ts` needed — schemas are browser-importable now.

## 7. Use the client anywhere

```svelte
<!-- src/routes/posts/[slug]/+page.svelte -->
<script lang="ts">
	import { cmsClient } from '$lib/cms/client';

	const { params } = $props();
	const post = $derived(await cmsClient.posts.get(params.slug));
</script>

{#if post}
	<h1>{post.title}</h1>
	{#if post.body}<div>{@html post.body}</div>{/if}
{/if}
```

Server-side, the same shape works through `cms` from `createCms(config)`:

```ts
// src/routes/+page.server.ts
import { cms } from '$lib/cms/server/cms';

export const load = async () => ({
	posts: await cms.posts.list({ limit: 20 }),
});
```

## 8. Generate the database schema

```bash
bunx -p @better-cms/cli bcms generate   # emits src/lib/cms-schema.ts
bunx drizzle-kit push                    # uses ./drizzle.config.ts
```

## Next

- [Collections](/concepts/collections) — schema-first builder + helpers
- [Fields](/concepts/fields) — kind metadata reference (what the walker derives)
- [Auth](/concepts/auth) — passwordAuth plugin
- [SvelteKit](/integrations/sveltekit) — `cms` server API, remote functions, admin
- [CLI](/reference/cli) — `bcms init`, `bcms generate`, `bcms mcp`
