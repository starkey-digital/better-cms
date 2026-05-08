---
name: better-cms-schema
description: Use whenever the user asks to add, change, rename, or remove fields/collections/singletons in a better-cms project. Triggers on phrases like "add field", "new collection", "rename column", "make singleton", or any edit to src/lib/cms/schemas.ts.
---

# better-cms schema editing

Schema-first: edit `src/lib/cms/schemas.ts`. Use zod + the helpers from `better-cms/zod`. There is no field DSL; the walker derives the IR from the zod schema.

1. **Always import from `better-cms/zod`**: `collection`, `singleton`, `defineCMS`, plus helpers `richText`, `image`, `file`, `slug`, `relation`, `unique`, `indexed`. Plain field types come straight from `z` (`z.string()`, `z.number()`, `z.boolean()`, `z.date()`, `z.enum([...])`, `z.array(...)`, `z.object({...})`).

2. **Required vs optional**: a plain `z.string()` is required. Chain `.optional()` (or `.nullable()`) to make the field nullable in the column / optional on input. Use `.default(value)` for a server-side default.

3. **Helpers cover what zod can't express**:
   - `richText()` → `z.string()` tagged as rich text (storage: json).
   - `image()` / `file()` → tagged object schemas with the standard `{ key, url, ... }` shape.
   - `slug()` → `z.string()` with the slug regex + kind tag (unique + indexed by default).
   - `relation(target, opts?)` → typed FK. **Pass the `CollectionDef` directly** (`relation(authors)`) or a thunk for forward/circular refs (`relation(() => authors)`). `defineCMS` resolves the ref to the registered name string at startup; an unregistered target throws.
   - `unique(schema)` / `indexed(schema)` → wrap any zod schema to add the corresponding column flag.

4. **Singletons** use a fixed id `default`. Use them for site settings, single-page content (about, contact), homepage config.

5. **Renames are not free**: changing a collection or field name requires a content migration. Warn the user and propose a migration plan before renaming.

6. **After every schema edit**:
   - Run `bunx -p @better-cms/cli bcms generate` to refresh the drizzle schema file (`src/lib/cms-schema.ts`).
   - Tell the user to run `bunx drizzle-kit push` (or generate+migrate) to apply DDL to the database.

7. **Use the MCP server** (`better-cms` MCP) to inspect existing data when reasoning about migrations: call `cms_schema` and `cms_list` before proposing destructive changes.

8. **Strong typing** flows from zod automatically. Export `type Post = z.infer<typeof PostSchema>` from `schemas.ts` so consumers can `import type { Post }` without redoing inference. `cms.posts.list()` already returns the typed row.

9. **Storage hints** (derived by the walker, no manual setting):
   - Scalars (string/number/bool/date/enum) and single relations live in columns.
   - Complex types (richText, array, object, image/file refs, many-relations) live in JSON columns.
   - `serializeRow` / `deserializeRow` handle the conversion. The user never sees JSON strings.

10. **Validation** flows through zod. `posts.schemas.create / .update / .full` are auto-composed from the schema (lossless `omit`/`partial`). Drop them straight into SvelteKit `command(...)` / `query(...)`, tRPC, hono, anywhere a Standard Schema validator works.

11. **Custom kinds**: if zod can't express something and the helper set isn't enough, `schema.register(bcmsRegistry, { kind, storage })` lets you tag any zod schema. Drop down to `_collection({ fields, ... })` (low-level core primitive) only if you need to bypass the walker entirely.
