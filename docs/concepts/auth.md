# Authentication

better-cms is bring-your-own-auth. The core knows nothing about users — wire any auth provider (the bundled `passwordAuth` plugin, your own session resolver, better-auth, JWT, NextAuth) by giving the CMS a `context(request)` function that returns whatever shape your app uses.

Authorization (who can read/write each collection) is a separate layer — see [Access control](./access-control.md). Hooks for lifecycle side-effects are in [Hooks](./hooks.md).

## File layout

Three files, one source of truth per concern:

```
src/lib/cms/
├── schemas.ts          # browser-safe — collections + basePath
├── server/
│   └── cms.ts          # server-only — adapter, auth, access, hooks, AppCtx
└── client.ts           # browser-safe — uses `import type` to lift AppCtx
```

`schemas.ts` is imported by both server and browser. `server/cms.ts` is server-only — SvelteKit's `$lib/.../server/` guard rejects browser-side runtime imports. `client.ts` imports the runtime values from `schemas.ts` and the `AppCtx` *type* from `server/cms.ts` via `import type` (TypeScript erases type-only imports before Vite bundles, so no server runtime ships to the browser).

## The auth contract

```ts
type AuthContextFn<Ctx> = (request: Request) => Ctx | Promise<Ctx>;

defineCMS({
  auth: { context: (req) => /* resolve to your Ctx shape */ },
  ...
});
```

`Ctx` is whatever your app needs — typically `{ user: { id, role } } | null`, but nothing forces a `user` field. The same value flows into every access policy, every lifecycle hook, and `cms.auth.context()` in your route handlers.

To pin `Ctx` once for the whole CMS, use `createCms<Ctx>()`:

```ts
import { createCms } from 'better-cms/zod';

type AppCtx = { user: { id: string; role: 'admin' | 'editor' } } | null;
const { defineCMS } = createCms<AppCtx>();
```

`access` policies, `hooks`, `auth.context`, and `serverCollections[*].access/hooks` slots on the resulting `defineCMS` are all typed against `AppCtx`.

## Bundled `passwordAuth`

The bundled plugin handles the common case: a single admin password protected by a signed cookie session. Wire it as both a plugin (mounts `/login` and `/logout` endpoints) and an auth context provider.

### `schemas.ts` (browser-safe)

```ts
import { collection, image, richText, singleton, slug } from 'better-cms/zod';
import { z } from 'zod';

export const PostSchema = z.object({
  title: z.string().min(1).max(120),
  slug: slug(),
  body: richText().optional(),
  cover: image().optional(),
  published: z.boolean().default(false),
});

export const posts = collection({ schema: PostSchema });
export const collections = { posts };
export const basePath = '/api/cms' as const;
```

### `server/cms.ts` (server-only)

```ts
import 'dotenv/config';
import type { AuthContextFn } from 'better-cms';
import { libsqlAdapter } from 'better-cms/adapters/libsql';
import { passwordAuth } from 'better-cms/sveltekit/auth';
import { createCms as createServerCms } from 'better-cms/sveltekit/server';
import { createCms } from 'better-cms/zod';
import { basePath, collections } from '../schemas';

export type AppCtx = { user: { id: string; role: 'admin' | 'editor' } } | null;

const { defineCMS } = createCms<AppCtx>();

const password = passwordAuth({
  password: process.env.CMS_PASSWORD!,
  secret: process.env.CMS_AUTH_SECRET!,
  cookieSecure: process.env.NODE_ENV === 'production',
});

const context: AuthContextFn<AppCtx> = async (request) => {
  const ctx = await password.context(request);
  if (!ctx) return null;
  return { user: { id: ctx.user.id, role: 'admin' } };
};

const config = defineCMS({
  collections,
  basePath,
  adapter: libsqlAdapter({ url: process.env.DATABASE_URL! }),
  plugins: [password],
  auth: { context },
  access: {
    list: () => true,
    read: () => true,
    create: (ctx) => ctx?.user.role === 'admin',
    update: (ctx) => ctx?.user.role === 'admin',
    delete: (ctx) => ctx?.user.role === 'admin',
  },
  serverCollections: {
    posts: {
      hooks: {
        beforeDelete: ({ prev }) => {
          if (prev?.published) throw new Error('unpublish first');
        },
      },
    },
  },
});

export default config;
export const cms = createServerCms(config);
```

### `client.ts` (browser-safe)

```ts
import { clientCmsConfig, createCmsClient } from 'better-cms/sveltekit';
import { basePath, collections } from './schemas';
import type { AppCtx } from './server/cms';   // type-only — erased

export const cmsConfig = clientCmsConfig<typeof collections, AppCtx>({ collections, basePath });
export const cmsClient = createCmsClient(cmsConfig);
//      ^? CmsClient<typeof collections, AppCtx>
//         - posts/settings typed from RowOf<C[K]>
//         - auth.context() returns Promise<AppCtx | null>
```

`passwordAuth(opts)` returns a CmsPlugin that mounts `/login` + `/logout` HTTP endpoints and exposes a `context(request)` function. Pass `password.context` directly if you don't need to remap the shape, or wrap it (as above) to attach role/org/etc.

