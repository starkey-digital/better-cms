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
- **All internal `@better-cms/*` packages publish built `dist/` (not raw `.ts`).** `core`, `sveltekit`, `adapter-libsql`, `adapter-drizzle`, `media-s3`, `cli` use `tsc -p tsconfig.build.json`. `admin` uses `svelte-package` (preserves `.svelte`, compiles `.ts`). Each `package.json` `exports` map carries a `dev-source` condition pointing at `./src/*.ts` for tooling that opts in, plus `types`/`default` pointing at `./dist/`.
- **CI runs `bun run --filter './packages/*' build` before typecheck.** Cross-pkg type resolution + example typecheck both depend on `dist/` existing. Bun honours topological order via `--filter`.
- **SvelteKit consumers do NOT need `ssr.noExternal` for `better-cms` / `@better-cms/*`** — published artifacts are `.js` and externalize cleanly.
- **SvelteKit example pkgs need `"prepare": "svelte-kit sync || true"`** so `.svelte-kit/tsconfig.json` exists before svelte-check.

`peerDependenciesMeta.<x>.optional: true` on every framework/db/SDK peer. User installs only what their imports require.

## Svelte 5 (admin package)

- **Avoid `$effect` for state mutation.** Prefer `$derived` for computed values, `onMount` + click handlers for async IO. Watch+`untrack()` only as last resort.
- Async data fetches belong in event handlers, not effects.

## Architecture invariants

- `getCMSTables(config)` is the single source of truth — CLI, runtime, adapters all call it. Never reach into `config.collections` directly.
- **Default API basePath is `/api/cms`** — leaves `/cms` free for the user's admin route. Override `config.basePath` only when integrating with a different mount point.
- **`config.adapter` and `config.media` are `LazyAdapter<T> = T | (() => T | Promise<T>)`.** Templates ship the thunk form (`adapter: () => libsqlAdapter({ url: process.env.X! })`) so the config module is safe to import from client code — `<CMSAdmin {config}>` doesn't trip `process.env` access in the browser. `createCMS()` resolves the thunk once at boot and caches the resolved adapter. Anything reading `config.adapter` directly (e.g. CLI/MCP) must call the local `resolveAdapter` helper first.
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

**Tag-driven GitOps.** Tag = command, CI = effect. Day-to-day commits to main run CI only (typecheck), no publish.

### Flow

User-side — just write notes and tag:

1. (optional) Write `changelog/RELEASE_v<X.Y.Z>.md` for richer notes (the `/release` skill drafts this). Commit and push it.
2. Tag and push: `git tag v<X.Y.Z> && git push --follow-tags`. Or do steps 1+2 in one shot via `gh release create v<X.Y.Z> --notes-file changelog/RELEASE_v<X.Y.Z>.md`.

CI-side — `release.yml` on `push: tags: v*`:

3. Checks the tag commit is on main. Derives `<X.Y.Z>` from `${GITHUB_REF_NAME#v}`.
4. Runs `bun run bump <X.Y.Z>` — bumps every published `packages/*/package.json` and `plugins/claude-code/plugin.json` (lockstep, all 8 packages + plugin).
5. Refreshes `bun.lock`, commits `release: v<X.Y.Z> [skip ci]`, pushes back to main. The `[skip ci]` token stops GH from re-firing CI on the bump push.
6. Builds main pkg, runs `scripts/publish-all.ts` (`bun publish` per non-private workspace).
7. Creates the GitHub release from `changelog/RELEASE_v<X.Y.Z>.md` if present, else `--generate-notes`. Skips if a release at that tag already exists (e.g. user created it via `gh release create`).

In parallel — `docs.yml` on the same tag push builds + deploys `apps/docs/` to GitHub Pages.

### Caveat — tag points pre-bump

The tag points to the user's commit, which still shows the previous version in `package.json`. The bump commit lands on main *after* the tag. Anyone running `git checkout v<X.Y.Z>` sees the old version locally; npm tarballs are always correct (CI bumps before `bun publish`). Standard semantic-release tradeoff.

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
