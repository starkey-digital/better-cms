# Fields

Fields are phantom-typed: a `FieldDef<TOut>` carries its value type through the DSL into the runtime API.

## Built-in field builders

| Builder | Output type | Storage |
|---|---|---|
| `text(opts?)` | `string` | column |
| `number(opts?)` | `number` | column |
| `boolean(opts?)` | `boolean` | column |
| `date(opts?)` | `Date` | column |
| `richText(opts?)` | rich-text JSON | JSON column |
| `image(opts?)` | image ref | JSON column |
| `file(opts?)` | file ref | JSON column |
| `array(of, opts?)` | `T[]` | JSON column |
| `object(shape, opts?)` | `{ ... }` | JSON column |
| `relation(name, opts?)` | id or id[] | column (single) / JSON (many) |

## Storage rule

Scalars and single relations → real column. Anything complex (rich text, arrays, objects, image/file refs, many-relations) → JSON column.

Core's `serializeRow` / `deserializeRow` handle the conversion. Adapters always receive already-serialized rows — they never re-implement serialization.

## Common options

All builders accept:

- `required: boolean` — validation
- `unique: boolean` — unique constraint (column fields only)
- `default: T | () => T` — default value
- `label: string` — admin UI label
- `description: string` — admin UI helper
