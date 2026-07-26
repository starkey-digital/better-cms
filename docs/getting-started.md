# Getting started

Five-minute setup for SvelteKit. Schema-first, zod-powered.

## 1. Scaffold

```bash
bunx -p @better-cms/cli bcms init
```

Writes the `$lib/cms/` layout:

- `src/lib/cms/server/cms.ts` — schemas, collections, adapter, plugins, auth. Server-only.
- `src/lib/cms/cms.remote.ts` — remote `query` / `command` / `form` endpoints
- `src/lib/cms/client.ts` — `cmsClient` for the admin UI
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
import { PostSchema } from './schemas.js';

export const cms = createCms({
	collections: ({ collection, singleton }) => ({
		posts: collection({ schema: PostSchema }),
	}),
	adapter: libsqlAdapter({
		url: process.env.DATABASE_URL!,
		authToken: process.env.DATABASE_AUTH_TOKEN,
	}),
});

export default cms;
export type Cms = typeof cms;
```

The `({ collection, singleton })` builder form pins `Ctx` from `auth.context`, so per-collection `access` and `hooks` see a typed context without a generic at every call site.

`createCms` resolves any `relation(otherCollection)` refs to the registered name strings and throws if a target isn't in `collections`.

## 4. Mount the handler

```ts
// src/hooks.server.ts
import cms from '$lib/cms/server/cms';
import { cmsHandle } from 'better-cms/sveltekit/server';

export const handle = cmsHandle(cms);
```

Default base path is `/api/cms`. Override with `config.basePath` if you need a different mount point.

## 5. Read content on the server

Inside the SvelteKit server — load functions, remote functions, `+server.ts` — call the `cms` object directly. No HTTP round trip, and the same access policies apply.

```ts
// src/routes/+page.server.ts
import { cms } from '$lib/cms/server/cms';

export async function load() {
	return {
		posts: await cms.posts.list({ limit: 20, orderBy: [{ field: 'createdAt', dir: 'desc' }] }),
	};
}
```

Rows come back decoded: booleans are booleans, dates are `Date`s, json fields are parsed.

## 6. Render the admin UI

The admin talks to the CMS over HTTP, so give it a client:

```ts
// src/lib/cms/client.ts
import { createCmsClient } from 'better-cms/sveltekit';
import type { Cms } from './server/cms';

export const cmsClient = createCmsClient<Cms>({ basePath: '/api/cms' });
```

`import type` is erased before bundling, so this pulls no server code into the browser.

```svelte
<!-- src/routes/cms/+page.svelte -->
<script lang="ts">
	import { cmsClient } from '$lib/cms/client';
	import { CmsAdmin } from 'better-cms/admin';
</script>

<CmsAdmin client={cmsClient} auth />
```

`<CmsAdmin>` fetches its field metadata from `GET /api/cms/_meta` — no config crosses to the browser, and no codegen step.

## 7. Write content with remote functions

`*.remote.ts` files give you typed `query` / `command` / `form` endpoints backed by the same `cms` object. Every collection also carries ready-made validators.

```ts
// src/lib/cms/cms.remote.ts
import { command, form, query } from '$app/server';
import { cms } from '$lib/cms/server/cms';
import { z } from 'zod';

export const recentPosts = query(async () =>
	cms.posts.list({ limit: 10, where: { published: true } }),
);

// `schemas.form` is the create schema with FormData coercion plus an optional
// `id`, so one handler serves both create and edit.
export const savePost = form(cms.posts.schemas.form, async (data) => {
	const { id, ...values } = data;
	const row = id ? await cms.posts.update(id, values) : await cms.posts.create(values);
	await recentPosts().refresh();
	return { id: row.id };
});

export const deletePost = command(z.string(), async (id) => {
	await cms.posts.delete(id);
	await recentPosts().refresh();
});
```

Remote functions need `kit.experimental.remoteFunctions` in `svelte.config.js`, and `compilerOptions.experimental.async` for `$derived(await ...)` in templates.

> **Access policies apply here.** A `query` compiles to a public HTTP endpoint, so `query(() => cms.secrets.list())` exposes whatever that collection's `read` policy permits — and nothing more.

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
