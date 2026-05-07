# Getting started

Five-minute setup for SvelteKit.

## 1. Scaffold

```bash
bunx -p @better-cms/cli bcms init
```

Writes:

- `src/lib/server/cms.ts` — server-only config module
- `src/hooks.server.ts` — wires `cmsHandle(cms)`
- `src/routes/cms/+page.server.ts` + `+page.svelte` — admin route
- `.env.example` — DB + S3 vars
- `drizzle.config.ts`

Then installs `better-cms`, `dotenv` (runtime) and `drizzle-kit`,
`@libsql/client` (dev). `--skip-install` prints the install commands instead.

## 2. Why `src/lib/server/`

SvelteKit refuses to import anything under `src/lib/server/` from client code.
That's the whole reason the CMS config lives there — the adapter holds your
DB credentials, and the type system + bundler enforce that they never cross
to the browser. You can read `process.env` at the top of `cms.ts` without
fear.

## 3. Edit your config

```ts
// src/lib/server/cms.ts
import 'dotenv/config';
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
	adapter: libsqlAdapter({
		url: process.env.DATABASE_URL!,
		authToken: process.env.DATABASE_AUTH_TOKEN,
	}),
});
```

## 4. Mount the handler

```ts
// src/hooks.server.ts
import cms from '$lib/server/cms';
import { cmsHandle } from 'better-cms/sveltekit';

export const handle = cmsHandle(cms);
```

The default base path is `/api/cms`. Override with `cms.basePath` if you need a different mount point.

## 5. Render the admin UI

```ts
// src/routes/cms/+page.server.ts
import cms from '$lib/server/cms';
import { clientCmsConfig } from 'better-cms/sveltekit';

export const load = () => ({ cms: clientCmsConfig(cms) });
```

```svelte
<!-- src/routes/cms/+page.svelte -->
<script lang="ts">
	import { CmsAdmin } from 'better-cms/admin';
	let { data } = $props();
</script>

<CmsAdmin config={data.cms} />
```

`clientCmsConfig` strips the server-only fields (adapter, media, auth, plugins) and returns `{ collections, basePath }` — JSON-safe to send through SvelteKit's load → page data flow.

## 6. Generate the database schema

```bash
bunx -p @better-cms/cli bcms generate   # emits src/lib/cms-schema.ts
bunx drizzle-kit push                    # uses ./drizzle.config.ts
```

## Next

- Read about [collections](/concepts/collections) and [fields](/concepts/fields)
- Wire up [SvelteKit remote functions](/integrations/sveltekit) for typed reads
- Generate types with the [CLI](/reference/cli)
