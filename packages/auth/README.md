# better-cms password auth

Drop-in single-password login for the CMS admin. Stateless signed cookies, pluggable rate-limit store, optional Cloudflare Turnstile.

## Quick start

```bash
bcms gen-secret           # → CMS_AUTH_SECRET
bcms hash-password        # prompts → CMS_PASSWORD_HASH
```

```ts
// src/lib/cms/server/cms.ts
import { createCms } from 'better-cms/sveltekit/server';
import { passwordAuth } from 'better-cms/auth';
import { libsqlAdapter } from 'better-cms/adapters/libsql';
import { z } from 'zod';

const auth = passwordAuth({
  passwordHash: process.env.CMS_PASSWORD_HASH!,
  secret: process.env.CMS_AUTH_SECRET!,
  cookieTtl: '24h',
});

export const cms = createCms({
  collections: ({ collection }) => ({
    posts: collection({ schema: z.object({ title: z.string() }) }),
  }),
  adapter: libsqlAdapter({ url: process.env.DATABASE_URL! }),
  auth,
  plugins: [auth],
});

export default cms;
export type Cms = typeof cms;
```

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

<CmsAdmin client={cmsClient} auth />
```

## Endpoints

Mounted under `config.basePath` (default `/api/cms`):

| Method | Path      | Body                                   | Returns                                 |
| ------ | --------- | -------------------------------------- | --------------------------------------- |
| POST   | `/login`  | `{ password, turnstileToken? }`        | `200 {ok}` + cookie / `401` / `429`     |
| POST   | `/logout` | —                                      | `200 {ok}` + clears cookie              |
| GET    | `/auth/context` | —                                | `{ ctx: <AuthContextFn return> \| null }` (mounted by core; works for any auth provider) |

## Rate-limit stores

### In-memory (default — single process only)

```ts
// omit rateLimit.store entirely → memoryStore() with one-time warn
passwordAuth({ passwordHash, secret });
```

Fine for dev, single-instance Node/Bun, single Docker container. On Cloudflare Workers it still runs but each isolate keeps its own counters, so the limit is best-effort — use `libsqlStore` there.

### Your own libsql database (recommended on Workers)

No extra service: one small table (`bcms_rate_limit`, created on first use) in the database the CMS already uses. Each increment is a single atomic upsert, so the count is correct across isolates.

```ts
import { createClient } from '@libsql/client';
import { libsqlAdapter } from 'better-cms/adapters/libsql';
import { passwordAuth, libsqlStore } from 'better-cms/auth';

const client = createClient({ url: process.env.DATABASE_URL!, authToken: process.env.DATABASE_AUTH_TOKEN });

passwordAuth({
  passwordHash,
  secret,
  rateLimit: { store: libsqlStore(client) },
});
// adapter: libsqlAdapter({ client })
```

Costs one extra DB round trip per login attempt. Options: `table`, `sweepProbability` (chance an increment also prunes expired rows, default `0.02`).

### Cloudflare Durable Object

```ts
import { passwordAuth, durableObjectStore, RateLimiter } from 'better-cms/auth';

passwordAuth({
  passwordHash,
  secret,
  rateLimit: { store: durableObjectStore(env.CMS_RATE_LIMIT) },
});

// Worker entry must export the DO class
export { RateLimiter } from 'better-cms/auth';
```

`wrangler.toml`:

```toml
[[durable_objects.bindings]]
name = "CMS_RATE_LIMIT"
class_name = "RateLimiter"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["RateLimiter"]
```

### Upstash Redis (multi-instance Node, Vercel, Lambda)

```ts
import { upstashStore } from 'better-cms/auth';

passwordAuth({
  passwordHash,
  secret,
  rateLimit: {
    store: upstashStore({ url: env.UPSTASH_URL, token: env.UPSTASH_TOKEN }),
  },
});
```

REST-only — no `@upstash/redis` dependency, works on Workers/edge.

## Defaults

| Option                     | Default    |
| -------------------------- | ---------- |
| `cookieName`               | `bcms_session` |
| `cookieTtl`                | `24h` (`s`/`m`/`h`/`d` units) |
| `cookieSecure`             | `true` |
| `userId`                   | `admin` |
| `rateLimit.perIp`          | `5 / 1m` |
| `rateLimit.global`         | `100 / 1m` |
| `rateLimit.lockoutMinutes` | `15` |
| `turnstile.after`          | `3` (failed attempts before requiring token) |

Exceeding `perIp.max` locks that IP out for `lockoutMinutes` (measured from the moment it trips, independent of the 1-minute counter window); `retry-after` reports the time left. Built-in stores keep the lock themselves. A custom `RateLimitStore` can implement the optional `lock(key, ttlSec)` / `lockedUntil(key)` pair for a lockout shared across instances; without them the lockout is per-process.

Exponential backoff (`250ms × 2^(n-1)`, capped at `8s`) is applied per failed attempt and is not configurable.

## Turnstile (optional)

```ts
passwordAuth({
  passwordHash,
  secret,
  turnstile: {
    siteKey: env.TURNSTILE_SITE_KEY,
    secret: env.TURNSTILE_SECRET,
    after: 3,
  },
});
```

```svelte
<CmsAdmin client={cmsClient} auth turnstileSiteKey={env.PUBLIC_TURNSTILE_SITE_KEY} />
```

After 3 failed login attempts per IP, the server requires a valid Turnstile token. Admin UI auto-loads the widget script and submits the token in the next attempt.

## State

Zero database tables. Required env vars:

| Var                  | Purpose                                                     |
| -------------------- | ----------------------------------------------------------- |
| `CMS_PASSWORD_HASH`  | `pbkdf2$sha256$100000$<salt-b64url>$<hash-b64url>`          |
| `CMS_AUTH_SECRET`    | ≥16 chars, used to HMAC-sign session cookies                |

Optional:
- `UPSTASH_URL` / `UPSTASH_TOKEN` if using `upstashStore()`
- `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET` if using Turnstile

Rotating `CMS_AUTH_SECRET` invalidates every active session.

## BYOA (bring your own auth)

Skip `passwordAuth` entirely — supply any `AuthContextFn`:

```ts
import type { AuthContextFn } from 'better-cms';

type AppCtx = { user: { id: string; email: string } } | null;

const context: AuthContextFn<AppCtx> = async (request) => {
  const session = await yourAuthLib.getSession(request);
  if (!session?.user) return null;
  return { user: { id: session.user.id, email: session.user.email } };
};

createCms({
  auth: { context },
  access: {
    create: (ctx) => ctx !== null,
    update: (ctx) => ctx !== null,
    delete: (ctx) => ctx !== null,
  },
  // ...
});
```

`Ctx` is whatever shape your auth library returns — `{ session, user, organization }`, `{ tenantId, user }`, anything. `createCms` infers it from `auth.context`, so `access` and `hooks` are typed everywhere without a manual generic. See [docs/concepts/auth.md](../../docs/concepts/auth.md) for the full BYOA walkthrough.

## Hooks

```ts
passwordAuth({
  passwordHash,
  secret,
  onFailedAttempt: ({ ip, count, reason }) => {
    // 'per-ip' | 'global' | 'turnstile' | 'bad-password'
    console.warn('cms login fail', ip, count, reason);
  },
});
```
