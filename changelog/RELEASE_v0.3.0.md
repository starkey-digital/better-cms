# Release v0.3.0

**Released:** 2026-07-26
**Previous version:** v0.2.0

The largest release so far, and a breaking one. Collections are now defined by writing a zod schema rather than calling field builders, the server and HTTP APIs have been collapsed into a single implementation, and auth has moved into its own package. Two of the bugs fixed here were data-visibility and data-loss issues that are worth reading before you upgrade — see **Security** and **Bug Fixes**.

Upgrading requires code changes in every project. There is no deprecation window; `v0.x` moves fast by design.

## Breaking Changes

- **Collections are schema-first.** The field-builder DSL (`text()`, `boolean()`, `number()`, …) is gone. Define a collection with a zod schema instead:

  ```ts
  // before
  collection({ fields: { title: text({ required: true }), published: boolean() } })

  // after
  collection({ schema: z.object({ title: z.string().min(1), published: z.boolean().default(false) }) })
  ```

  `richText()`, `image()`, `file()`, `slug()`, `relation()`, `unique()` and `indexed()` survive as schema helpers and now come from `better-cms/zod`. `z.infer<typeof Schema>` is the canonical row type.

- **`defineCMS` → `createCms`.** The server entry point is `createCms(config)` from `better-cms/sveltekit/server`, returning a typed API (`cms.posts.list()`, `cms.settings.get()`). `serverApi` and the `cms()` singleton are removed.

- **The CMS config is server-only.** It belongs at `src/lib/cms/server/cms.ts`. The `server/` path segment is what keeps it out of the client bundle, so adapters are constructed eagerly — no factory wrappers or env injection. The previous `AdapterFactory` / `(env) => …` contract is removed.

- **The admin takes a client, not a config.** `<CmsAdmin client={cmsClient} />`. `clientCmsConfig()` and `ClientCmsConfig` are removed; the admin fetches field metadata from `GET /_meta` instead. No config slice reaches the browser and there is no client codegen step — `generate --target=client` is gone.

- **The SvelteKit package is split by environment.** `better-cms/sveltekit` is browser-safe (`createCmsClient`); server helpers live at `better-cms/sveltekit/server` (`createCms`, `cmsHandle`). The `better-cms/sveltekit/remote` subpath is removed — remote functions are written in your own app.

- **Auth moved to `@better-cms/auth`**, imported as `better-cms/auth`. Authentication is now bring-your-own: `auth.context(request)` returns any shape you like, and `passwordAuth()` is one implementation of it rather than the only option.

- **Database drivers and storage SDKs are optional peer dependencies.** Installing `better-cms` no longer drags in the AWS S3 SDK and a libSQL client you may not use — that was 53 packages and roughly 40 MB of forced install. Add the one your config uses:

  | If your config uses | also install |
  | --- | --- |
  | `libsqlAdapter` | `@libsql/client` |
  | `drizzleAdapter` | `drizzle-orm` and your driver |
  | `s3Media` | `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` |

  `bcms init` installs `@libsql/client` for the scaffold it generates. (#5)

- **Acronyms follow PascalCase-as-word.** `CMSAdmin` → `CmsAdmin`, `clientCMSConfig` → the removed client config, and similar across the API surface.

## New Features

- **`@better-cms/zod`** — a new package holding the schema-first DSL, the zod-to-IR walker, and the field helpers. Core never imports zod, so other validator adapters can follow the same contract later.
- **Per-collection access policies and lifecycle hooks.** `access.{read,create,update,delete}` and `before`/`after` hooks for each write, resolved per collection with a global fallback. Reads default to allow, writes to deny.
- **Standard Schema validators on every collection.** `def.schemas.{create,update,full,form}` are derived from your zod schema and drop straight into SvelteKit `form()`/`command()`, tRPC, or anywhere Standard Schema is accepted. `form` adds FormData coercion.
- **Rebuilt admin UI** — hash routing (`#/posts`, `#/posts/new`, `#/posts/<id>`), dedicated edit pages, and a CSS custom-property theme on `.bcms` you can override with a stylesheet.
- **`bcms media:gc`** — lists the bucket, diffs it against `cms_media`, and reports objects nothing references. Reports by default; `--apply` deletes. Objects newer than `--min-age-hours` (default 24) are spared so an in-flight upload is never swept.
- **Content-addressed upload keys.** Uploads are keyed by the SHA-256 of their bytes, so a client retrying a failing upload overwrites the same object rather than stranding a copy per attempt, and the same asset uploaded twice occupies one object.
- **`GET /_meta`** serves browser-safe editor metadata, which is what lets the admin work without any generated client.
- **Typed relations.** `relation(authors)` takes the collection definition (or a thunk for forward references), not a string. Unregistered targets throw at startup instead of becoming silent orphan foreign keys.

## Security

- **Server-side reads now enforce access policies.** Previously `cms.<collection>.list()` and friends skipped `checkAccess` entirely, so a collection whose `access.read` denied returned 404 over HTTP but was **fully readable in-process**. This mattered in practice because a remote `query()` compiles to a public endpoint — the documented pattern published the collection. All reads now go through the same check. If you relied on server code bypassing your own read policy, it will now be denied.
- **Media uploads have their own default-deny policy.** `config.mediaAccess.upload` gates `POST /media`, alongside `maxBytes` (default 10 MiB) and `mimeTypes` (default images plus PDF). Upload rights are never inferred from a collection's `create` policy — otherwise a publicly-writable collection would have made the bucket anonymously writable.
- Reads denied by policy surface as 404 over HTTP rather than 403, so a denied row's existence is not disclosed.

## Bug Fixes

- **The server API and the HTTP API returned different data for the same rows.** They were two implementations of one contract and had drifted: in-process reads returned raw column values (`published: 1`, tags as a JSON string, `createdAt` as a number) while HTTP returned decoded ones — under the same `RowOf<C>` type annotation. Both now go through one implementation. (#4 follows from the same audit.)
- **Partial updates silently reset defaulted fields.** Because `.partial()` leaves zod's `.default()` in place, a patch touching only `title` parsed back as `{ title, published: false }` and wrote that over the stored value — unpublishing a post on an unrelated edit. Any collection with a `.default()` field was affected. (#4)
- **`POST /media` was never routed.** The client and the admin's image field posted into a 404, which made `media-s3` and `image()` non-functional at runtime.
- **A second `cms(config)` call silently returned the first CMS**, so an app mounting more than one instance got the wrong one.
- **Clearing an optional field crashed the driver.** `serializeRow` passed present-but-`undefined` straight through; it now maps to SQL `null`.
- **Request-scoped auth context is cached per (request, config)**, not per request. With several mounted CMS instances a single per-request entry handed the second one the first one's identity and authorised the wrong tenant.
- **Where-clauses are pushed through the same field codecs as writes**, so `where: { published: true }` matches a SQLite integer column instead of silently matching nothing. Multi-operator conditions like `{ gte, lte }` are handled as ranges rather than being re-encoded as an equality against the object.
- **Internal packages ship built `dist/` rather than raw TypeScript**, fixing type resolution and bundling for consumers.
- Repaired dead cross-links in the documentation, which had been broken since shortly after v0.2.0 and would have failed the docs deploy on this release.

## Internal

- The release script publishes in dependency order and aborts on the first failure. `better-cms` re-exports all eight internals and was previously published before some of them, putting a version on npm whose own dependencies could not resolve. (#6)
- CI now runs the unit tests, a packaging dry run, and a docs build on every pull request.
