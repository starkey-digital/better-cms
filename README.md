# better-cms

Drop-in headless CMS for SvelteKit (React/Next planned). BYO database, BYO storage. SSR-first. LLM-first.

> Status: pre-alpha.

## What is this

Like [better-auth](https://better-auth.com), but for content. Bring a libsql/SQLite URL + an S3-compatible bucket + a config file, get a typed CMS bolted to your site.

```sh
bun add better-cms
```

```ts
import { defineCMS, collection, text, richText, image } from 'better-cms';
import { libsqlAdapter } from 'better-cms/adapters/libsql';
import { s3Media } from 'better-cms/media/s3';

export default defineCMS({
  collections: {
    posts: collection({
      fields: {
        title: text({ required: true }),
        body:  richText(),
        cover: image(),
      },
    }),
  },
  adapter: libsqlAdapter({ url: process.env.DATABASE_URL! }),
  media:   s3Media({ bucket: process.env.S3_BUCKET! }),
});
```

See [`packages/better-cms/README.md`](./packages/better-cms/README.md) for the full surface.

## Repo layout

| Path | Published as | What |
|---|---|---|
| `packages/better-cms` | `better-cms` | Main published shell — re-export hub for subpath imports. |
| `packages/core` | `@better-cms/core` | IR, DSL, contracts, request handler, ops kernel. |
| `packages/adapter-libsql` | `@better-cms/adapter-libsql` | Direct libsql ContentStore. |
| `packages/adapter-drizzle` | `@better-cms/adapter-drizzle` | Drizzle ContentStore. |
| `packages/media-s3` | `@better-cms/media-s3` | S3-compatible MediaStore. |
| `packages/sveltekit` | `@better-cms/sveltekit` | SvelteKit handle + remote-function helpers. |
| `packages/admin` | `@better-cms/admin` | `<CMSAdmin>` Svelte 5 admin component. |
| `packages/cli` | `@better-cms/cli` | `bcms` CLI — init / generate / mcp. |
| `plugins/claude-code` | (Claude Code plugin) | Skills + MCP server registration. |

End users only `bun add better-cms`. Internal `@better-cms/*` packages are pulled transitively or installed directly by power users.

## Develop

```sh
bun install
bun run --filter '*' typecheck
cd packages/better-cms && bun run build   # tsdown emits dist/
```

## Release

Changesets, single fixed group across every published package.

```sh
bunx changeset
bunx changeset version
bunx changeset publish
```

See [`CLAUDE.md`](./CLAUDE.md) for invariants.

## License

[PolyForm Shield 1.0.0](./LICENSE) — source-available, noncompete.

You can:
- Use better-cms for any purpose (commercial site, agency work, internal tooling, SaaS product, etc.)
- Self-host on any infrastructure (Turso, libsql, SQLite, R2, S3, Wasabi, B2 — your call)
- Modify, fork, redistribute (free or paid), build derivatives

You **cannot**:
- Build and offer a product that competes with better-cms (e.g. fork it and sell `cooler-cms` as a hosted or shrink-wrapped CMS)

No sunset — restriction is permanent. If you want to build something competing, contact for a commercial license.

Copyright © 2026 Starkey Digital Ltd.
