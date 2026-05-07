# Authentication

better-cms ships a single password authentication plugin (`passwordAuth`). It protects the admin UI and exposes session helpers you can reuse across your app — checking "is the user signed in?" anywhere is a one-line call.

## Setup

`passwordAuth` is wired in your server-only CMS module:

```ts
// src/lib/server/cms.ts
import { defineCMS } from 'better-cms';
import { libsqlAdapter } from 'better-cms/adapters/libsql';
import { passwordAuth } from 'better-cms/sveltekit/auth';

const auth = passwordAuth({
	password: process.env.CMS_PASSWORD!,
	secret: process.env.CMS_AUTH_SECRET!,
	cookieSecure: process.env.NODE_ENV === 'production',
});

export default defineCMS({
	collections: { /* ... */ },
	adapter: libsqlAdapter({ /* ... */ }),
	plugins: [auth],
	auth: { getUser: auth.getUser },
});
```

`passwordAuth(opts)` returns an object that's both a CmsPlugin (mounting `/login`, `/logout`, `/me` endpoints) and exposes `getUser(request)` for reading the session.

### Options

| Field | Type | Default | Notes |
|---|---|---|---|
| `password` | `string` | — | Plain-text admin password. Hashed once at boot. Mutually exclusive with `passwordHash`. |
| `passwordHash` | `string` | — | Pre-hashed password (`bcms hash-password <pw>`). Use when you don't want the plain credential to appear in env dumps. |
| `secret` | `string` | — | HMAC key for signing session cookies. ≥16 chars. Generate with `bcms gen-secret 32`. |
| `cookieName` | `string` | `bcms_session` | Override if you have multiple CMSes on one domain. |
| `cookieTtl` | `string \| number` | `24h` | Accepts `'7d'`, `'1h'`, or seconds as a number. |
| `cookieSecure` | `boolean` | `true` | Set to `false` for local dev over HTTP. |
| `userId` | `string` | `admin` | The `id` placed into `getUser`'s return. |
| `rateLimit` | object | in-memory | Per-IP and global throttles. Pass `durableObjectStore()` or `upstashStore()` for production. |
| `turnstile` | object | — | Cloudflare Turnstile after N failed attempts. |
| `onFailedAttempt` | callback | — | Audit hook for security logging. |

## Login flow

1. The user opens `/cms`. The admin component (`<CmsAdmin auth />`) calls `GET /api/cms/me` — returns `{ user: null }` until they're signed in.
2. The login screen `POST`s `{ password }` to `/api/cms/login`. Successful response sets the `bcms_session` cookie.
3. The admin re-checks `/me`, sees `user`, and renders the editor. Subsequent ops (`POST /api/cms/ops`) carry the cookie automatically.
4. `POST /api/cms/logout` clears the cookie.

The cookie is HttpOnly, SameSite=Lax, and signed with `secret` — tampering invalidates the session. Format: a JWT-like `{ uid, exp }` payload, HMAC-SHA256 signature.

## Reading the session anywhere

The same cookie that authorizes admin requests can authorize *anything* in your app. `cms.auth.getUser(request)` is the single source of truth — server-side, no extra round trip.

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
	{#if data.user}
		<a href="/cms">Admin</a>
	{:else}
		<a href="/cms">Sign in</a>
	{/if}
</nav>

{@render children()}
```

Every child page gets `data.user` from the layout, so you don't pay the cookie verify cost more than once per request. `getUser` returns `null` when:

- no cookie is present
- the cookie's signature doesn't match `secret` (tampered or rotated)
- `exp` has passed

## Reading the session from the client

`/api/cms/me` is a public endpoint — it never throws, returns `{ user: null }` for unauthenticated callers. Use it when you can't run server-side code (e.g. a hydrated SPA route, or a static page that needs to upgrade after load):

```ts
const r = await fetch('/api/cms/me');
const { user } = (await r.json()) as { user: { id: string; role: string } | null };
```

This costs an extra HTTP round trip per page-load, so prefer the layout-loader pattern when possible.

## Production checklist

- **Generate a real `CMS_AUTH_SECRET`** — `bcms gen-secret 32`. Never reuse the example value.
- **Use a strong password** — `passwordAuth` rate-limits brute force, but a good password is the first defence. Consider `bcms hash-password` if you don't want plaintext in env dumps.
- **Switch the rate limiter** to a shared store (`upstashStore` or `durableObjectStore`) — the in-memory default resets on every deploy and doesn't share state across multiple instances.
- **Enable Turnstile** if the admin URL is publicly discoverable. The plugin demands a token after the configured number of failures.
- **Set `cookieSecure: true`** in production (the example template ties this to `NODE_ENV`).
