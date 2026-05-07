# Release v0.1.1

**Released:** 2026-05-07
**Previous version:** v0.1.0

Hotfix. The `0.1.0` `better-cms` tarball shipped `"workspace:*"` strings in `dependencies` because `changeset publish` invokes `npm publish` and npm doesn't rewrite the workspace protocol. Installs from the registry failed with `failed to resolve` for every internal `@better-cms/*` package.

## Bug Fixes

- Replaced the publish step with `bun publish` per package — Bun rewrites `workspace:*` → the resolved version of each workspace dep before uploading the tarball. `bun add better-cms` now installs cleanly with all transitive `@better-cms/*` packages pulled at the published version. (Reported during `0.1.0` post-publish smoke test.)

## Internal

- Added `scripts/publish-all.ts` — iterates non-private workspace packages, skips any whose current version is already on the registry, and publishes the rest via `bun publish --access public`. Replaces `changeset publish` in the release flow.
