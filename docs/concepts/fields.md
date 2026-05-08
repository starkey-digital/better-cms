# Fields

There is no field DSL anymore. **Write a zod schema; the walker derives the IR.** Field metadata you used to set via `text({ required: true })` is now expressed in zod (`z.string().min(1)` etc.) plus a small set of helpers from `better-cms/zod` for concepts zod can't express directly (rich text, image refs, relations, slugs).

## What the walker derives

Zod type → field kind → storage:

| Zod | `kind` | Storage | Drizzle column |
|---|---|---|---|
| `z.string()` | `text` | column | `text` |
| `z.string()` (via `slug()` helper) | `slug` | column | `text` (unique, indexed) |
| `z.number()` | `number` | column | `real` |
| `z.int()` (or check w/ int format) | `integer` | column | `integer` |
| `z.boolean()` | `boolean` | column | `integer` (0/1) |
| `z.date()` | `date` | column | `integer` (timestamp ms) |
| `z.enum([...])` | `select` (with `options`) | column | `text` |
| `z.object({...})` | `object` | json | `text` (JSON) |
| `z.array(...)` | `array` | json | `text` (JSON) |
| `z.string()` (via `richText()`) | `richText` | json | `text` (JSON) |
| `z.object(imageRefShape)` (via `image()`) | `image` | json | `text` (JSON) |
| `z.string()` / `z.array(z.string())` (via `relation()`) | `relation` | column / json | `text` (FK) |

Wrappers:

- `.optional()` / `.nullable()` → `required: false`
- `.default(v)` → `required: false` + `defaultValue: v`
- `.transform()`, `z.lazy()`, `z.union(...)`, etc. → fallback to `kind: 'json'`, `storage: 'json'` (round-trip the value verbatim; admin gets a JSON editor)

## Helpers (`better-cms/zod`)

```ts
import { richText, image, file, slug, relation, unique, indexed } from 'better-cms/zod';
import { z } from 'zod';

const PostSchema = z.object({
	title: unique(z.string().min(1)),          // adds .unique()
	slug: slug(),                              // regex /^[a-z0-9-]+$/ + kind: 'slug'
	body: richText(),                          // kind: 'richText', storage: 'json'
	cover: image().optional(),                 // kind: 'image', storage: 'json'
	attachment: file().optional(),             // kind: 'file', storage: 'json'
	author: relation(() => authors),           // kind: 'relation', typed
	tags: relation(() => tags, { many: true }),
	pinIndex: indexed(z.int()),                // adds index
});
```

Each helper attaches metadata to a typed `z.registry<BcmsFieldMeta>()` so the walker picks up the field-kind hint without coupling core to zod's internals.

## Storage rule

Scalars and single relations → real column. Anything complex (richText, arrays, objects, image/file refs, many-relations) → JSON column.

Core's `serializeRow` / `deserializeRow` handle the conversion. Adapters always receive already-serialized rows — they never re-implement serialization.

## Validation

Validation runs at the `applyOps` boundary — through `def.schemas.{create,update,full}`, which are the user's zod schema shaped via zod's native `.omit({ id, createdAt, updatedAt })` / `.partial().extend({ id })`. Lossless: transforms, refines, async checks, discriminated unions all preserved.

The same `posts.schemas.create` is dropped straight into SvelteKit's `command()`, tRPC, hono — anywhere a Standard Schema validator works.

## Custom kinds

If zod can't express what you want and the helper set isn't enough, `schema.register(bcmsRegistry, { kind, storage })` lets you tag any zod schema. The walker reads the registry and emits the corresponding IR. Drop down to `_collection({ fields, ... })` (low-level core primitive) only when you need to bypass the walker entirely.
