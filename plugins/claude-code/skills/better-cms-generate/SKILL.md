---
name: better-cms-generate
description: Use whenever the user has edited src/lib/server/cms.ts (added a collection, field, singleton, renamed something, changed validation) and needs the drizzle schema or TypeScript types regenerated. Also triggers on "regenerate cms", "rebuild schema", "update drizzle", "the schema is out of sync", "after changing cms".
---

# better-cms generate

Regenerate output files from the user's `cms.ts`. Three targets:

| Target | Output | When |
|---|---|---|
| `drizzle` (default) | `src/lib/cms-schema.ts` | After any schema change. User then runs `drizzle-kit push`. |
| `types` | `src/lib/cms-types.ts` | Standalone TS interfaces (most users don't need this — `defineCMS` already infers types via the generic). |
| `client` | `src/lib/cmsClient.ts` | Browser-safe typed client + admin config slice. Re-run after every schema change. |

## Run

```bash
bunx -p @better-cms/cli bcms generate                 # drizzle (default)
bunx -p @better-cms/cli bcms generate --target=types
bunx -p @better-cms/cli bcms generate --target=client
```

Optional flags: `--config <path>` (override autodetection), `--out <path>` (override output).

## What `--target=client` emits

A standalone `src/lib/cmsClient.ts` that does NOT reference any server code:

- Per-collection / singleton TS interfaces (typed off field defs).
- `cmsConfig: ClientCmsConfig` — full schema slice, pass to `<CmsAdmin config={cmsConfig} />`.
- `cmsClient: Cms` — runtime API (`cmsClient.posts.list()`, `cmsClient.posts.get(slug)`, `cmsClient.auth.getUser()`, etc.) with a minimal baked schema. Talks to the handler over HTTP.

Components import directly: `import { cmsClient } from '$lib/cmsClient'`. No prop threading, no layout setup.

## After generate

Always remind the user to **apply the schema to the database**:

```bash
bunx drizzle-kit push
```

If they have a migrations workflow instead:

```bash
bunx drizzle-kit generate
bunx drizzle-kit migrate
```

## Renames are not safe

If the user renamed a field or collection, `drizzle-kit push` will offer to drop+recreate the column/table — they will lose data. Warn them. Recommend: keep the old field, copy data into the new field with a one-shot script, then remove the old field in a follow-up generate.

## When to skip

If `cms.ts` hasn't changed since the last generate, regeneration is a no-op (file rewritten with identical content). Safe to run anyway — fast.
