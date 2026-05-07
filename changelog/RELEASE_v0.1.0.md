# Release v0.1.0

**Released:** 2026-05-07
**Previous version:** —

First public release of better-cms — a drop-in headless CMS for SvelteKit with bring-your-own database and storage. Source-available under PolyForm Shield 1.0.0. End-to-end typed: collection definitions, runtime queries, admin UI, and MCP server all share one schema.

## New Features

- **Schema DSL** — declare collections and singletons with typed field builders (`text`, `richText`, `image`, `slug`, `array`, `object`, `relation`, `select`, `boolean`, `number`, `date`, `json`, `file`). Field types carry phantom output types so `defineCMS` captures the row shape verbatim — `serverApi(ctx).list('posts')` returns typed rows with no codegen step.
- **Pluggable adapters** — swap data and asset backends:
  - `better-cms/adapters/libsql` (auto DDL via `init(schema)` — no migration step needed for prototypes)
  - `better-cms/adapters/drizzle` (drizzle-kit owns DDL, exposes typed `db` for advanced queries)
  - `better-cms/media/s3` (S3-compatible — works with R2, Wasabi, B2, MinIO, AWS)
- **SvelteKit integration** — single hook + remote helpers. `cmsHandle(config)` mounts the API under `/api/cms`. `serverApi(ctx)` skips HTTP for SSR loaders. `better-cms/sveltekit/remote` ships typed remote-function helpers.
- **Drop-in admin UI** — `<CMSAdmin {config} />` renders sidebar + form + media upload. Auto-handles collections vs singletons via the schema's discriminator. Field-by-field renderer (`<FieldEditor>`) is exported headlessly for custom layouts.
- **CLI (`bcms`)** — `bcms init` scaffolds `cms.config.ts` and `.env.example`. `bcms generate` emits a drizzle schema file from the IR. `bcms generate --target=types` writes standalone TS interfaces.
- **MCP server (`bcms mcp`)** — stdio MCP server bound to your `cms.config`. Exposes `cms_schema`, `cms_list`, `cms_get`, `cms_create`, `cms_update`, `cms_delete` tools plus per-collection JSON Schema resources at `cms://schema/<collection>`. Drop-in for Claude Code, Claude Desktop, or any MCP host.
- **Claude Code plugin** — ships at `plugins/claude-code/`. Five skills (`better-cms-init`, `better-cms-generate`, `better-cms-add-collection`, `better-cms-schema`, `better-cms-content`) plus auto-registered MCP server.
- **Live preview channel** — server-sent events at `/api/cms/_live`. Inline edits, admin saves, and LLM tool calls all publish to the same broadcast.
- **Audit trail** — every write goes through one `CMSOp` → `applyOps()` kernel; revisions logged to a built-in `cms_revisions` table tagged with the source (`inline`, `admin`, `llm`, `mcp`, `cli`, `remote`).
- **Three packaging modes**:
  - Single install (`bun add better-cms`) with subpath imports — main user surface, mirrors better-auth.
  - Internal `@better-cms/*` workspace packages also publish for advanced consumers.
  - `@better-cms/cli` ships separately with the `bcms` binary.

## Improvements

- **Single source of truth** — `getCMSTables(config)` merges system + plugin + user collections; CLI, runtime, and adapters all call it. No code path reaches into `config.collections` directly.
- **Storage hint per field** — scalars and single relations live in columns; rich content (richText, array, object, image, file, many-relation) lives in JSON columns. `serializeRow` / `deserializeRow` handle conversion in core; adapters never see raw types.

## Examples

- `examples/sveltekit-basic` — minimal SvelteKit app with one collection, one singleton, libsql, and the drop-in admin UI. Verified end-to-end: SSR list at `/`, admin UI at `/cms`, JSON API at `/api/cms/*` all return 200 with the seeded empty state.

## License

PolyForm Shield 1.0.0 — source-available with permanent noncompete. Anyone may use, modify, redistribute, and self-host (any database, any storage). The only restriction: forks may not be commercialized as products that compete with better-cms.
