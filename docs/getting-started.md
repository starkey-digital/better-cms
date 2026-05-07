# Getting started

Five-minute setup for SvelteKit.

## 1. Scaffold

```bash
bunx -p @better-cms/cli bcms init
```

Writes `src/lib/cms.config.ts`, `src/hooks.server.ts`, `.env.example`,
`drizzle.config.ts`, then installs `better-cms` (runtime) and `drizzle-kit`,
`@libsql/client`, `dotenv` (dev). Pass `--skip-install` to print the install
commands instead of running them.

## 2. Define your CMS

`bcms init` writes a starter `src/lib/cms.config.ts`. Edit collections to taste:

```ts
// src/lib/cms.config.ts
import { defineCMS, collection, text, richText } from 'better-cms';
import { libsqlAdapter } from 'better-cms/adapters/libsql';

export default defineCMS({
	collections: {
		posts: collection({
			fields: {
				title: text({ required: true }),
				slug: text({ required: true, unique: true }),
				body: richText(),
			},
		}),
	},
	adapter: ({ env }) =>
		libsqlAdapter({
			url: env.DATABASE_URL!,
			authToken: env.DATABASE_AUTH_TOKEN,
		}),
});
```

`adapter` is a factory — it runs only on the server when the runtime boots,
and receives `{ env }` from the handler. The config module is safe to import
from client code (e.g. `<CMSAdmin {config}>`) because it never touches
`process.env` or any other server-only API at module scope.

## 3. Mount the handler

```ts
// src/hooks.server.ts
import { env } from '$env/dynamic/private';
import { cmsHandle } from 'better-cms/sveltekit';
import config from '$lib/cms.config';

export const handle = cmsHandle(config, { env });
```

`$env/dynamic/private` is SvelteKit's server-only env namespace. It's wired
through to your adapter factory, so secrets stay out of the client bundle and
you don't need `dotenv` in the runtime path.

The default base path is `/api/cms`. Override with `config.basePath` if you need a different mount point.

## 4. Render the admin UI

```svelte
<script lang="ts">
	import { CMSAdmin } from 'better-cms/admin';
	import config from '$lib/cms.config';
</script>

<CMSAdmin {config} />
```

Mount at `/cms` (or anywhere — the admin route is yours). The admin talks to the handler at `/api/cms`.

## 5. Generate the database schema

```bash
bunx -p @better-cms/cli bcms generate   # emits src/lib/cms-schema.ts
bunx drizzle-kit push                    # uses ./drizzle.config.ts
```

`drizzle.config.ts` is wired with `import 'dotenv/config'` because
`drizzle-kit` runs as its own CLI and needs `.env` loaded explicitly — that's
separate from the runtime path above.

## Next

- Read about [collections](/concepts/collections) and [fields](/concepts/fields)
- Wire up [SvelteKit remote functions](/integrations/sveltekit) for typed reads
- Generate types with the [CLI](/reference/cli)
