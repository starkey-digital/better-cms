# better-cms password auth

Drop-in single-password login for the CMS admin. Stateless signed cookies, pluggable rate-limit store, optional Cloudflare Turnstile.

## Quick start

```bash
bcms gen-secret           # → CMS_AUTH_SECRET
bcms hash-password        # prompts → CMS_PASSWORD_HASH
```

```ts
// src/lib/cms.config.ts
import { defineCMS, collection, text } from 'better-cms';
import { passwordAuth } from 'better-cms/sveltekit/auth';
import { libsqlAdapter } from 'better-cms/adapters/libsql';

const auth = passwordAuth({
  passwordHash: process.env.CMS_PASSWORD_HASH!,
  secret: process.env.CMS_AUTH_SECRET!,
  cookieTtl: '24h',
});

export default defineCMS({
  collections: {
    posts: collection({ fields: { title: text() } }),
  },
  adapter: libsqlAdapter({ url: process.env.DATABASE_URL! }),
  auth,
  plugins: [auth],
});
```

```svelte
<!-- src/routes/cms/+page.svelte -->
<script>
  import { CMSAdmin } from 'better-cms/admin';
  import config from '$lib/cms.config';
</script>

<CMSAdmin config={{ collections: config.collections, basePath: '/api/cms' }} auth />
```

## Endpoints

Mounted under `config.basePath` (default `/api/cms`):

| Method | Path      | Body                                   | Returns                                 |
| ------ | --------- | -------------------------------------- | --------------------------------------- |
| POST   | `/login`  | `{ password, turnstileToken? }`        | `200 {ok}` + cookie / `401` / `429`     |
| POST   | `/logout` | —                                      | `200 {ok}` + clears cookie              |
| GET    | `/me`     | —                                      | `{ user: {id, role} \| null }`          |

## Rate-limit stores

### In-memory (default — single process only)

```ts
// omit rateLimit.store entirely → memoryStore() with one-time warn
passwordAuth({ passwordHash, secret });
```

Fine for dev, single-instance Node/Bun, single Docker container. Throws hard error if Cloudflare Workers detected.

### Cloudflare Durable Object

```ts
import { passwordAuth, durableObjectStore, RateLimiter } from 'better-cms/sveltekit/auth';

passwordAuth({
  passwordHash,
  secret,
  rateLimit: { store: durableObjectStore(env.CMS_RATE_LIMIT) },
});

// Worker entry must export the DO class
export { RateLimiter } from 'better-cms/sveltekit/auth';
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
import { upstashStore } from 'better-cms/sveltekit/auth';

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
<CMSAdmin config={...} auth turnstileSiteKey={env.PUBLIC_TURNSTILE_SITE_KEY} />
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

Skip `passwordAuth` entirely — implement `getUser`:

```ts
defineCMS({
  auth: {
    getUser: async (request) => {
      const session = await yourAuthLib.getSession(request);
      return session?.user ?? null;
    },
  },
});
```

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
