---
name: better-cms-init
description: Use when the user wants to set up, scaffold, install, bootstrap, or initialize better-cms in a project for the first time. Triggers on phrases like "set up better-cms", "add a CMS to my site", "install better-cms", "create cms.config", "initialize the CMS", or any first-time CMS setup mention. Run this even if the user just says "I want a CMS" in a SvelteKit/Astro/Next project.
---

# better-cms init

Bootstrap a new better-cms project. Writes `cms.config.ts` with a `posts` example collection, `.env.example` with the required environment variables, and prepares the project for the next steps.

## Run

```bash
bunx -p @better-cms/cli bcms init
```

Add `--force` if the user explicitly wants to overwrite an existing config.

If `cms.config.ts` already exists, the CLI skips it. Don't overwrite unless the user has confirmed.

## After init

Tell the user, in this order:

1. **Fill in `.env`** with database + storage credentials. Copy `.env.example` to `.env`. The required vars:
   - `DATABASE_URL` (libsql / Turso URL, or `file:./local.db` for local dev)
   - `DATABASE_AUTH_TOKEN` (for hosted Turso; empty for local)
   - `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_URL` (works with R2, Wasabi, B2, AWS — set `S3_ENDPOINT` for non-AWS)

2. **Wire the SvelteKit handle** in `src/hooks.server.ts`:
   ```ts
   import { cmsHandle } from 'better-cms/sveltekit';
   import config from '$lib/cms.config';
   export const handle = cmsHandle(config);
   ```

3. **Generate schema and push to DB**:
   - `bunx -p @better-cms/cli bcms generate` (writes `src/lib/cms-schema.ts`)
   - `bunx drizzle-kit push` (applies DDL — user needs `drizzle.config.ts` pointing at the generated schema)

4. **Drop in the admin UI** (optional):
   ```svelte
   <!-- src/routes/cms/+page.svelte -->
   <script>
     import { CMSAdmin } from 'better-cms/admin';
     import config from '$lib/cms.config';
   </script>
   <CMSAdmin {config} />
   ```

If the user is on a non-SvelteKit framework (React/Next/Astro), tell them the SvelteKit bridge is the only one shipped today — point them to `@better-cms/core`'s `createCMS()` if they want to wire it up manually.

## Don't

- Don't run `drizzle-kit push` automatically — it touches the database.
- Don't write secrets into `.env` for the user. Show what to put there; let them paste their own credentials.
