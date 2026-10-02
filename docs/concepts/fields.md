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

## Labels, help text and other admin metadata

Attach display metadata with zod's own `.meta()` / `.describe()`. The walker copies it onto the field and `GET /_meta` serves it to the admin. Nothing here affects validation or storage.

```ts
z.object({
	title: z.string().meta({ label: 'Headline', placeholder: 'Spring tour announced' }),
	blurb: z.string().describe('Shown on the home page').meta({ multiline: true }),
	doors: z.date().meta({ label: 'Doors', dateOnly: true }),
	internalNote: z.string().optional().meta({ hidden: true }),
	tracks: z
		.array(z.object({ title: z.string().meta({ label: 'Song' }), length: z.string().optional() }))
		.meta({ label: 'Tracks', itemLabel: 'Track' }),
});
```

| Key | Type | Effect |
|---|---|---|
| `label` | string | Display name of the field. |
| `description` | string | Help text. `.describe('...')` sets the same thing. |
| `placeholder` | string | Input placeholder. |
| `multiline` | boolean | On strings: `editor.props.multiline = true` (textarea). |
| `dateOnly` | boolean | On dates: `editor.props.dateOnly = true` (see [Dates](#dates)). |
| `hidden` | boolean | Keep the field out of the admin form. |
| `itemLabel` | string | On arrays: singular name for one item (`editor.props.itemLabel`). |

Meta can sit anywhere in a wrapper chain: `z.string().meta(m).optional()`, `z.string().optional().meta(m)` and `.nullable().default(...)` variants all work. If both layers set a key, the outer one wins. For arrays of objects every sub-field keeps its own meta, so the admin can label repeater columns.

## Dates

`z.date()` fields accept ISO-8601 strings on every write path (`create`, `update`, `form`, `/ops`) without `z.coerce`. JSON transport only carries strings, and the schemas convert them. Responses always return ISO strings over HTTP.

- A **datetime** (default) is an instant. `"2026-05-01T20:30:00Z"` is stored as that moment. A bare `YYYY-MM-DD` is read as 00:00:00Z.
- A **dateOnly** (`.meta({ dateOnly: true })`) is a calendar date. It is stored as 00:00:00Z of that day, and any time component sent is dropped. The admin displays and edits it in UTC, so it never shifts a day with the viewer's timezone.

Only top-level date fields are coerced; a `z.date()` nested inside an object or array is stored through JSON and is not converted.

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
