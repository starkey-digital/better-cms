# SvelteKit integration

Mount the handler, render the admin, read content from server load functions or remote functions.

The whole CMS config lives under `$lib/cms/server/`, which SvelteKit's bundler refuses to import from client code — adapter credentials, media keys, and auth secrets stay on the server. Components reach the CMS through remote functions, or through the HTTP client for the admin UI.

## Handler

```ts
// src/hooks.server.ts
import cms from '$lib/cms/server/cms';
import { cmsHandle } from 'better-cms/sveltekit/server';

export const handle = cmsHandle(cms);
```

`cmsHandle` does two things: it opens the request scope that `cms.auth.context()` and access policies read, and it serves the CMS HTTP endpoints under `basePath` (default `/api/cms`). It must be installed even if you never call those endpoints directly.

## The `cms` API — server side

`bcms init` writes a `cms.ts` exporting a typed, property-style API:

```ts
// src/lib/cms/server/cms.ts
import { createCms } from 'better-cms/sveltekit/server';

export const cms = createCms({
	collections: ({ collection, singleton }) => ({ posts: collection({ schema: PostSchema }) }),
	adapter: libsqlAdapter({ url: process.env.DATABASE_URL! }),
	plugins: [password],
});

export default cms;
export type Cms = typeof cms;
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

Each collection key has `list / find / get / count / create / update / delete`; each singleton has `get / set`. Methods are typed from your zod schemas — `cms.posts.list()` returns `Post[]`, `cms.settings.get()` returns `Settings | null`.

This is the same implementation the HTTP endpoints call, so reads and writes apply the same access policies and return the same decoded values either way — booleans as booleans, dates as `Date`s, json fields parsed. Mutations run through `applyOps` and publish live events. The first call lazily boots the CMS; subsequent calls reuse it.

`cms.auth.context()` resolves the active request through the configured `auth.context` provider, memoized per request. `cms.auth.requireContext()` throws when the resolved context is null. See [Authentication](/concepts/auth) for full BYOA wiring.

## Reaching the CMS from components

Components can't import `cms` — it's server-only. Use a remote function:

```svelte
<!-- src/routes/blog/[slug]/+page.svelte -->
<script lang="ts">
	import { postBySlug } from '$lib/cms/cms.remote';
	const { params } = $props();
	const post = $derived(await postBySlug(params.slug));
</script>

