---
name: better-cms-schema
description: Use whenever the user asks to add, change, rename, or remove fields/collections/singletons in a better-cms project. Triggers on phrases like "add field", "new collection", "rename column", "make singleton", or any edit to src/lib/server/cms.ts.
---

# better-cms schema editing

When editing `src/lib/server/cms.ts`:

1. **Use the DSL helpers** from `@better-cms/core`. Never write raw IR objects.
   - Collections: `collection({ fields: { ... } })`. Singletons: `singleton({ fields: { ... } })`.
   - Field builders: `text`, `richText`, `slug`, `image`, `file`, `boolean`, `number`, `date`, `select`, `json`, `array`, `object`, `relation`. Each is generic and returns a `FieldDef<T>` carrying the runtime value type.

2. **Required vs optional**: use `{ required: true }` only when the field must be present at write time. Default is optional.

3. **Singletons** use a fixed id `default` under the hood. Use them for site settings, single-page content (about, contact), and homepage config.

4. **Renames are not free**: changing a collection or field name requires a content migration. Warn the user and propose a migration plan before renaming.

5. **After every schema edit**:
   - Run `bunx better-cms generate` to refresh the drizzle schema file.
   - Tell the user to run `bunx drizzle-kit push` (or generate+migrate) to apply DDL to the database.

6. **Use the MCP server** (`better-cms` MCP) to inspect existing data when reasoning about migrations: call `cms_schema` and `cms_list` before proposing destructive changes.

7. **Strong typing** flows from the DSL automatically — `defineCMS` captures collection types verbatim. `serverApi(ctx).list('posts')` returns the typed `Post[]`. Don't widen the user's types unnecessarily.

8. **Storage hints**:
   - Scalars (text, number, boolean, date, slug, select, relation single) live in columns.
   - Complex (richText, array, object, image, file, relation many) live in JSON columns.
   - The framework handles serialize/deserialize. The user never sees JSON strings.
