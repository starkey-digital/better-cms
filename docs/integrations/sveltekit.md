# SvelteKit integration

Mount the handler, render the admin, read content from server load functions or remote functions.

## Handler

```ts
// src/hooks.server.ts
import 'dotenv/config';
import { cmsHandle } from 'better-cms/sveltekit';
import config from '$lib/cms.config';

export const handle = cmsHandle(config);
```

`import 'dotenv/config'` populates `process.env` so the adapter thunks in
`cms.config.ts` see `DATABASE_URL` during local dev. SvelteKit's
`$env/dynamic/private` works inside request handlers but not in modules
imported outside the request scope.

Default mount point: `/api/cms`. Override with `cmsConfig.basePath` if needed. Leaves `/cms` free for the admin page.

## Reading content (server)

```ts
// src/routes/blog/+page.server.ts
import { serverApi } from 'better-cms/sveltekit';
import { cmsConfig } from '$lib/cms';

const cms = serverApi(cmsConfig);

export async function load() {
	const posts = await cms.posts.list({ orderBy: { createdAt: 'desc' } });
	return { posts };
}
```

`cms.posts` is fully typed from your collection definition.

## Reading content (remote functions)

```ts
// src/routes/blog/data.remote.ts
import { listCollection } from 'better-cms/sveltekit/remote';
import { cmsConfig } from '$lib/cms';

export const listPosts = listCollection(cmsConfig, 'posts');
```

Then call from a client component without a manual `+page.server.ts`.

## Admin page

```svelte
<!-- src/routes/cms/+page.svelte -->
<script lang="ts">
	import { CMSAdmin } from 'better-cms/admin';
	import config from '$lib/cms.config';
</script>

<CMSAdmin {config} />
```

The config module is safe to import from client code: `adapter` and `media` are
thunks that fire only on the server (when `cmsHandle()` boots the runtime).
`process.env` reads stay out of the browser bundle.

## Live updates

Operations broadcast via the handler. Admin and any subscribed page update without a refresh.