{#if post}<h1>{post.title}</h1>{/if}
```

The HTTP client (`createCmsClient`) also exists, but it's aimed at the admin UI and at clients outside this server — a mobile app, another service, an MCP tool. Inside SvelteKit, a remote function is a better fit: it's typed end to end, it skips a round trip during SSR, and only the fields you actually return cross the wire.

## Remote functions (typed RPC)

```ts
// src/lib/cms/cms.remote.ts
import { command, query } from '$app/server';
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

export const createPost = command(cms.posts.schemas.create, async (input) => {
	await cms.auth.requireContext();
	return cms.posts.create(input);
});
```

`cms.posts.schemas.create` / `.update` / `.full` / `.form` are the auto-composed Standard Schemas — built from your zod schema via the lossless `omit`/`partial` flow. Drop straight into `command(schema, fn)` / `query(schema, fn)`. Same applies to tRPC, hono, anywhere a Standard Schema validator is accepted.

`.form` is the create schema with an optional `id` and every field coerced from the strings `FormData` carries, so it can back a progressively-enhanced `form()` directly:

```ts
export const savePost = form(cms.posts.schemas.form, async (data) => {
	const { id, ...values } = data;
	const row = id ? await cms.posts.update(id, values) : await cms.posts.create(values);
	await recentPosts(10).refresh();
	return { id: row.id };
});
```

In the component, wire each input with `.as(type, initial)` so its name, value and `aria-invalid` bind to the form's field state — hand-written `name`/`value` attributes stay outside it, and `issues()` never populates:

```svelte
<form {...savePost}>
	<input {...savePost.fields.title.as('text', post.title)} />
	{#each savePost.fields.title.issues() ?? [] as issue}
		<p class="error">{issue.message}</p>
	{/each}
	<button>Save</button>
</form>
```

For bespoke inputs (custom args, multi-collection commands), hand-roll with zod:

```ts
const ToggleInput = z.object({ id: z.string(), published: z.boolean() });

export const togglePublished = command(ToggleInput, async ({ id, published }) => {
	await cms.auth.requireContext();
	return cms.posts.update(id, { published });
});
```

## Admin page

```svelte
<!-- src/routes/cms/+page.svelte -->
<script lang="ts">
	import { cmsClient } from '$lib/cms/client';
	import { CmsAdmin } from 'better-cms/admin';
</script>

<CmsAdmin client={cmsClient} auth />
```

No `+page.server.ts` needed. `<CmsAdmin>` fetches its field metadata from `GET /api/cms/_meta`, which serves static editor descriptors only — validators, access policies and hooks never reach the browser.

### Routing

The admin uses hash routing inside the component, so a single mount handles every collection and record. The default route is the first collection. Direct links work:

- `#/posts` — list view
- `#/posts/new` — new record
- `#/posts/<id>` — edit record
- `#/settings` — singleton edit (singletons skip the list view)

Drop `<CmsAdmin>` on `/cms` and the URL will read e.g. `/cms#/posts/abc-123`.

### Theming

Every visual choice is a CSS custom property on `.bcms`. Override in any stylesheet that loads on the admin page:

```css
.bcms {
	--bcms-primary: #6366f1;
	--bcms-primary-fg: #ffffff;
	--bcms-accent: #ec4899;
	--bcms-success: #22c55e;
	--bcms-danger: #ef4444;
	--bcms-radius: 10px;
	--bcms-radius-sm: 8px;
	--bcms-radius-lg: 16px;
	--bcms-font: 'Geist', system-ui, sans-serif;
	--bcms-bg: #0b0b0e;
	--bcms-surface: #15151a;
	--bcms-fg: #e5e7eb;
	--bcms-border: #27272a;
}
```

Or per-instance via inline style:

```svelte
<div style="--bcms-primary: #6366f1; --bcms-radius: 12px;">
	<CmsAdmin {client} auth />
</div>
```

The full token list lives at the top of `packages/admin/src/lib/CmsAdmin.svelte` — colors, radii, shadows, type scale, sidebar width.

## Reading the session

`passwordAuth` sets a signed cookie (`bcms_session`) on successful login. Check the resolved auth context anywhere via `cms.auth.context()` — server-side, no extra round trip:

```ts
// src/routes/+layout.server.ts
import { cms } from '$lib/cms/server/cms';

export async function load() {
	const ctx = await cms.auth.context();
	return { ctx };
}
```

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
	let { data, children } = $props();
</script>

<nav>
	<a href="/">Home</a>
	{#if data.ctx}
		<a href="/cms">Admin</a>
		<form method="POST" action="/api/cms/logout"><button>Sign out</button></form>
	{:else}
		<a href="/cms">Sign in</a>
	{/if}
</nav>

{@render children()}
```

Every child route gets `data.ctx` from the layout — no client-side waterfall. The cookie is verified on the server during the same request that renders the page.

If you can't add a layout loader (e.g. a static-prerendered route that hydrates), call `/api/cms/auth/context` from the client:

```ts
const r = await fetch('/api/cms/auth/context');
const { ctx } = (await r.json()) as { ctx: { user: { id: string } } | null };
```

`/auth/context` is exposed by the core CMS handler (not specific to `passwordAuth`) and returns `{ ctx: null }` when no auth is configured or the resolver returns null — never throws.

## Live updates

Mutations through `cms.posts.*` and the HTTP `/ops` endpoint publish events on the live channel. The admin and any subscribed page update without a refresh.

## Vite config note

When schemas use zod, add `optimizeDeps: { include: ['zod'] }` to your `vite.config.ts`. Without it, Vite's on-demand optimize-then-reload can fire during the first hydrating request and drop event-handler attachment on the floor. The `bcms init` template wires this for you.
