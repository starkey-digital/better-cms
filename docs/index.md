# better-cms

Drop-in headless CMS for SvelteKit. React/Next planned.

Schema-first: write a zod schema, get a typed admin UI, REST handler, and server + browser runtime API for free. Backed by libSQL or any Drizzle-supported database. Pluggable media via S3.

## Why

Most headless CMSes force you into their schema model, hosted dashboard, and runtime. better-cms inverts it: your repo defines the schema in zod, the framework integration mounts a handler, and the admin UI is a component you render anywhere. Validation flows from zod to write-path, query input, and admin form — single source of truth.

## Install

```bash
bun add better-cms zod @libsql/client
```

You install one better-cms package — `better-cms` — and it pulls every adapter and integration transitively. The schema-first DSL lives at `better-cms/zod`.

Database drivers and storage SDKs are the exception: they are **optional peer dependencies**, so you install only the one your config actually uses. Nothing is pulled in for a backend you never touch.

| If your config uses | also install |
| --- | --- |
| `libsqlAdapter` | `@libsql/client` |
| `drizzleAdapter` | `drizzle-orm` (plus your driver) |
| `s3Media` | `@aws-sdk/client-s3` `@aws-sdk/s3-request-presigner` |

## Quick links

- [Getting started](/getting-started)
- [Collections](/concepts/collections)
- [Fields](/concepts/fields)
- [Operations](/concepts/operations)
- [Authentication](/concepts/auth)
- [Access control](/concepts/access-control)
- [Hooks](/concepts/hooks)
- [SvelteKit integration](/integrations/sveltekit)
- [CLI reference](/reference/cli)
