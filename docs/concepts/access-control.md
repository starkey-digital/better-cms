# Access control

Access policies decide who can list, read, create, update, or delete each collection. Authentication ([auth.md](./auth.md)) resolves the request to a `Ctx`; access functions consume that `Ctx` and decide.

Access policies and lifecycle hooks live on the **server config**, not on the collection definition itself. This keeps server-only closures (db handles, secrets, side-effect imports) out of the browser bundle entirely. The collection schema in `schemas.ts` stays browser-safe; server-only logic lives in `server/cms.ts`.

Five verbs, five separate slots:

| Verb | When it fires | Default |
|---|---|---|
| `list` | `GET /collections/:name` (any list query) | allow |
| `read` | `GET /collections/:name/:id`, `GET /singletons/:name` | allow |
| `create` | `op: 'create'` via `/ops` or `serverApi` | deny |
| `update` | `op: 'set'`, `'patch'`, `'append'`, `'move'`, path-based `'remove'` | deny |
| `delete` | `op: 'remove'` (no path) | deny |

Reads default to public, writes default to deny. Override either at the global or per-collection level.

## Global policy

Set on `defineCMS({ access })`. Applies to every collection unless overridden.

```ts
// server/cms.ts
defineCMS({
  collections,
  access: {
    list: () => true,
    read: () => true,
    create: (ctx) => ctx?.user.role === 'admin',
    update: (ctx) => ctx?.user.role === 'admin',
    delete: (ctx) => ctx?.user.role === 'admin',
  },
});
```

## Per-collection override

`defineCMS({ serverCollections })` carries per-collection access (and hooks) keyed by collection name. Each verb falls through to the global slot if not specified.

```ts
defineCMS({
  collections,
  access: {
    /* global rules — admin-only writes */
  },
  serverCollections: {
    secrets: {
      access: {
        list: (ctx) => ctx?.user.role === 'admin',
        read: (ctx) => ctx?.user.role === 'admin',
      },
    },
    posts: {
      access: {
        update: (ctx, doc) => ctx?.user.id === doc.authorId,
        // create / delete inherit from global
      },
    },
  },
});
```

Resolution order, per verb:

1. `serverCollections[name].access[verb]` if defined → use it.
2. Else `config.access[verb]` if defined → use it.
3. Else the default (allow for `list`/`read`, deny for writes).

## Function signature

```ts
type AccessFn<Ctx, Doc> = (ctx: Ctx, doc?: Doc) => boolean | Promise<boolean>;
```

- `ctx` is whatever your `auth.context(request)` returned. With `createCms<Ctx>()` it's typed.
- `doc` is the row being acted on:
  - `read` / `update` / `delete` — the existing row (loaded before the check). Typed as `RowOf<C[K]>` per collection, so `doc.authorId` autocompletes.
  - `create` — undefined (no row exists yet; check the input on the calling side if needed).
  - `list` — undefined (filtering individual rows is out of scope; see followups).

Async is fine — fetch related rows, hit a permissions service, whatever. Just keep it cheap; `read` and `list` run on every page-load.

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
serverCollections: {
  posts: {
    access: {
      update: (ctx, doc) =>
        doc?.authorId === ctx?.user.id || ctx?.user.role === 'admin',
      delete: (ctx, doc) => doc?.authorId === ctx?.user.id,
    },
  },
}
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

- HTTP API routes (`/collections/*`, `/singletons/*`, `/ops`) — every read/write goes through `checkAccess`.
- `serverApi` writes (`cms.posts.create(...)` etc.) — gated identically; the user's `auth.context` is resolved from the request scope.
- `serverApi` reads (`cms.posts.list({...})`, `cms.posts.find(id)`) — bypass access checks. The calling server code is trusted; it can decide whether to surface the rows. This matches how a Drizzle query bypasses your route handlers.

## Why server-only?

Per-collection `access` and `hooks` reference server-runtime state — db handles, auth helpers, side-effect imports. Living on `serverCollections` (not on the collection in `schemas.ts`) means:

- The collection definition stays JSON-serializable and tree-shakeable.
- The browser bundle never imports server-only modules. Vite's tree-shaker doesn't have to be relied on for closure capture — the functions are simply not in the import graph.
- `import type { AppCtx } from '../server/cms'` from `client.ts` works because TypeScript erases type-only imports before the bundler runs.

## Followups

- Row-level list filtering (`list: (ctx) => Where`) — return only rows that match a predicate. Today, `list` is allow-all-or-nothing.
- `merge` op for partial-document updates (single round trip instead of N `patch` ops).
- Optimistic concurrency (`if-match` / revision tokens) to pair with `merge`.
