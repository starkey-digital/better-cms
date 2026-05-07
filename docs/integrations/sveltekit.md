# SvelteKit integration

Mount the handler, render the admin, read content from server load functions or remote functions.

## Handler

```ts
// src/hooks.server.ts
import { cmsHandle } from 'better-cms/sveltekit';
import { cmsConfig } from '$lib/cms';

export const handle = cmsHandle(cmsConfig);
```

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
	import { cmsConfig } from '$lib/cms';
</script>

<CMSAdmin config={cmsConfig} />
```

## Live updates

Operations broadcast via the handler. Admin and any subscribed page update without a refresh.
