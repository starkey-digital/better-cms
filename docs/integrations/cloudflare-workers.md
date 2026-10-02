# Deploying to Cloudflare Workers

better-cms runs on Cloudflare Workers with `@sveltejs/adapter-cloudflare`. A working app lives in [`examples/sveltekit-cloudflare`](https://github.com/starkey-digital/better-cms/tree/main/examples/sveltekit-cloudflare). It was run in local workerd (`wrangler dev`) against a self-hosted `sqld`: login, CRUD through `/api/cms/ops`, `/_meta`, rate limiting and S3 upload all worked.

What changes versus Node:

| Concern | On Workers |
| --- | --- |
| Config / secrets | `process.env`, populated from `vars` and secrets by `nodejs_compat` |
| Database | libsql over HTTP (`https://` or `http://` URL, never `file:`) |
| Rate limiting | `libsqlStore(client)`: a table in the CMS database |
| Media | `s3Media` signs with `aws4fetch` (WebCrypto), so R2, Wasabi, B2, MinIO and AWS all work |
| Password hashing | CPU budget matters, see "CPU budget" below |

## wrangler.jsonc

```jsonc
{
  "name": "my-cms",
  "main": ".svelte-kit/cloudflare/_worker.js",
  "compatibility_date": "2026-07-01",
  "compatibility_flags": ["nodejs_compat"],
  "assets": { "binding": "ASSETS", "directory": ".svelte-kit/cloudflare" },
  "vars": { "DATABASE_URL": "https://my-db-org.turso.io" }
}
```

- **`nodejs_compat`** is required: the SvelteKit integration scopes the request with `node:async_hooks`, and it is also what exposes `process.env`.
- **`compatibility_date` of `2025-04-01` or later** makes `process.env` populated from your bindings automatically (the `nodejs_compat_populate_process_env` behaviour). With an older date, add that flag by hand.
- The adapter goes in `vite.config.ts`; see [SvelteKit integration](/integrations/sveltekit). The example uses SvelteKit 3 and `@sveltejs/adapter-cloudflare` 8; the peer range also allows SvelteKit 2 (untested on Workers).

## Environment and secrets

Keep the config a plain module and read `process.env`, exactly as on Node. No `dotenv`, no factory, nothing Workers-specific:

```ts
// src/lib/cms/server/cms.ts
import { createClient } from '@libsql/client';
import { libsqlAdapter } from 'better-cms/adapters/libsql';
import { libsqlStore, passwordAuth } from 'better-cms/auth';
import { createCms } from 'better-cms/sveltekit/server';

const client = createClient({
  url: process.env.DATABASE_URL!,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

const password = passwordAuth({
  password: process.env.CMS_PASSWORD!,
  secret: process.env.CMS_AUTH_SECRET!,
  rateLimit: { store: libsqlStore(client) },
});

export const cms = createCms({
  collections: /* ... */,
  adapter: libsqlAdapter({ client }),
  plugins: [password],
  auth: { context: password.context },
});
```

Why `process.env` over the alternatives: it is the only option the CLI (`bcms generate`, `media:gc`, MCP) can also load, because those import this module outside Vite. `$env/dynamic/private` / `$app/env/private` only resolve inside SvelteKit, and `cloudflare:workers` only inside workerd.

Local development reads `.dev.vars` (wrangler's own file). `vite dev` runs in Node, so load that file in `vite.config.ts` to give both the same values:

```ts
try { process.loadEnvFile('.dev.vars'); } catch {}
```

Production values: non-secret ones in `vars`, the rest as secrets, never committed:

```sh
wrangler secret put CMS_AUTH_SECRET     # bcms gen-secret 32
wrangler secret put CMS_PASSWORD        # or CMS_PASSWORD_HASH, see below
wrangler secret put DATABASE_AUTH_TOKEN
```

**Build step.** SvelteKit imports your server modules during `vite build` to read page options, so a config that throws on a missing secret breaks a CI build that has none (secrets exist only in the Workers runtime). The example sets placeholders in `vite.config.ts` when `command === 'build'`; they are never baked into the bundle. Also avoid `prerender` remote functions that read the CMS: they would query the database at build time.

Two things to avoid at module scope on Workers: random-value generation (`crypto.getRandomValues`) and network calls are both forbidden outside a request. `createClient`, `libsqlAdapter` and `passwordAuth` do neither, so eager construction is fine. (`passwordAuth` used to PBKDF2-hash a plaintext `password` at import, which would have thrown here; it now compares SHA-256 digests.)

## Database: sqld and Turso

The libsql client automatically picks its web build under the `workerd` export condition, so `@libsql/client` works unchanged. Use an HTTP(S) URL:

- **Turso:** `https://<db>-<org>.turso.io` plus `DATABASE_AUTH_TOKEN` (`turso db tokens create <db>`).
- **Self-hosted sqld:** `https://sqld.example.com` (put it behind TLS), with a JWT as `DATABASE_AUTH_TOKEN` if you started it with auth. For local work: `sqld --http-listen-addr 127.0.0.1:8081 -d /tmp/bcms-sqld`, then `DATABASE_URL=http://127.0.0.1:8081`.
- `file:` URLs and `libsql://` over WebSocket are not for Workers; `https://` is the reliable transport.

Every request pays HTTP round trips to the database. Put the Worker near it (see Cloudflare smart placement) and keep `list` calls to what you render.

## Rate limiting

`passwordAuth` throttles logins. Its default `memoryStore()` keeps counters per isolate, and Workers run many isolates, so lockouts would be trivially bypassed. `passwordAuth` therefore throws at boot on Workers when no `rateLimit.store` is given, and `memoryStore()` refuses to run there unless you pass `{ force: true }` (testing only). Use `libsqlStore`:

```ts
rateLimit: { store: libsqlStore(client) }
```

It stores counters in a `bcms_rate_limit` table in your own database (created on first use with `CREATE TABLE IF NOT EXISTS`), one atomic upsert per attempt, so it is exact across isolates and needs no extra binding or service. Cost: one more round trip per login attempt. Alternatives: `upstashStore()`, or `durableObjectStore()` (needs your own Worker entry to export the `RateLimiter` class, which adapter-cloudflare does not support: its generated `_worker.js` can't export extra classes).

## Media: S3, R2 and Wasabi

`s3Media` uses `aws4fetch`, not the AWS SDK, so it adds no Node dependencies and works under workerd. The public API is unchanged. Credentials must be passed explicitly (or set `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` on Node).

```ts
// Cloudflare R2
s3Media({
  bucket: 'my-bucket',
  endpoint: `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  region: 'auto',
  accessKeyId: process.env.S3_ACCESS_KEY_ID,
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  publicBaseUrl: 'https://media.example.com', // r2.dev domain or custom domain
});

// Wasabi (use the real region)
s3Media({
  bucket: 'my-bucket',
  endpoint: 'https://s3.eu-central-1.wasabisys.com',
  region: 'eu-central-1',
  accessKeyId: process.env.S3_ACCESS_KEY_ID,
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
});

// AWS S3: omit endpoint; region defaults to us-east-1
s3Media({ bucket: 'my-bucket', region: 'eu-west-2', accessKeyId, secretAccessKey });
```

Notes:

- `url` on returned objects is `publicBaseUrl/key` when set, else `endpoint/bucket/key`, else the AWS virtual-hosted URL. R2 buckets are private until you add a custom domain or enable r2.dev, so set `publicBaseUrl`.
- Requests use path-style addressing whenever `endpoint` is set (override with `forcePathStyle`). Payloads are signed `UNSIGNED-PAYLOAD` over TLS.
- Uploads are buffered in memory (the handler already buffers and caps them at `maxBytes`, 10 MiB by default), within the Worker's memory limit.
- `presign()` returns SigV4 query-signed URLs, so the browser can fetch or upload directly.
- The `client` option now takes an `AwsClient` from `aws4fetch`, not an `S3Client`.

## CPU budget

Workers bill and limit CPU time, not wall time. Waiting on the database or S3 does not count; hashing does.

Measured in local workerd on an Apple-silicon laptop (production hardware differs; confirm with `wrangler tail` or the dashboard):

| Login path | Request time |
| --- | --- |
| `CMS_PASSWORD` (plaintext, SHA-256 digest compare) | about 5 ms wall, almost all of it two database round trips; CPU is around 1 ms |
| `CMS_PASSWORD_HASH`, 1,000 PBKDF2 iterations | 6 ms |
| 100,000 iterations (the default of `bcms hash-password`) | 16 ms (PBKDF2 itself about 10 ms) |
| 600,000 iterations | 63 ms |

PBKDF2-SHA256 costs roughly 0.1 ms CPU per 1,000 iterations.

- **Paid plan** (30 s default CPU limit): any setting is fine. The 100k default is comfortable; 600k (OWASP guidance) still costs about 60 ms per login, which is irrelevant at admin-login volumes.
- **Free plan** (10 ms CPU): 100k iterations does not fit, since hashing alone is about 10 ms before any other work, and a cold start also spends CPU on module evaluation. Either use the plaintext `CMS_PASSWORD` secret (no PBKDF2) or generate a hash with at most about 30,000 iterations: `bcms hash-password <pw> --iterations=30000`. Treat free-plan operation as unverified, because the real CPU figure must be read from production.
- Plaintext vs hash: both live in the same secret store, so a stored hash only helps if the password is reused elsewhere or the env leaks in a dump. `passwordHash` verification reads the iteration count embedded in the hash, so you can raise or lower it without code changes.
- The login endpoint adds an exponential backoff (up to 8 s) after repeated failures. It is a timer wait, not CPU, but it holds the request open.

## Not covered here

- Durable Objects with adapter-cloudflare (the generated worker cannot export classes).
- Live updates (`/_live`, SSE) across isolates were not tested.
