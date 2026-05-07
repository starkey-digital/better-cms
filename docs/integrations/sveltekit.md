# SvelteKit integration

Mount the handler, render the admin, read content from server load functions or remote functions.

The CMS config is a server-only module — `src/lib/server/cms.ts` by convention. SvelteKit's bundler rejects any client-side import of files under `src/lib/server/`, so adapter credentials, media keys, and auth secrets stay on the server.

## Handler

```ts
// src/hooks.server.ts
import cms from '$lib/server/cms';
import { cmsHandle } from 'better-cms/sveltekit';

export const handle = cmsHandle(cms);
```

## Reading content (server)

```ts
// src/routes/blog/+page.server.ts
import cmsConfig from '$lib/server/cms';
import { cms, serverApi } from 'better-cms/sveltekit';

export async function load() {
	const instance = await cms(cmsConfig);
	const api = serverApi(instance.context);
	const posts = await api.list('posts', { limit: 20 });
	return { posts };
}
```

`api.list / api.find / api.count / api.getSingleton` are fully typed from your collection definition.

## Reading content (remote functions)

```ts
// src/routes/blog/data.remote.ts
import cmsConfig from '$lib/server/cms';
import { listCollection } from 'better-cms/sveltekit/remote';

export const listPosts = listCollection(cmsConfig, 'posts');
```

Then call from a client component without a manual `+page.server.ts`.

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
