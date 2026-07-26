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

## Run

```bash
bunx -p @better-cms/cli bcms generate                 # drizzle (default)
bunx -p @better-cms/cli bcms generate --target=types
```

Optional flags: `--config <path>` (override autodetection), `--out <path>` (override output).

## There is no client codegen

`createCmsClient<Cms>()` in `$lib/cms/client.ts` lifts collection and context types straight off the server config through a type-only import, and `<CmsAdmin>` reads its field metadata from `GET /_meta` at runtime. Nothing to regenerate when the schema changes.

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
