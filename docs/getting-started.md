# Getting started

Five-minute setup for SvelteKit.

## 1. Install

```bash
bun add better-cms @libsql/client
```

## 2. Define your CMS

```ts
// src/lib/cms.ts
import { defineCMS, collection, text, richText } from 'better-cms';
import { libsqlAdapter } from 'better-cms/adapters/libsql';

export const cmsConfig = defineCMS({
	adapter: libsqlAdapter({ url: 'file:cms.db' }),
	collections: {
		posts: collection({
			fields: {
				title: text({ required: true }),
				slug: text({ required: true, unique: true }),
				body: richText(),
			},
		}),
	},
});
```

## 3. Mount the handler

```ts
// src/hooks.server.ts
import { cmsHandle } from 'better-cms/sveltekit';
import { cmsConfig } from '$lib/cms';

export const handle = cmsHandle(cmsConfig);
```

The default base path is `/api/cms`. Override with `config.basePath` if you need a different mount point.

## 4. Add `ssr.noExternal` (workspace-only)

If consuming `better-cms` from a workspace before publishing, add to `vite.config.ts`:

```ts
ssr: { noExternal: ['better-cms', /^@better-cms\//] }
```

Once installed from npm with built `dist/`, this is unnecessary.

## 5. Render the admin UI

```svelte
<script lang="ts">
	import { CMSAdmin } from 'better-cms/admin';
	import { cmsConfig } from '$lib/cms';
</script>

<CMSAdmin config={cmsConfig} />
```

Mount at `/cms` (or anywhere — the admin route is yours). The admin talks to the handler at `/api/cms`.

## Next

- Read about [collections](/concepts/collections) and [fields](/concepts/fields)
- Wire up [SvelteKit remote functions](/integrations/sveltekit) for typed reads
- Generate types with the [CLI](/reference/cli)
