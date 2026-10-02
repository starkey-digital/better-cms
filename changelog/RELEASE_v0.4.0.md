# Release v0.4.0

**Released:** 2026-10-02
**Previous version:** v0.3.0

This release makes the admin something a non-technical editor can use on their own, and makes better-cms run on Cloudflare Workers. Fields now carry labels and help text, and they save as soon as the editor leaves them. Lists and photos have proper editors, and every screen works on a phone. Sign-in can go through better-auth, magic links included, and the whole stack has been run in workerd against libsql and S3.

There are a few breaking changes, listed below. Most projects only need to change `s3Media({ client })` (if they passed one) and their Svelte version.

## Breaking Changes

- **`s3Media` signs with aws4fetch.** The AWS SDK is gone. `s3Media({ client })` now takes an aws4fetch `AwsClient` instead of an `S3Client`. The `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` peers have been removed, so you can uninstall them. Other `s3Media` options and URLs behave as before.
- **In-memory rate limiting refuses to run on Workers.** `memoryStore()`, and `passwordAuth()` without a `rateLimit.store`, now throw on Cloudflare Workers. Each isolate there has its own counters, which makes limits and lockouts trivial to get around. Pass `libsqlStore(client)`, `durableObjectStore()` or `upstashStore()` instead. `memoryStore({ force: true })` still works for testing.
- **Upload folders are restricted.** The `folder` field on media uploads now only accepts `[A-Za-z0-9_-]` segments separated by `/`. Anything else returns a 400.
- **The admin needs Svelte 5.40 or later.**
- **`EditView` is no longer exported from `better-cms/admin`.** Use `RecordForm` instead.

## New Features

- **Field metadata from zod.**
  - `.meta({ label, description, placeholder, multiline, dateOnly, hidden, itemLabel })` drives the admin. `.describe()` also works for help text.
  - `z.url()` and `z.email()` are recognised automatically.
- **Collection options.** `label`, `description` and `admin: { title, sort, previewUrl, group, itemLabel }`. For example, `title: '{date} {venue}'` makes a show read "Sun 12 Jul 2026 The Ritz" in lists, instead of showing an ID.
- **A new admin editing experience.**
  - There is no Save button. A field saves when the editor leaves it, and a status strip says "All changes saved · 2:14pm" (or what went wrong).
  - New records are created as soon as their required fields are filled in.
  - Arrays of strings and objects get row editors with add, move and delete, so there are no more JSON textareas.
  - Deletes ask for confirmation, and errors appear next to the field in plain words.
  - `<CmsAdmin title>` replaces the better-cms branding.
  - "View on site" links come from `admin.previewUrl`.
  - On phones the menu becomes an off-canvas drawer, tap targets are at least 44px, and nothing scrolls sideways.
- **A photo library.**
  - Editors can choose an existing photo or upload a new one.
  - Photos are cropped and downscaled in the browser before upload, so a 6 MB phone photo is stored as a roughly 500 KB WebP.
  - A description is required for new uploads.
  - Crop shapes and maximum size can be set with `image().meta({ aspect, aspectLabel, maxSize })`.
  - New routes: `GET /media` (paginated, newest first) and `DELETE /media/:id`, with `mediaAccess.list` and `mediaAccess.delete` policies.
- **better-auth integration.**
  - `betterAuthContext(auth, { allow, map })` from `better-cms/auth/better-auth` maps a better-auth session to the CMS context.
  - The `emails` allowlist only admits verified addresses unless you set `allowUnverifiedEmails`.
  - The admin has a built-in magic-link sign-in screen: set the `magicLink`, `signInUrl` and `signOutUrl` props.
  - See `docs/guides/better-auth.md`.
- **Cloudflare Workers support.**
  - `libsqlStore(client)` stores rate-limit counters in your own database.
  - `libsqlAdapter({ client })` lets the adapter and the store share one client.
  - New `examples/sveltekit-cloudflare` and `docs/integrations/cloudflare-workers.md`.
- **List paging.** `listPage({ sort, limit, offset })` returns `{ rows, total, limit, offset }`. When no sort is given, it falls back to the collection's `admin.sort`. The existing `list()` is unchanged.
- **Automatic column migrations.** The libsql adapter adds missing columns on startup and never drops or alters existing ones. Turn this off with `migrate: false`.
- **Dates just work.** `z.date()` fields accept ISO strings without `z.coerce`, and `dateOnly` fields store a UTC calendar date.
- **SvelteKit 3.** Every example and the docs site now run on Kit 3, and the peer dependencies accept Kit `^2 || ^3`. `bcms init` detects the Kit major version and scaffolds `#lib` imports for Kit 3.
- `bcms hash-password --iterations=N`.

## Bug Fixes

- `lockoutMinutes` is now actually enforced. Previously the counter window reset after one minute regardless of the setting.
- Clearing an optional field, such as removing a photo, now saves. Previously the `null` was rejected.
- Uploading the same file twice no longer deletes the blob the first upload shares.
- The drizzle adapter now learns the schema even when `skipDDL` is set. Before this, queries threw.
- Test files are no longer compiled into published `dist` folders.

## Security

- Media upload `folder` values are validated, and the S3 adapter rejects `.` and `..` key segments. Before this, path-style endpoints could be steered into a different bucket.
- The example app refuses to auto-promote the first sign-in to admin in production unless `ADMIN_EMAILS` is set.
- File links in the admin only render for `http`/`https`/relative URLs.

## Upgrading

1. Remove the `@aws-sdk/*` packages. If you passed `s3Media({ client })`, pass an `AwsClient` from `aws4fetch` instead.
2. Upgrade to Svelte 5.40 or later.
3. On Workers, pass a shared `rateLimit.store`, for example `libsqlStore(client)`.
4. Optionally, add `.meta({ label, description })` to your schema fields and `admin: { title, sort }` to your collections. The admin picks them up with no other changes.
