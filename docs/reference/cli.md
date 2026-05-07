# CLI

The `bcms` binary ships in `@better-cms/cli`.

```bash
bunx -p @better-cms/cli bcms <command>
```

## Commands

### `bcms init`

Scaffold a new `better-cms` setup in an existing SvelteKit project.

### `bcms generate`

Read your `cmsConfig`, derive tables via `getCMSTables`, emit migration SQL and generated types.

### `bcms mcp`

Start an MCP server exposing CMS read/write tools to LLMs. Works with Claude Code, Cursor, and any MCP-aware client.

```bash
bunx -p @better-cms/cli bcms mcp
```

The MCP server reuses the same op pipeline — no separate audit trail or validation path.
