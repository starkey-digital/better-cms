# CLI

The `bcms` binary ships in `@better-cms/cli`.

```bash
bunx -p @better-cms/cli bcms <command>
```

## Commands

### `bcms init`

Scaffold a new better-cms setup in an existing SvelteKit project. Writes the `$lib/cms/` layout: `server/cms.ts` (schemas, collections, adapter, plugins — server-only), `cms.remote.ts` (remote `query` / `command` / `form` endpoints), `client.ts` (`cmsClient` for the admin UI). Plus `src/hooks.server.ts`, `src/routes/cms/+page.svelte`, `.env.example`, `drizzle.config.ts`. Installs `better-cms` + `zod` + `dotenv` (runtime) plus `drizzle-kit` + `@libsql/client` (dev) using the project's package manager.

Flags:
- `--force` — overwrite existing files
- `--skip-install` — print install commands instead of running them

### `bcms generate`

Default target = `drizzle`. The other targets are opt-in.

| Target | Output | Use |
|---|---|---|
| `drizzle` (default) | `src/lib/cms-schema.ts` | Drizzle SQLite schema. Run after every schema change, then `drizzle-kit push`. |
| `types` | `src/lib/cms-types.ts` | Standalone TS interfaces. **Most users don't need this** — `z.infer<typeof Schema>` covers it. |

There is no client codegen step. `createCmsClient<Cms>()` lifts the types straight off your server config through a type-only import, and `<CmsAdmin>` reads its field metadata from `GET /_meta` at runtime.

```bash
bunx -p @better-cms/cli bcms generate
bunx -p @better-cms/cli bcms generate --target=types
```

Optional flags: `--config <path>` (override autodetection), `--out <path>` (override output).

### `bcms hash-password [pw]`

Emit a PBKDF2 hash for `passwordAuth`'s `passwordHash` option. Prompts if `[pw]` is omitted.

### `bcms gen-secret [bytes]`

Random hex secret (default 32 bytes) for `CMS_AUTH_SECRET`.

### `bcms mcp`

Start an MCP server exposing CMS read/write tools to LLMs. Works with Claude Code, Cursor, and any MCP-aware client.

```bash
bunx -p @better-cms/cli bcms mcp
```

The MCP server reuses the same op pipeline — no separate audit trail or validation path. Per-collection JSON Schema descriptors come from `def.toJsonSchema()`, which schema-first builders bake from `z.toJSONSchema(schema)`.
