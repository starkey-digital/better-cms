# SvelteKit integration

Mount the handler, render the admin, read content from server load functions or remote functions.

The `$lib/cms/` layout splits browser-safe schemas/client from the server-only adapter+plugins config. SvelteKit's bundler rejects any client-side import of files under `$lib/cms/server/`, so adapter credentials, media keys, and auth secrets stay on the server.

## Handler

```ts
// src/hooks.server.ts
import config from '$lib/cms/server/cms';
import { cmsHandle } from 'better-cms/sveltekit/server';

export const handle = cmsHandle(config);
```

## The `cms` API — server side

`bcms init` writes a `cms.ts` that exports both the raw `config` (default) and a typed property-style API (named export `cms`):

```ts
// src/lib/cms/server/cms.ts
import { createCms } from 'better-cms/sveltekit/server';
import { defineCMS } from 'better-cms/zod';
import { collections } from '../schemas.js';

const config = defineCMS({ collections, adapter: ..., plugins: [...] });

export default config;
export const cms = createCms(config);
```

Use it from any server load function, hook, or remote function:

```ts
// src/routes/blog/+page.server.ts
import { cms } from '$lib/cms/server/cms';

export async function load() {
	const posts = await cms.posts.list({ limit: 20 });
	return { posts };
}
```

```ts
// src/routes/blog/[slug]/+page.server.ts
import { cms } from '$lib/cms/server/cms';
import { error } from '@sveltejs/kit';

export async function load({ params }) {
	const post = await cms.posts.get(params.slug);  // tries id, then slug field
	if (!post) throw error(404);
	return { post };
}
```

Each collection key has `list / find / get / count / create / update / delete`; each singleton has `get / set`. Methods are typed from your zod schemas — `cms.posts.list()` returns `Post[]`, `cms.settings.get()` returns `Settings | null`. Mutations run through `applyOps` and publish live events. The first call lazily boots the CMS singleton; subsequent calls reuse it.

`cms.auth.getUser()` reads the request from `cmsHandle`'s AsyncLocalStorage scope. `cms.auth.requireUser()` throws when no user is signed in.

## The `cms` client — browser side (in components)

`cms` is server-only. Components use the browser-safe `cmsClient` you build once in `$lib/cms/client.ts`:

```ts
// src/lib/cms/client.ts
import { clientCmsConfig, createCmsClient } from 'better-cms/sveltekit';
import { collections } from './schemas.js';

export const cmsConfig = clientCmsConfig({ collections, basePath: '/api/cms' });
export const cmsClient = createCmsClient(cmsConfig);
```

```svelte
<!-- src/routes/blog/[slug]/+page.svelte -->
<script lang="ts">
	import { cmsClient } from '$lib/cms/client';
	const { params } = $props();
	const post = $derived(await cmsClient.posts.get(params.slug));
</script>

{#if post}<h1>{post.title}</h1>{/if}
```

Same property shape as the server `cms`, same types. Methods talk to the CMS over HTTP (`/api/cms/...`). During SSR the request-scoped `event.fetch` is used so relative URLs resolve.

> **Bundle.** Importing `./schemas` here pulls zod (~30 kB gz) into the browser bundle. Most apps already bundle zod for form validation. For zero-zod SSR-only sites, see [`bcms generate --target=client`](/reference/cli) which bakes a static manifest.

## Remote functions (typed RPC)

```ts
// src/lib/cms/cms.remote.ts
import { command, query } from '$app/server';
import { posts } from '$lib/cms/schemas';
import { cms } from '$lib/cms/server/cms';
import { z } from 'zod';

const RecentLimit = z.number().int().min(1).max(50);

export const recentPosts = query(RecentLimit, async (limit) =>
	cms.posts.list({
		limit,
		where: { published: true },
		orderBy: [{ field: 'createdAt', dir: 'desc' }],
	}),
);

export const createPost = command(posts.schemas.create, async (input) => {
	await cms.auth.requireUser();
	return cms.posts.create(input);
});
```

`posts.schemas.create` / `.update` / `.full` are the auto-composed Standard Schemas — built from your zod schema via the lossless `omit`/`partial` flow. Drop straight into `command(schema, fn)` / `query(schema, fn)`. Same applies to tRPC, hono, anywhere a Standard Schema validator is accepted.

For bespoke inputs (custom args, multi-collection commands), hand-roll with zod:

```ts
const ToggleInput = z.object({ id: z.string(), published: z.boolean() });

export const togglePublished = command(ToggleInput, async ({ id, published }) => {
	await cms.auth.requireUser();
	return cms.posts.update(id, { published });
});
```

## Admin page

```svelte
<!-- src/routes/cms/+page.svelte -->
<script lang="ts">
	import { cmsConfig } from '$lib/cms/client';
	import { CmsAdmin } from 'better-cms/admin';
</script>

<CmsAdmin config={cmsConfig} auth />
```

No `+page.server.ts` needed — schemas live in the browser bundle (via `$lib/cms/schemas`), so the admin manifest builds client-side.

## Reading the session

`passwordAuth` sets a signed cookie (`bcms_session`) on successful login. Check the session anywhere via `cms.auth.getUser()` — server-side, no extra round trip:

```ts
// src/routes/+layout.server.ts
import { cms } from '$lib/cms/server/cms';

export async function load() {
	const user = await cms.auth.getUser();
	return { user };
}
```

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
	let { data, children } = $props();
</script>

<nav>
	<a href="/">Home</a>
	{#if data.user}
		<a href="/cms">Admin</a>
		<form method="POST" action="/api/cms/logout"><button>Sign out</button></form>
	{:else}
		<a href="/cms">Sign in</a>
	{/if}
</nav>

{@render children()}
```

Every child route gets `data.user` from the layout — no client-side waterfall. The cookie is verified on the server during the same request that renders the page.

If you can't add a layout loader (e.g. a static-prerendered route that hydrates), call `/api/cms/me` from the client:

```ts
const r = await fetch('/api/cms/me');
const { user } = (await r.json()) as { user: { id: string; role: string } | null };
```

`/me` is part of the `passwordAuth` plugin and returns `{ user: null }` when no valid session cookie is present — never throws.

## Live updates

Mutations through `cms.posts.*` and the HTTP `/ops` endpoint publish events on the live channel. The admin and any subscribed page update without a refresh.

## Vite config note

When schemas use zod, add `optimizeDeps: { include: ['zod'] }` to your `vite.config.ts`. Without it, Vite's on-demand optimize-then-reload can fire during the first hydrating request and drop event-handler attachment on the floor. The `bcms init` template wires this for you.
