# better-cms · sveltekit-basic example

Minimal SvelteKit app using `better-cms` with libsql, one collection, one singleton, and the drop-in admin UI.

## Run

```sh
bun install
cp .env.example .env
bun --filter better-cms run build   # build the workspace pkg first (one-time)
bun run dev
```

Open:
- <http://localhost:5173> — public site (SSR via `serverApi`)
- <http://localhost:5173/cms> — admin UI

The libsql adapter creates `local.db` and the schema automatically on first request — no `drizzle-kit push` needed for this example.

## What's wired

- `src/lib/cms.config.ts` — collections (`posts`) + singleton (`settings`)
- `src/hooks.server.ts` — `cmsHandle` mounts CMS endpoints under `/cms`
- `src/routes/+page.server.ts` — typed SSR via `serverApi(ctx).list('posts')`
- `src/routes/+page.svelte` — renders posts + settings
- `src/routes/cms/+page.svelte` — drops `<CMSAdmin>` straight in

## Next steps

- Add an S3/R2 bucket and `s3Media({ ... })` to enable image uploads
- Run `bun run cms:gen` to emit drizzle schema if you want to use the drizzle adapter instead
- Customize the admin UI by importing `<FieldEditor>` directly or building your own
