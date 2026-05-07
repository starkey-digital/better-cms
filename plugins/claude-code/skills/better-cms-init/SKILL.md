---
name: better-cms-init
description: Use when the user wants to set up, scaffold, install, bootstrap, or initialize better-cms in a project for the first time. Triggers on phrases like "set up better-cms", "add a CMS to my site", "install better-cms", "create cms.config", "initialize the CMS", or any first-time CMS setup mention. Run this even if the user just says "I want a CMS" in a SvelteKit/Astro/Next project.
---

# better-cms init

Bootstrap a new better-cms project. `bcms init` writes:

- `src/lib/cms.config.ts` — example `posts` collection + lazy adapter/media thunks
- `src/hooks.server.ts` — wires `cmsHandle(config)` and imports `dotenv/config`
- `.env.example` — DB + S3 vars
- `drizzle.config.ts` — points at the generated schema, reads env via dotenv

It also installs `better-cms`, `dotenv` (runtime) and `drizzle-kit`, `@libsql/client` (dev) using the project's package manager (auto-detects bun / pnpm / yarn / npm via lockfile).

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

2. **Generate schema and push to DB**:
   - `bunx -p @better-cms/cli bcms generate` (writes `src/lib/cms-schema.ts`)
   - `bunx drizzle-kit push` (applies DDL — `drizzle.config.ts` is already wired)

3. **Drop in the admin UI** (optional):
   ```svelte
   <!-- src/routes/cms/+page.svelte -->
   <script>
     import { CMSAdmin } from 'better-cms/admin';
     import config from '$lib/cms.config';
   </script>
   <CMSAdmin {config} />
   ```
   Importing `cms.config` from a client component is safe — `adapter` and `media` are thunks that fire only on the server.

If the user is on a non-SvelteKit framework (React/Next/Astro), tell them the SvelteKit bridge is the only one shipped today — point them to `@better-cms/core`'s `createCMS()` if they want to wire it up manually.

## Don't

- Don't run `drizzle-kit push` automatically — it touches the database.
- Don't write secrets into `.env` for the user. Show what to put there; let them paste their own credentials.
- Don't unwrap the adapter thunks in `cms.config.ts` (`adapter: libsqlAdapter(...)` instead of `adapter: () => libsqlAdapter(...)`). Eager init breaks client bundling because `process.env` reads run in the browser.
