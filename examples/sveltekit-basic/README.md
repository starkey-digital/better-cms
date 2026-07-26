# better-cms · sveltekit-basic example

Minimal SvelteKit app using `better-cms` with libsql: two collections, one singleton, remote functions, and the drop-in admin UI.

## Run

```sh
bun install
cp .env.example .env
bun run --filter './packages/*' build   # build the workspace pkgs first (one-time)
bun run dev
```

Open:
- <http://localhost:5173> — public site
- <http://localhost:5173/cms> — admin UI

The libsql adapter creates `local.db` and the schema automatically on first request — no `drizzle-kit push` needed for this example.

## What's wired

- `src/lib/cms/server/cms.ts` — collections (`posts`, `authors`), singleton (`settings`), and an admin-only `secrets` collection used to demonstrate access policies. Server-only.
- `src/lib/cms/cms.remote.ts` — remote functions: `query`, `query.batch`, `prerender`, `command`, and `form`
- `src/lib/cms/client.ts` — HTTP client, used by the admin UI only
- `src/hooks.server.ts` — `cmsHandle` opens the request scope and mounts the API under `/api/cms`
- `src/routes/+page.server.ts` — SSR straight off the server API (`cms.posts.list(...)`)
- `src/routes/posts/[slug]/` — post page reading through a remote `query`, with the author byline resolved by `query.batch`
- `src/routes/posts/[slug]/edit/` — edit form driven by `cms.posts.schemas.form`
- `src/routes/cms/+page.svelte` — drops `<CmsAdmin>` straight in

## Two ways to read content

Inside the SvelteKit server, call `cms` directly:

```ts
import { cms } from '$lib/cms/server/cms';
const posts = await cms.posts.list({ limit: 10 });
```

The HTTP endpoints under `/api/cms` exist for the admin UI, MCP tools, and clients outside this server. Both go through the same implementation in `@better-cms/core`, so they apply the same access policies and return the same decoded values.

## Next steps

- Add an S3/R2 bucket and `s3Media({ ... })` to enable image uploads through `POST /api/cms/media`
- Run `bun run cms:gen` to emit a drizzle schema if you want the drizzle adapter instead
- Customize the admin UI by importing `<FieldEditor>` directly or building your own
