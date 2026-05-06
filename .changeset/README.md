# Changesets

This monorepo uses [changesets](https://github.com/changesets/changesets) to manage versions and changelogs.

## Adding a changeset

```sh
bunx changeset
```

All packages are in a `fixed` group — every release bumps every published package to the same version. Mirrors better-auth.

## Releasing

```sh
bunx changeset version   # consume changesets, bump versions, write changelogs
bun install              # update lockfile
bunx changeset publish   # build + publish to npm
```

## Published vs internal

Every workspace package under `packages/*` is published. The main published package is `better-cms` — it re-exports from the internal `@better-cms/*` packages via subpath exports, so users typically only `bun add better-cms` (transitive deps pull the rest).

CLI ships separately as `@better-cms/cli` with the `bcms` binary.
