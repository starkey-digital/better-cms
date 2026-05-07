# better-cms

Drop-in headless CMS for SvelteKit. React/Next planned.

Define collections in code. Get a typed admin UI, REST handler, and runtime API for free. Backed by libSQL or any Drizzle-supported database. Pluggable media via S3.

## Why

Most headless CMSes force you into their schema model, hosted dashboard, and runtime. better-cms inverts it: your repo defines the schema, the framework integration mounts a handler, and the admin UI is a component you render anywhere.

## Install

```bash
bun add better-cms
```

End users only install `better-cms`. Transitive deps pull adapters and integrations as needed.

## Quick links

- [Getting started](/getting-started)
- [Collections](/concepts/collections)
- [Fields](/concepts/fields)
- [Operations](/concepts/operations)
- [SvelteKit integration](/integrations/sveltekit)
- [CLI reference](/reference/cli)
