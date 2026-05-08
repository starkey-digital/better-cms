# Collections

A **collection** is a typed group of records sharing a zod schema. Each collection maps to a database table.

## Defining

```ts
import { collection, image, relation } from 'better-cms/zod';
import { z } from 'zod';

const PostSchema = z.object({
	title: z.string().min(1).max(120),
	hero: image().optional(),
	author: relation(() => authors), // typed, resolved at startup
});

export const authors = collection({
	schema: z.object({ name: z.string() }),
});

export const posts = collection({ schema: PostSchema });
```

The walker (`@better-cms/zod`) reads the zod schema, emits the IR, and bakes Standard Schema validators (`posts.schemas.create / .update / .full`) for use anywhere — SvelteKit `command`/`query`, tRPC, hono, etc.

## Singletons

For one-off documents (site settings, homepage hero) use `singleton({ schema })`. The record uses a fixed id of `"default"` and gets dedicated `GET` / `PUT /singletons/:name` routes.

```ts
import { richText, singleton } from 'better-cms/zod';
import { z } from 'zod';

export const homepage = singleton({
	schema: z.object({
		hero: z.string(),
		intro: richText().optional(),
	}),
});
```

## Type-safe relations

`relation(target)` accepts a `CollectionDef` directly — typos are TS errors. For circular / forward refs use a thunk:

```ts
const PostSchema = z.object({
	author: relation(() => authors),       // forward ref via thunk
	tags: relation(() => tags, { many: true }),
});

const AuthorSchema = z.object({
	posts: relation(() => posts, { many: true }),
});
```

`defineCMS({ collections })` resolves each target to the registered key name at startup. An unregistered target throws — no silent orphan FK.

## Type inference

```ts
import type { z } from 'zod';
import type { PostSchema } from '$lib/cms/schemas';

type Post = z.infer<typeof PostSchema>;
// or via the helper export:
// export type Post = z.infer<typeof PostSchema>;
```

`defineCMS<C>` captures your collections verbatim. `RowOf<typeof posts>` resolves to `z.infer<PostSchema> & { id, createdAt, updatedAt }`. The same types flow into:

- `cms.posts.*` (server) and `cmsClient.posts.*` (browser)
- `<CmsAdmin config={cmsConfig} />`
- SvelteKit remote functions (drop `posts.schemas.create` straight into `command(...)`)

No codegen for types — zod is the single source of truth.

## Access + hooks live on the server config

`collection()` takes only the schema — per-collection `access` policies and lifecycle `hooks` reference server-only state (db, secrets, side-effects), so they're declared on `defineCMS({ serverCollections })` in your `server/cms.ts`. The collection definition stays browser-safe and JSON-serializable.

```ts
// schemas.ts (browser-safe)
export const posts = collection({ schema: PostSchema });

// server/cms.ts (server-only)
import { createCms } from 'better-cms/zod';

type AppCtx = { user: { id: string; role: 'admin' | 'editor' } } | null;
const { defineCMS } = createCms<AppCtx>();

defineCMS({
  collections,
  access: { /* global */ },
  serverCollections: {
    posts: {
      access: {
        update: (ctx, doc) => doc?.authorId === ctx?.user.id,    // doc: Post + sys
      },
      hooks: {
        afterCreate: ({ result }) => searchIndex.add(result.id, result.title),
        beforeDelete: ({ prev }) => {
          if (prev?.published) throw new Error('unpublish first');
        },
      },
    },
  },
});
```

`Ctx` is pinned via the `createCms<AppCtx>()` factory; `Doc` is inferred per-collection from `RowOf<C[K]>`. See [Authentication](./auth.md), [Access control](./access-control.md), and [Hooks](./hooks.md) for the full surface.
