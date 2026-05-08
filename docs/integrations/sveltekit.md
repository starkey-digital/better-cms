# SvelteKit integration

Mount the handler, render the admin, read content from server load functions or remote functions.

The CMS config is a server-only module — `src/lib/server/cms.ts` by convention. SvelteKit's bundler rejects any client-side import of files under `src/lib/server/`, so adapter credentials, media keys, and auth secrets stay on the server.

## Handler

```ts
// src/hooks.server.ts
import config from '$lib/server/cms';
import { cmsHandle } from 'better-cms/sveltekit';

export const handle = cmsHandle(config);
```

## The `cms` API — server side

`bcms init` writes a `cms.ts` that exports both the raw `config` (default) and a typed property-style API (named export `cms`):

```ts
// src/lib/server/cms.ts
import { defineCMS, ... } from 'better-cms';
import { createCms } from 'better-cms/sveltekit';

const config = defineCMS({ ... });

export default config;
export const cms = createCms(config);
```

Use it from any server load function, hook, or remote function:

```ts
// src/routes/blog/+page.server.ts
import { cms } from '$lib/server/cms';

export async function load() {
	const posts = await cms.posts.list({ limit: 20 });
	return { posts };
}
```

```ts
// src/routes/blog/[slug]/+page.server.ts
import { cms } from '$lib/server/cms';
import { error } from '@sveltejs/kit';

export async function load({ params }) {
	const post = await cms.posts.get(params.slug);  // tries id, then slug field
	if (!post) throw error(404);
	return { post };
}
```

Each collection key has `list / find / get / count`; each singleton has `get / set`. Methods are typed from your collection definitions — `cms.posts.list()` returns `Post[]`, `cms.settings.get()` returns `Settings | null`. The first call lazily boots the CMS singleton; subsequent calls reuse it.

## The `cms` API — client side (in components)

`cms` is server-only (lives under `src/lib/server/`). Components can't import it. Instead, ship the JSON-safe slice through a layout loader and let the component build its own client API:

```ts
// src/routes/+layout.server.ts
import config from '$lib/server/cms';
import { clientCmsConfig } from 'better-cms/sveltekit';

export const load = () => ({ cmsConfig: clientCmsConfig(config) });
```

```svelte
<!-- src/routes/blog/[slug]/+page.svelte -->
<script lang="ts">
import { page } from '$app/state';
import { createCmsClient } from 'better-cms/sveltekit';

let { data } = $props();
const cms = $derived(createCmsClient(data.cmsConfig));
const post = $derived(await cms.posts.get(page.params.slug));
</script>

{#if post}
  <h1>{post.title}</h1>
{/if}
```

Same property shape as the server `cms`, same types (flowing through `ClientCmsConfig<C>`), but methods talk to the CMS over HTTP. Use it for client-side queries triggered by URL params, search-as-you-type, anything that wants to refetch without a navigation.

## Remote functions (typed RPC)

For server-resident queries you want to call from anywhere — components, event handlers, etc. — use SvelteKit's remote functions. better-cms ships helpers that call into the same singleton without going through HTTP, so latency stays in-process:

```ts
// src/lib/cms.remote.ts
import { query, command } from '$app/server';
import { listCollection, runOps } from 'better-cms/sveltekit/remote';
import config from '$lib/server/cms';

export const posts = query(async () => listCollection(config, 'posts'));
export const save = command(async (ops) => runOps(config, ops));
```

### Validating remote inputs (Standard Schema)

`query` and `command` accept any [Standard Schema](https://standardschema.dev) compatible validator — `valibot`, `zod`, `arktype`, etc. SvelteKit rejects bad input before your handler runs.

`'unchecked'` works for prototyping, but lock the contract before shipping:

```ts
import { command, query } from '$app/server';
import * as v from 'valibot';
import { listCollection, runOps } from 'better-cms/sveltekit/remote';
import config, { cms } from '$lib/server/cms';

const RecentLimit = v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(50));
const ToggleInput = v.object({
	id: v.string(),
	published: v.boolean(),
});

export const recentPosts = query(RecentLimit, async (limit) =>
	listCollection(config, 'posts', { limit, where: { published: true } }),
);

export const togglePublished = command(ToggleInput, async (input) => {
	if (!(await cms.auth.getUser())) throw new Error('unauthorized');
	return runOps(config, [
		{ op: 'set', collection: 'posts', id: input.id, data: { published: input.published } },
	]);
});
```

Pick whichever validator library your team is comfortable with — better-cms doesn't dictate.

## Admin page

```ts
// src/routes/cms/+page.server.ts
import cms from '$lib/server/cms';
import { clientCmsConfig } from 'better-cms/sveltekit';

export const load = () => ({ cms: clientCmsConfig(cms) });
```

```svelte
<!-- src/routes/cms/+page.svelte -->
<script lang="ts">
	import { CmsAdmin } from 'better-cms/admin';
	let { data } = $props();
</script>

<CmsAdmin config={data.cms} />
```

`clientCmsConfig` returns the JSON-safe slice the admin actually uses (`{ collections, basePath }`). Adapter, media, auth, and plugins never cross to the browser.

## Reading the session

`passwordAuth` sets a signed cookie (`bcms_session`) on successful login. Once a user is signed in, you can check the session anywhere on the server — useful for conditional UI like an "Admin" link in your nav.

The simplest pattern is a root `+layout.server.ts` that resolves the user once per request and exposes it to every child page via `data`:

```ts
// src/routes/+layout.server.ts
import cms from '$lib/server/cms';

export async function load({ request }) {
	const user = (await cms.auth?.getUser(request)) ?? null;
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

Every child route gets `data.user` for free. No extra fetch, no client-side waterfall — the cookie is verified on the server during the same request that renders the page.

If you can't add a layout loader (e.g. a static-prerendered route that hydrates), call the `/api/cms/me` endpoint from the client:

```ts
const r = await fetch('/api/cms/me');
const { user } = (await r.json()) as { user: { id: string; role: string } | null };
```

`/me` is part of the `passwordAuth` plugin and returns `{ user: null }` when no valid session cookie is present — never throws, safe for unauthenticated callers.

## Live updates

Operations broadcast via the handler. Admin and any subscribed page update without a refresh.
