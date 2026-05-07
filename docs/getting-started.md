# Getting started

Five-minute setup for SvelteKit.

## 1. Scaffold

```bash
bunx -p @better-cms/cli bcms init
```

Writes `src/lib/cms.config.ts`, `src/hooks.server.ts`, `.env.example`,
`drizzle.config.ts`, then installs `better-cms`, `dotenv`, `drizzle-kit`,
`@libsql/client`. Pass `--skip-install` to print the install commands instead
of running them.

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
	adapter: () =>
		libsqlAdapter({
			url: process.env.DATABASE_URL!,
			authToken: process.env.DATABASE_AUTH_TOKEN,
		}),
});
```

`adapter` is a thunk — it evaluates only on the server when the runtime boots,
so this module is safe to import from client code (e.g. `<CMSAdmin {config}>`).

## 3. Mount the handler

`bcms init` writes this for you:

```ts
// src/hooks.server.ts
import 'dotenv/config';
import { cmsHandle } from 'better-cms/sveltekit';
import config from '$lib/cms.config';

export const handle = cmsHandle(config);
```

`import 'dotenv/config'` populates `process.env` for the adapter thunk during
local dev — Vite doesn't auto-populate `process.env` from `.env`. Production
runtimes typically inject env directly, but the dotenv import is harmless.

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

## Next

- Read about [collections](/concepts/collections) and [fields](/concepts/fields)
- Wire up [SvelteKit remote functions](/integrations/sveltekit) for typed reads
- Generate types with the [CLI](/reference/cli)
