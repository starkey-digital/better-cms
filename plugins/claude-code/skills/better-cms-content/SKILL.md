---
name: better-cms-content
description: Use when the user asks to author, edit, list, find, or delete content in a better-cms project. Triggers on phrases like "add a blog post", "update the about page", "list our team members", "publish this draft".
---

# better-cms content authoring

The `better-cms` MCP server is registered. Use its tools instead of writing raw SQL, fetch calls, or files.

## Available tools

- `cms_schema` — list every collection and its field schema. **Always call first** when uncertain about field names or types.
- `cms_list({ collection, limit?, offset? })` — list records.
- `cms_get({ collection, id })` — fetch a single record (or singleton — pass `id: "default"`).
- `cms_create({ collection, data })` — create a new record. Field values must match the collection's JSON Schema.
- `cms_update({ collection, id, data })` — partial update. Pass only the fields that change.
- `cms_delete({ collection, id })` — remove a record.

## Rules

1. **Inspect before writing**. Call `cms_schema` to understand fields, then `cms_list` if the user references existing content. Never invent field names.
2. **Singletons**: pass `id: "default"`. Singletons exist for site-wide configuration and one-off pages.
3. **Rich text**: `richText` fields store a string (markdown / HTML / stringified ProseMirror JSON — depends on the editor the user mounts). Pass plain text or markdown directly. If the user's setup expects ProseMirror JSON, the project will document that in `$lib/cms/schemas.ts`; check the field's downstream renderer if unsure.
4. **Images**: `image` fields store `{ key, url, alt?, width?, height? }`. The CMS owns uploads — never invent URLs. If the user wants to attach an image that hasn't been uploaded, ask them to upload it first or guide them through media upload.
5. **Slugs**: validate format `^[a-z0-9]+(?:-[a-z0-9]+)*$`. Generate from titles via lowercase + hyphenate.
6. **Audit trail**: every write is automatically logged to `cms_revisions` with `source: "mcp"`. Mention this if the user wants to undo changes.
7. **Confirm destructive ops**. Before `cms_delete`, confirm the user really wants the record removed.
