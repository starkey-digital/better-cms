# Access control

Access policies decide who can read, create, update, or delete each collection. Authentication ([auth.md](/concepts/auth)) resolves the request to a `Ctx`; access functions consume that `Ctx` and decide.

The CMS config is server-only, so policies can close over server state (db handles, secrets, auth helpers) freely.

Four verbs, four separate slots:

| Verb | When it fires | Default |
|---|---|---|
| `read` | `list`, `find`, `get`, `count`, and the matching `GET` routes | allow |
| `create` | `op: 'create'` | deny |
| `update` | `op: 'set'`, `'patch'`, `'append'`, `'move'`, path-based `'remove'` | deny |
| `delete` | `op: 'remove'` (no path) | deny |

Reads default to public, writes default to deny. Override either at the global or per-collection level.

## Global policy

Set on `createCms({ access })`. Applies to every collection unless overridden.

```ts
// src/lib/cms/server/cms.ts
createCms({
  collections,
  access: {
    read: () => true,
    create: (ctx) => ctx?.user.role === 'admin',
    update: (ctx) => ctx?.user.role === 'admin',
    delete: (ctx) => ctx?.user.role === 'admin',
  },
});
```

## Per-collection override

Pass `access` to the collection itself. Each verb falls through to the global slot if not specified.

```ts
createCms({
  collections: ({ collection }) => ({
    secrets: collection({
      schema: SecretSchema,
      access: { read: (ctx) => ctx?.user.role === 'admin' },
    }),
    posts: collection({
      schema: PostSchema,
      access: {
        update: (ctx, doc) => ctx?.user.id === doc.authorId,
        // create / delete inherit from global
      },
    }),
  }),
  access: {
    /* global rules — admin-only writes */
  },
});
```

Resolution order, per verb:

1. `collection({ access })[verb]` if defined → use it.
2. Else `config.access[verb]` if defined → use it.
3. Else the default (allow for `read`, deny for writes).

## Function signature

```ts
type AccessFn<Ctx, Doc> = (ctx: Ctx, doc?: Doc) => boolean | Promise<boolean>;
```

- `ctx` is whatever your `auth.context(request)` returned. With `createCms<Ctx>()` it's typed.
- `doc` is the row being acted on:
  - `update` / `delete`, and `read` via `find` / `get` / a singleton — the existing row (loaded before the check). Typed as `RowOf<C[K]>` per collection, so `doc.authorId` autocompletes.
  - `create` — undefined (no row exists yet; check the input on the calling side if needed).
  - `read` via `list` / `count` — undefined (per-row filtering is out of scope; see followups).

Async is fine — fetch related rows, hit a permissions service, whatever. Just keep it cheap; `read` runs on every page-load.

## 404 instead of 403 on read

When `read` denies, the handler returns 404 — *not* 403. This avoids leaking the existence of rows the caller can't see. Writes still return 403 (the caller already knows which row they're targeting).

```ts
// anonymous user
GET /api/cms/collections/secrets/abc-123
→ 404 Not Found    // even though abc-123 exists
```

## Owner-only patterns

Use `doc` for row-level decisions:

```ts
posts: collection({
  schema: PostSchema,
  access: {
    update: (ctx, doc) => doc?.authorId === ctx?.user.id || ctx?.user.role === 'admin',
    delete: (ctx, doc) => doc?.authorId === ctx?.user.id,
  },
}),
```

## Anonymous Ctx

Your `Ctx` shape decides what "anonymous" looks like. The convention is `Ctx | null` where `null` means anon — access functions guard with `ctx?.` chains:

```ts
type AppCtx = { user: { id: string; role: 'admin' | 'editor' } } | null;

access: {
  read: (ctx) => ctx !== null,            // any signed-in user
  create: (ctx) => ctx?.user.role === 'admin',
}
```

If your auth always returns a non-null ctx (e.g. `{ user: User } | { kind: 'anon' }`), narrow on the discriminator instead.

## Where checks fire

Everywhere. Reads and writes share one implementation in `@better-cms/core`, so there is no transport that skips a policy:

- HTTP routes (`/collections/*`, `/singletons/*`, `/ops`) — every read and write is checked.
- `cms.posts.create(...)` / `update` / `delete` — checked, with `ctx` resolved from the active request.
- `cms.posts.list(...)` / `find` / `get` / `count` — also checked. A denied read throws; it does not silently return rows.

This matters most in remote functions: `query(() => cms.secrets.list())` compiles to a public HTTP endpoint, so a server-side read that skipped its policy would publish the collection.

`read` is evaluated once per call. `find`, `get`, and singleton reads pass the resolved document, so a policy can inspect it; `list` and `count` evaluate without one, so express row-level filtering as a `where` clause rather than a document-dependent `read` policy.

A read denied by policy is reported over HTTP as `404`, not `403`, so the API never confirms that a hidden record exists. In-process callers get a thrown `CmsError` with `FORBIDDEN`.

## Media uploads

`POST /media` has its own policy, separate from the four collection verbs:

```ts
createCms({
  media: s3Media({ /* ... */ }),
  mediaAccess: {
    upload: (ctx) => ctx?.user.role === 'admin',   // defaults to deny
    maxBytes: 10 * 1024 * 1024,                    // default
    mimeTypes: ['image/*', 'application/pdf'],     // default
  },
});
```

Uploading is **denied unless `mediaAccess.upload` allows it**, and it is deliberately not inferred from collection `create` policies. Permission to submit a comment says nothing about permission to write arbitrary bytes into your asset bucket — equating the two would turn any publicly-writable collection into open file hosting.

`maxBytes` and `mimeTypes` default to something restrictive for the same reason; set `maxBytes: 0` or `mimeTypes: []` to opt out of either check deliberately.

## Why server-only?

`access` and `hooks` reference server-runtime state — db handles, auth helpers, side-effect imports — so the whole CMS config lives under `src/lib/server/` (or `src/lib/cms/server/`), where SvelteKit's import guard keeps it out of client bundles.

The admin UI never receives it. `<CmsAdmin client={cmsClient} />` fetches editor metadata from `GET /_meta`, which serves only static field descriptors — no validators, policies, or hooks cross to the browser.

`import type { Cms } from './server/cms'` from `client.ts` is still fine: TypeScript erases type-only imports before the bundler runs.

## Followups

- Row-level list filtering (`read: (ctx) => Where`) — return only rows matching a predicate. Today a `list` read is allow-all-or-nothing.
- `merge` op for partial-document updates (single round trip instead of N `patch` ops).
- Optimistic concurrency (`if-match` / revision tokens) to pair with `merge`.
