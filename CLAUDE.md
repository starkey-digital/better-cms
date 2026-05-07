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
apps/
└── docs/              # PRIVATE — SvelteKit static docs site, deployed to GitHub Pages on `v*` tag push
docs/                  # Public docs source (markdown), read by `apps/docs/` at build via `import.meta.glob`
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

- **`dts: true`** in tsdown config (NOT `dts: { build: true, incremental: true }` — project-reference mode fails on workspace re-export shells).
- **CI runs `bun run --filter better-cms build` before typecheck.** Examples reference subpath types from `dist/` — typecheck fails on a fresh checkout otherwise.
- **SvelteKit consumers need `ssr.noExternal: ['better-cms', /^@better-cms\//]` in `vite.config.ts`.** Vite externalizes workspace `.ts` packages by default → `ERR_MODULE_NOT_FOUND` at SSR. (Once consumers install from npm with proper `dist/`, this becomes unnecessary.)
- **SvelteKit example pkgs need `"prepare": "svelte-kit sync || true"`** so `.svelte-kit/tsconfig.json` exists before svelte-check.

`peerDependenciesMeta.<x>.optional: true` on every framework/db/SDK peer. User installs only what their imports require.

## Svelte 5 (admin package)

- **Avoid `$effect` for state mutation.** Prefer `$derived` for computed values, `onMount` + click handlers for async IO. Watch+`untrack()` only as last resort.
- Async data fetches belong in event handlers, not effects.

## Architecture invariants

- `getCMSTables(config)` is the single source of truth — CLI, runtime, adapters all call it. Never reach into `config.collections` directly.
- **Default API basePath is `/api/cms`** — leaves `/cms` free for the user's admin route. Override `config.basePath` only when integrating with a different mount point.
- Storage hint per field: scalars + single relations = column; complex (richText/array/object/image/file/relation many) = JSON column. Core's `serializeRow`/`deserializeRow` handle conversion — adapters receive already-serialized rows.
- Singletons use fixed id `"default"`. Dedicated `GET/PUT /singletons/:name` routes. Discriminated via `CollectionDef<F, 'singleton'>`.
- Field types are phantom-typed: `FieldDef<TOut>` carries value type; DSL builders propagate it; `defineCMS<C>` captures verbatim → `serverApi`, remote helpers, admin all gain inference.
- Three modes (inline edit, admin save, LLM/MCP tool call) all reduce to `CMSOp` → `applyOps()` → live broadcast. One audit trail.

## Conventions

- No comments explaining WHAT — only non-obvious WHY.
- Adapters never re-implement core utilities (`slugify`, `generateId`, `validateRow`, `serializeRow`, `applyOps`, `opToEventType`).
- `as never` casts banned — use real upstream types (e.g. `InValue` from `@libsql/client`).
- Per-project plugin config: `.claude/better-cms.local.md` (gitignored). Template in `plugins/claude-code/SETTINGS.md`.

## Documentation

- Live at <https://starkey-digital.github.io/better-cms/>. Source markdown lives in `docs/` at repo root; site code in `apps/docs/` (SvelteKit + adapter-static + Tailwind v4 + Shiki).
- Deploys via `.github/workflows/docs.yml` on every `v*` tag push and manual dispatch.
- **When changing public API in `packages/*`, update the matching `.md` in `docs/` in the same PR.** Sync is manual — no CI guard.

## Releasing

**Tag-driven, fully automated.** Push a `v*` tag → CI publishes to npm + deploys docs. Day-to-day commits to main run CI only (typecheck), no publish.

### Flow

1. `bun run bump <X.Y.Z>` — bumps every published `packages/*/package.json` and `plugins/claude-code/plugin.json` to target version (lockstep, all 8 packages + plugin). Idempotent.
2. (optional) Write `changelog/RELEASE_v<X.Y.Z>.md` for richer release notes; otherwise GH auto-generates from commits.
3. `git commit -am "release: vX.Y.Z" && git tag vX.Y.Z && git push --follow-tags`
4. CI fires:
   - **`release.yml`** — verifies tag matches `packages/better-cms/package.json` version, builds main pkg, runs `scripts/publish-all.ts` (`bun publish` per non-private workspace), creates GH release.
   - **`docs.yml`** — builds + deploys `apps/docs/` to GitHub Pages.

### Publishing notes

- **Publish via `bun publish`, NOT `npm publish`.** `npm publish` leaves `workspace:*` literal in published tarballs → installs fail. `scripts/publish-all.ts` iterates non-private workspace pkgs calling `bun publish` (rewrites workspace protocol).
- **Bun reads `.npmrc` literally — no `${VAR}` expansion.** CI writes the literal token: `echo "//registry.npmjs.org/:_authToken=$NPM_TOKEN" > .npmrc`. The `${NODE_AUTH_TOKEN}` template setup-node generates is ignored by `bun publish`.
- **For "did it actually publish?", use `curl -s https://registry.npmjs.org/<encoded-name>` not `npm view`.** `npm view` has aggressive registry cache and lies right after a publish. Encode `/` → `%2F` for scoped packages.
- **Granular npm tokens need org-level access** to create new scoped packages. The token's "Packages and scopes" list alone isn't enough — add the `better-cms` org under "Organizations: Read and write" too.
- **Trusted publishing is per-existing-package.** Bootstrap first publish with a short-lived `NPM_TOKEN` granular token, then configure trusted publishers per-package, then delete the token.

### Release Preferences

- **Tag format:** `v0.1.0` (with `v` prefix). Tag = single source of truth — must match `packages/better-cms/package.json` version (CI verifies).
- **Version lockstep:** all 8 published packages + `plugins/claude-code/plugin.json` move together via `bun run bump`.
- **GitHub releases:** auto-created by `release.yml` — uses `changelog/RELEASE_<tag>.md` if present, else `--generate-notes`.
- **Issue/PR linking:** append `(#N)` to user-facing changelog entries.
- **Changelog file location:** `changelog/RELEASE_<tag>.md` (e.g. `RELEASE_v0.2.0.md`).
