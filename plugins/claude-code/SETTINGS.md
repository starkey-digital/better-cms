# better-cms plugin settings

Per-project configuration for the better-cms Claude Code plugin lives at `.claude/better-cms.local.md`.

This file is **optional**. If absent, the plugin uses defaults: `bunx better-cms` for the CLI, autodetected `cms.config.ts` location, MCP server enabled.

## Template

Copy into your project root, then edit:

```markdown
---
enabled: true
config_path: src/lib/cms.config.ts
cli: bunx better-cms
mcp_enabled: true
default_target: drizzle
---

# better-cms project notes

Optional free-text notes the plugin's skills will read when planning edits.
Examples:
- Treat singletons as drafts until `published: true` flag flips.
- Always set `cover` on posts (no fallback image policy).
```

## Frontmatter fields

| Field | Default | Purpose |
|---|---|---|
| `enabled` | `true` | Hard switch — set `false` to suppress plugin behavior in this project. |
| `config_path` | autodetect | Override config location for `bunx better-cms ...` commands. |
| `cli` | `bunx better-cms` | Command prefix the skills shell out to. Use `pnpm exec better-cms` etc. if not on bun. |
| `mcp_enabled` | `true` | If false, skills will not assume the MCP server is available. |
| `default_target` | `drizzle` | Default `--target` for generate. |

## Gitignore

Add to your `.gitignore`:

```
.claude/*.local.md
```

The settings file may contain project-specific paths and notes that aren't useful to other contributors.

## Restart

Claude Code must be restarted after creating or editing `.claude/better-cms.local.md` for hooks/skills to pick up the new values.