### `passwordAuth` options

| Field | Type | Default | Notes |
|---|---|---|---|
| `password` | `string` | — | Plain-text admin password. Hashed once at boot. Mutually exclusive with `passwordHash`. |
| `passwordHash` | `string` | — | Pre-hashed password (`bcms hash-password <pw>`). Use when you don't want the plain credential to appear in env dumps. |
| `secret` | `string` | — | HMAC key for signing session cookies. ≥16 chars. Generate with `bcms gen-secret 32`. |
| `cookieName` | `string` | `bcms_session` | Override if you have multiple CMSes on one domain. |
| `cookieTtl` | `string \| number` | `24h` | Accepts `'7d'`, `'1h'`, or seconds as a number. |
| `cookieSecure` | `boolean` | `true` | Set to `false` for local dev over HTTP. |
| `userId` | `string` | `admin` | The `id` placed into `context`'s return value. |
| `rateLimit` | object | in-memory | Per-IP and global throttles. Pass `durableObjectStore()` or `upstashStore()` for production. |
| `turnstile` | object | — | Cloudflare Turnstile after N failed attempts. |
| `onFailedAttempt` | callback | — | Audit hook for security logging. |

## Login flow

1. The user opens `/cms`. The admin component (`<CmsAdmin auth />`) calls `GET /api/cms/auth/context` — returns `{ ctx: null }` until they sign in.
2. The login screen `POST`s `{ password }` to `/api/cms/login`. A successful response sets the `bcms_session` cookie.
3. The admin re-fetches `/auth/context`, sees a non-null `ctx`, and renders the editor. Subsequent ops (`POST /api/cms/ops`) carry the cookie automatically.
4. `POST /api/cms/logout` clears the cookie.

The cookie is HttpOnly, SameSite=Lax, and signed with `secret` — tampering invalidates the session. Format: a JWT-like `{ uid, exp }` payload, HMAC-SHA256 signature.

## Reading the session anywhere

`cms.auth.context()` resolves the active request via `cmsHandle`'s AsyncLocalStorage scope, then calls your configured `auth.context(request)`. Cheap to call repeatedly; cache once per request via the layout loader.

```ts
// src/routes/+layout.server.ts
import { cms } from '$lib/cms/server/cms';

export async function load() {
  const ctx = await cms.auth.context();
  return { ctx };
}
```

For commands that should reject anonymous callers, use `cms.auth.requireContext()` — same as `context()` but throws when the resolved ctx is null.

```ts
// src/lib/cms/cms.remote.ts
export const togglePublished = command(ToggleInput, async ({ id, published }) => {
  await cms.auth.requireContext();
  return cms.posts.update(id, { published });
});
```

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  let { data, children } = $props();
</script>

<nav>
  {#if data.ctx}
    <a href="/cms">Admin</a>
  {:else}
    <a href="/cms">Sign in</a>
  {/if}
</nav>

{@render children()}
```

## Reading the session from the client

`/api/cms/auth/context` is a public endpoint — never throws, returns `{ ctx: null }` for unauthenticated callers. Use when you can't run server-side code (a hydrated SPA route, a static page that upgrades after load):

```ts
const r = await fetch('/api/cms/auth/context');
const { ctx } = (await r.json()) as { ctx: { user: { id: string } } | null };
```

This costs an extra HTTP round trip per page-load — prefer the layout-loader pattern when possible.

The browser-safe `cmsClient.auth.context()` is typed against `AppCtx` thanks to the `import type` propagation in `client.ts` — no `as` casts needed:

```ts
import { cmsClient } from '$lib/cms/client';

const ctx = await cmsClient.auth.context();
//    ^? AppCtx | null
if (ctx?.user.role === 'admin') { /* fully typed */ }
```

## Bringing your own auth

`passwordAuth` is one provider — any function `(request: Request) => Ctx | Promise<Ctx>` works. Common shapes:

- **better-auth / NextAuth / Lucia / Auth.js** — read the session cookie inside `context`, return `{ session, user, organization }` (or whatever your auth library exposes).
- **JWT bearer** — parse `Authorization: Bearer <token>`, verify, return `{ user }`.
- **Reverse-proxy headers** — read `X-Forwarded-User` or similar, return `{ user: { id } }`.
- **Multi-tenant** — derive `tenantId` from the host or a cookie, return `{ tenant, user }`.

Whatever shape you return becomes the `ctx` argument in every `access` function and lifecycle hook. Your `Ctx` shape is the contract.

## Production checklist

- **Generate a real `CMS_AUTH_SECRET`** — `bcms gen-secret 32`. Never reuse the example value.
- **Use a strong password** — `passwordAuth` rate-limits brute force, but a good password is the first defence. Consider `bcms hash-password` if you don't want plaintext in env dumps.
- **Switch the rate limiter** to a shared store (`upstashStore` or `durableObjectStore`) — the in-memory default resets on every deploy and doesn't share state across multiple instances.
- **Enable Turnstile** if the admin URL is publicly discoverable. The plugin demands a token after the configured number of failures.
- **Set `cookieSecure: true`** in production (the example template ties this to `NODE_ENV`).
