# CLI

The `bcms` binary ships in `@better-cms/cli`.

```bash
bunx -p @better-cms/cli bcms <command>
```

## Commands

### `bcms init`

Scaffold a new better-cms setup in an existing SvelteKit project. Writes `src/lib/server/cms.ts`, `src/hooks.server.ts`, `src/routes/cms/+page.{server.ts,svelte}`, `.env.example`, `drizzle.config.ts`, and installs `better-cms` + `dotenv` (runtime) plus `drizzle-kit` + `@libsql/client` (dev) using the project's package manager.

Flags:
- `--force` — overwrite existing files
- `--skip-install` — print install commands instead of running them

### `bcms generate`

Three targets:

| Target | Output | Use |
|---|---|---|
| `drizzle` (default) | `src/lib/cms-schema.ts` | Drizzle SQLite schema. Run after every schema change, then `drizzle-kit push`. |
| `types` | `src/lib/cms-types.ts` | Standalone TS interfaces (most users don't need this — `defineCMS` already infers types). |
| `client` | `src/lib/cmsClient.ts` | Browser-safe typed client (`cmsClient.posts.list()`, `cmsClient.auth.getUser()`, etc.) plus `cmsConfig` for `<CmsAdmin>`. |

```bash
bunx -p @better-cms/cli bcms generate
bunx -p @better-cms/cli bcms generate --target=client
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

The MCP server reuses the same op pipeline — no separate audit trail or validation path.
