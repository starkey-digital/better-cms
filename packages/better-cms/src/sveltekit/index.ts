// Browser-safe surface. Server-only helpers re-export from
// `better-cms/sveltekit/server` (see ../sveltekit-server/index.ts).
export { clientCmsConfig, type ClientCmsConfig } from '@better-cms/sveltekit';
export {
	createCmsClient,
	type CmsClient,
	type ClientAuthApi,
	type CollectionApi,
	type SingletonApi,
} from '@better-cms/sveltekit';
