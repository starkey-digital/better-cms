# SvelteKit integration

Mount the handler, render the admin, read content from server load functions or remote functions.

The CMS config is a server-only module — `src/lib/server/cms.ts` by convention. SvelteKit's bundler rejects any client-side import of files under `src/lib/server/`, so adapter credentials, media keys, and auth secrets stay on the server.

## Handler

```ts
// src/hooks.server.ts
import cms from '$lib/server/cms';
import { cmsHandle } from 'better-cms/sveltekit';

export const handle = cmsHandle(cms);
```

## Reading content (server)

```ts
// src/routes/blog/+page.server.ts
import cmsConfig from '$lib/server/cms';
import { cms, serverApi } from 'better-cms/sveltekit';

export async function load() {
	const instance = await cms(cmsConfig);
	const api = serverApi(instance.context);
	const posts = await api.list('posts', { limit: 20 });
	return { posts };
}
```

`api.list / api.find / api.count / api.getSingleton` are fully typed from your collection definition.

## Reading content (remote functions)

```ts
// src/routes/blog/data.remote.ts
import cmsConfig from '$lib/server/cms';
import { listCollection } from 'better-cms/sveltekit/remote';

export const listPosts = listCollection(cmsConfig, 'posts');
```

Then call from a client component without a manual `+page.server.ts`.

## Admin page

```ts
// src/routes/cms/+page.server.ts
import cms from '$lib/server/cms';
import { clientCMSConfig } from 'better-cms/sveltekit';

export const load = () => ({ cms: clientCMSConfig(cms) });
```

```svelte
<!-- src/routes/cms/+page.svelte -->
<script lang="ts">
	import { CMSAdmin } from 'better-cms/admin';
	let { data } = $props();
</script>

<CMSAdmin config={data.cms} />
```

`clientCMSConfig` returns the JSON-safe slice the admin actually uses (`{ collections, basePath }`). Adapter, media, auth, and plugins never cross to the browser.

## Live updates

Operations broadcast via the handler. Admin and any subscribed page update without a refresh.
