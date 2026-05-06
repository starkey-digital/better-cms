# better-cms

Drop-in headless CMS for SvelteKit (React/Next planned). Bun monorepo, mirrors better-auth's publish strategy.

## Workspace layout

```
packages/
├── better-cms/        # PUBLISHED as `better-cms` — main re-export shell, tsdown unbundle:true
├── core/              # PUBLISHED as `@better-cms/core` — IR, DSL, contracts, handler, ops
├── adapter-libsql/    # PUBLISHED as `@better-cms/adapter-libsql`
├── adapter-drizzle/   # PUBLISHED as `@better-cms/adapter-drizzle`
├── media-s3/          # PUBLISHED as `@better-cms/media-s3`
├── sveltekit/         # PUBLISHED as `@better-cms/sveltekit`
├── admin/             # PUBLISHED as `@better-cms/admin`
└── cli/               # PUBLISHED as `@better-cms/cli` — bin: bcms
plugins/claude-code/   # Claude Code plugin (skills + MCP server registration)
```

All packages publish (no internal-only). End users install **`better-cms`**; transitive deps pull the rest. Internal `@better-cms/*` packages are available for advanced consumers and the CLI.

## Subpath imports (end-user surface)

```ts
import { defineCMS, collection, text, image } from 'better-cms';
import { libsqlAdapter }  from 'better-cms/adapters/libsql';
import { drizzleAdapter } from 'better-cms/adapters/drizzle';
import { s3Media }        from 'better-cms/media/s3';
import { cmsHandle, cms, serverApi } from 'better-cms/sveltekit';
import { listCollection, runOps }    from 'better-cms/sveltekit/remote';
import { CMSAdmin }       from 'better-cms/admin';
import type { Post }      from 'better-cms/types';
```

## Commands

- `bun install` — workspace resolve
- `bun run --filter '*' typecheck` — typecheck every package
- `cd packages/better-cms && bun run build` — tsdown emits `dist/` per-entry (`.mjs` + `.d.mts`)
- `bunx changeset` / `bunx changeset version` / `bunx changeset publish` — release flow (fixed group, all pkgs bump together)
- CLI: `bunx -p @better-cms/cli bcms <init|generate|mcp>`

## TypeScript

- `noUncheckedIndexedAccess` ON — regex match groups need `!` or guards (`m[1]!`).
- `verbatimModuleSyntax` ON — `import type` mandatory for types.
- Workspace pkgs export `./src/index.ts` directly during dev (no build needed for cross-pkg imports). Published pkgs use `dist/`.

## Build (main pkg)

`packages/better-cms/tsdown.config.ts` uses `unbundle: true` + per-entry — emits one `.mjs` per subpath. Subpath isolation: importing `better-cms/sveltekit` does NOT pull svelte/react/drizzle code.

`peerDependenciesMeta.<x>.optional: true` on every framework/db/SDK peer. User installs only what their imports require.

## Svelte 5 (admin package)

- **Avoid `$effect` for state mutation.** Prefer `$derived` for computed values, `onMount` + click handlers for async IO. Watch+`untrack()` only as last resort.
- Async data fetches belong in event handlers, not effects.

## Architecture invariants

- `getCMSTables(config)` is the single source of truth — CLI, runtime, adapters all call it. Never reach into `config.collections` directly.
- Storage hint per field: scalars + single relations = column; complex (richText/array/object/image/file/relation many) = JSON column. Core's `serializeRow`/`deserializeRow` handle conversion — adapters receive already-serialized rows.
- Singletons use fixed id `"default"`. Dedicated `GET/PUT /singletons/:name` routes. Discriminated via `CollectionDef<F, 'singleton'>`.
- Field types are phantom-typed: `FieldDef<TOut>` carries value type; DSL builders propagate it; `defineCMS<C>` captures verbatim → `serverApi`, remote helpers, admin all gain inference.
- Three modes (inline edit, admin save, LLM/MCP tool call) all reduce to `CMSOp` → `applyOps()` → live broadcast. One audit trail.

## Conventions

- No comments explaining WHAT — only non-obvious WHY.
- Adapters never re-implement core utilities (`slugify`, `generateId`, `validateRow`, `serializeRow`, `applyOps`, `opToEventType`).
- `as never` casts banned — use real upstream types (e.g. `InValue` from `@libsql/client`).
- Per-project plugin config: `.claude/better-cms.local.md` (gitignored). Template in `plugins/claude-code/SETTINGS.md`.

## Releasing

Changesets in `fixed` group — every published pkg bumps together. CLI ships separately under same version (in same fixed group).
