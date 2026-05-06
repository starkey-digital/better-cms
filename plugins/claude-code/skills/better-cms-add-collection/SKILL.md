---
name: better-cms-add-collection
description: Use when the user wants to add a new collection or singleton to better-cms — phrases like "add a posts collection", "create a team page", "I need a testimonials section", "make a singleton for site settings", "new content type for X". Edit cms.config.ts and run generate. Triggers proactively when the user describes content they want to manage that doesn't yet exist in the schema.
---

# better-cms add collection

Add a `collection({...})` or `singleton({...})` entry to the user's `cms.config.ts`.

## Locate the config

Try these in order, use the first one that exists:

1. `src/lib/cms.config.ts`
2. `src/cms.config.ts`
3. `cms.config.ts`

If none exist, run `better-cms-init` first.

## Decide collection vs singleton

- **collection**: many records (blog posts, products, team members, projects). Use `collection({ fields: { ... } })`.
- **singleton**: one record (homepage, about page, site settings, footer). Use `singleton({ fields: { ... } })`.

Lean on the noun: plural / "list of" → collection. Singular / "the X" → singleton.

## Pick fields based on the name

Use these as defaults — adjust to fit the user's described content:

| Name suggests | Default fields |
|---|---|
| posts / articles / blog / news | `title` (text required), `slug` (slug from title), `excerpt` (text multiline), `body` (richText), `cover` (image), `published` (boolean) |
| team / authors / people | `name` (text required), `role` (text), `bio` (richText), `photo` (image), `email` (text) |
| projects / portfolio / work | `title` (text required), `slug`, `summary` (text), `cover` (image), `gallery` (array of image), `year` (number) |
| testimonials / reviews | `quote` (text required), `author` (text required), `role` (text), `avatar` (image) |
| products | `name` (text required), `slug`, `price` (number), `description` (richText), `images` (array of image), `inStock` (boolean) |
| settings / site / config (singleton) | `siteTitle` (text), `tagline` (text), `logo` (image), `favicon` (image), `socialLinks` (object) |
| home / homepage (singleton) | `hero` (object: heading, subheading, image), `intro` (richText), `featured` (relation many) |

If the name doesn't match any of these, ask the user briefly what fields they want, then pick reasonable defaults.

## DSL reference

```ts
import { defineCMS, collection, singleton, text, slug, richText, image, file, boolean, number, date, select, json, array, object, relation } from 'better-cms';
```

Field options every builder accepts: `{ label, description, required, unique, indexed, llm: { describe }, editor }`. Specific opts:

- `text({ min, max, pattern, multiline, defaultValue })`
- `richText({ editorImpl: 'tiptap' | 'lexical' | 'markdown' | 'plain', max })`
- `slug({ from: 'title' })` — auto-generates from another field
- `image({ formats: ['jpg','png','webp'], maxSizeMB })`
- `select({ options: ['a','b','c'] })`
- `array({ of: image() })`
- `object({ fields: { heading: text(), subheading: text() } })`
- `relation('posts', { many: true })`

## Edit pattern

Add the new entry to the `collections` map without disturbing the surrounding code:

```ts
export default defineCMS({
  collections: {
    posts: collection({ fields: { ... } }),
    // ... existing entries unchanged ...
    NEW_NAME: collection({
      fields: {
        // ...
      },
    }),
  },
  adapter: ...,
});
```

Preserve the user's existing imports, formatting, adapter, media, auth, plugins config.

## After editing

Run:

```bash
bunx -p @better-cms/cli bcms generate
```

Then remind the user:

```bash
bunx drizzle-kit push
```

## Don't

- Don't overwrite or reformat existing collections.
- Don't add fields the user didn't ask for beyond the sensible defaults above.
- Don't run `drizzle-kit push` automatically — DB-touching commands are the user's call.
