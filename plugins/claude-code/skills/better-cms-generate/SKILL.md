---
name: better-cms-generate
description: Use whenever the user has edited src/lib/cms/schemas.ts (added a collection, field, singleton, renamed something, changed validation) and needs the drizzle schema regenerated. Also triggers on "regenerate cms", "rebuild schema", "update drizzle", "the schema is out of sync", "after changing schemas".
---

# better-cms generate

Regenerate output files from the user's zod schemas in `$lib/cms/schemas.ts`. Targets:

| Target | Output | When |
|---|---|---|
| `drizzle` (default) | `src/lib/cms-schema.ts` | After any schema change. User then runs `drizzle-kit push`. |
| `types` | `src/lib/cms-types.ts` | **Most users don't need this** — `z.infer<typeof Schema>` covers it. Only useful for tooling that can't read zod. |
| `client` | `src/lib/cmsClient.ts` | **Opt-in.** Static manifest baked at build-time; lets you skip zod (~30 kB gz) in the browser bundle. Re-run after every schema change. The default flow uses `$lib/cms/client.ts` (codegen-free) and zod ships to the client. |

## Run

```bash
bunx -p @better-cms/cli bcms generate                 # drizzle (default)
bunx -p @better-cms/cli bcms generate --target=types
bunx -p @better-cms/cli bcms generate --target=client
```

Optional flags: `--config <path>` (override autodetection), `--out <path>` (override output).

## What `--target=client` emits (opt-in)

A standalone `src/lib/cmsClient.ts` that does NOT reference any server code or the zod runtime:

- Per-collection / singleton TS interfaces (typed off the IR walked from your schemas).
- `cmsConfig: ClientCmsConfig` — full schema slice, pass to `<CmsAdmin config={cmsConfig} />`.
- `cmsClient: Cms` — runtime API (`cmsClient.posts.list()`, `cmsClient.posts.get(slug)`, etc.) with a minimal baked schema. Talks to the handler over HTTP.

Use this only when the project's bundle-size budget rules out shipping zod to the browser. Otherwise stick with the codegen-free path: import `cmsClient` from `$lib/cms/client.ts`, types flow via `z.infer<typeof Schema>`.

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

If `schemas.ts` hasn't changed since the last generate, regeneration is a no-op (file rewritten with identical content). Safe to run anyway — fast.
