---
name: better-cms-add-collection
description: Use when the user wants to add a new collection or singleton to better-cms — phrases like "add a posts collection", "create a team page", "I need a testimonials section", "make a singleton for site settings", "new content type for X". Edit src/lib/cms/schemas.ts and run generate. Triggers proactively when the user describes content they want to manage that doesn't yet exist in the schema.
---

# better-cms add collection

Add a zod schema + `collection({ schema })` / `singleton({ schema })` entry to the user's `schemas.ts`.

## Locate the schemas file

Try these in order, use the first one that exists:

1. `src/lib/cms/schemas.ts` (default — schema-first layout)
2. `src/lib/schemas.ts`
3. `src/cms/schemas.ts`

Older projects may still use the legacy single-file `src/lib/server/cms.ts` — read it; if collections live there, migrate them to `$lib/cms/schemas.ts` first (see `better-cms-init` for the layout).

If neither exists, run `better-cms-init` first.

## Decide collection vs singleton

- **collection**: many records (blog posts, products, team members, projects). Use `collection({ schema: SomeZod })`.
- **singleton**: one record (homepage, about page, site settings, footer). Use `singleton({ schema: SomeZod })`.

Lean on the noun: plural / "list of" → collection. Singular / "the X" → singleton.

## Pick fields based on the name

Use these as defaults — adjust to fit the user's described content:

| Name suggests | Default fields |
|---|---|
| posts / articles / blog / news | `title: z.string().min(1).max(120)`, `slug: slug()`, `excerpt: z.string().max(500).optional()`, `body: richText().optional()`, `cover: image().optional()`, `published: z.boolean().default(false)` |
| team / authors / people | `name: z.string().min(1)`, `role: z.string().optional()`, `bio: richText().optional()`, `photo: image().optional()`, `email: z.string().email().optional()` |
| projects / portfolio / work | `title: z.string().min(1)`, `slug: slug()`, `summary: z.string().optional()`, `cover: image().optional()`, `gallery: z.array(image()).optional()`, `year: z.int().optional()` |
| testimonials / reviews | `quote: z.string().min(1)`, `author: z.string().min(1)`, `role: z.string().optional()`, `avatar: image().optional()` |
| products | `name: z.string().min(1)`, `slug: slug()`, `price: z.number().nonnegative()`, `description: richText().optional()`, `images: z.array(image()).optional()`, `inStock: z.boolean().default(true)` |
| settings / site / config (singleton) | `siteTitle: z.string().min(1)`, `tagline: z.string().optional()`, `logo: image().optional()`, `favicon: image().optional()`, `socialLinks: z.object({ twitter: z.string().optional(), github: z.string().optional() }).optional()` |
| home / homepage (singleton) | `hero: z.object({ heading: z.string(), subheading: z.string().optional(), image: image().optional() })`, `intro: richText().optional()`, `featured: relation(() => posts, { many: true })` |

If the name doesn't match any of these, ask the user briefly what fields they want, then pick reasonable defaults.

## Imports

```ts
import { collection, file, image, indexed, relation, richText, singleton, slug, unique } from 'better-cms/zod';
import { z } from 'zod';
```

## Edit pattern

Add the new entry. Preserve existing exports + the `collections` aggregator at the bottom:

```ts
// src/lib/cms/schemas.ts
export const PostSchema = z.object({ /* ... */ });
export const NewSchema = z.object({ /* ... new content type ... */ });

export const posts = collection({ schema: PostSchema });
export const newThing = collection({ schema: NewSchema });

export const collections = { posts, newThing /* ... existing entries unchanged ... */ };

export type Post = z.infer<typeof PostSchema>;
export type NewThing = z.infer<typeof NewSchema>;
```

Preserve the user's existing imports, formatting, types, helper exports.

## Type-safe relations

When the new collection references another, import the existing `CollectionDef` and pass it to `relation()`:

```ts
import { authors } from './schemas.js';   // when authors is declared earlier

// or use a thunk for forward / circular refs
const PostSchema = z.object({
	author: relation(() => authors),
});
```

`defineCMS({ collections })` resolves these to the registered key name at startup. Throws if the target isn't in the map.

## After editing

Run:

```bash
bunx -p @better-cms/cli bcms generate            # refresh src/lib/cms-schema.ts (drizzle)
```

If the project uses the **opt-in client codegen** (zero-zod browser bundle), also run:

```bash
bunx -p @better-cms/cli bcms generate --target=client
```

Default flow uses `$lib/cms/client.ts` directly — no client codegen step needed; types flow via `z.infer`.

Then remind the user:

```bash
bunx drizzle-kit push
```

## Don't

- Don't overwrite or reformat existing schemas.
- Don't add fields the user didn't ask for beyond the sensible defaults above.
- Don't run `drizzle-kit push` automatically — DB-touching commands are the user's call.
- Don't use string literals for relation targets (`relation('posts')` — typo-prone). Use the `CollectionDef` directly or a `() => collection` thunk.
