# better-cms

Drop-in headless CMS for SvelteKit. React/Next planned.

Schema-first: write a zod schema, get a typed admin UI, REST handler, and server + browser runtime API for free. Backed by libSQL or any Drizzle-supported database. Pluggable media via S3.

## Why

Most headless CMSes force you into their schema model, hosted dashboard, and runtime. better-cms inverts it: your repo defines the schema in zod, the framework integration mounts a handler, and the admin UI is a component you render anywhere. Validation flows from zod to write-path, query input, and admin form — single source of truth.

## Install

```bash
bun add better-cms zod
```

End users install `better-cms` (transitive deps pull adapters and integrations) plus `zod` directly. The schema-first DSL lives at `better-cms/zod`.

## Quick links

- [Getting started](/getting-started)
- [Collections](/concepts/collections)
- [Fields](/concepts/fields)
- [Operations](/concepts/operations)
- [SvelteKit integration](/integrations/sveltekit)
- [CLI reference](/reference/cli)
