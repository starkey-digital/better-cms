---
name: better-cms-init
description: Use when the user wants to set up, scaffold, install, bootstrap, or initialize better-cms in a project for the first time. Triggers on phrases like "set up better-cms", "add a CMS to my site", "install better-cms", "create cms.config", "initialize the CMS", or any first-time CMS setup mention. Run this even if the user just says "I want a CMS" in a SvelteKit/Astro/Next project.
---

# better-cms init

Bootstrap a new better-cms project. `bcms init` writes the schema-first `$lib/cms/` layout:

- `src/lib/cms/schemas.ts` — zod schemas + `collection()`/`singleton()` defs (browser-safe)
- `src/lib/cms/client.ts` — `cmsClient` + `cmsConfig` for `<CmsAdmin>` (no codegen)
- `src/lib/cms/server/cms.ts` — adapter + plugins + auth + `defineCMS` (server-only)
- `src/hooks.server.ts` — wires `cmsHandle(cms)`
- `src/routes/cms/+page.svelte` — admin route, imports `cmsConfig` direct (no `+page.server.ts`)
- `.env.example` — DB + S3 vars
- `drizzle.config.ts` — points at the generated schema

Installs `better-cms`, `zod`, `dotenv` (runtime) plus `drizzle-kit`, `@libsql/client` (dev) using the project's package manager (auto-detects bun / pnpm / yarn / npm via lockfile).

## Run

```bash
bunx -p @better-cms/cli bcms init
```

Flags:
- `--force` — overwrite existing files (default skips with a warning)
- `--skip-install` — print install commands instead of running them

## After init

Tell the user, in this order:

1. **Fill in `.env`** by copying `.env.example`. Required vars:
   - `DATABASE_URL` (libsql / Turso URL, or `file:./local.db` for local dev)
   - `DATABASE_AUTH_TOKEN` (for hosted Turso; empty for local)
   - `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_URL` (R2 / Wasabi / B2 / AWS — set `S3_ENDPOINT` for non-AWS)
   - `CMS_PASSWORD`, `CMS_AUTH_SECRET` if `passwordAuth` is in the scaffold (run `bunx -p @better-cms/cli bcms gen-secret` for the secret).

2. **Generate the drizzle schema and push to DB**:
   - `bunx -p @better-cms/cli bcms generate` (writes `src/lib/cms-schema.ts`)
   - `bunx drizzle-kit push` (applies DDL — `drizzle.config.ts` is already wired)

3. **Open the admin** at `/cms`. Already wired by `init` via `<CmsAdmin config={cmsConfig} auth />`.

4. **Define schemas in `src/lib/cms/schemas.ts`.** Add zod objects and wrap them with `collection({ schema })` / `singleton({ schema })` from `better-cms/zod`. Use the helpers (`richText`, `image`, `file`, `slug`, `relation`, `unique`, `indexed`) for concepts zod can't express directly. Re-run `bcms generate` after every schema edit to refresh the drizzle file.

If the user is on a non-SvelteKit framework (React/Next/Astro), tell them the SvelteKit bridge is the only one shipped today — point them to `@better-cms/core`'s `createCMS()` if they want to wire it up manually.

## Don't

- Don't run `drizzle-kit push` automatically — it touches the database.
- Don't write secrets into `.env` for the user. Show what to put there; let them paste their own credentials.
- Don't move `server/cms.ts` out of `$lib/cms/server/`. The `server/` directory is what makes Vite enforce server-only — moving it elsewhere exposes adapter credentials to the client bundle. If the user insists, use a `*.server.ts` filename (e.g. `cms.server.ts`) which gets the same guard.
- Don't import `$lib/cms/server/cms` from a `.svelte` component — Vite blocks it. Use `cmsClient` from `$lib/cms/client` or pass `clientCmsConfig(...)` results through a `+page.server.ts` load function.
- Don't `import { defineCMS } from 'better-cms'`. Schema-first lives at `better-cms/zod`. The bare `better-cms` entry exposes core types (`RowOf`, `CollectionDef`, `StandardSchemaV1`) but no DSL.
