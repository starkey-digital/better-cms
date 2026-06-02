// Browser-safe surface. Server-only helpers re-export from
// `better-cms/sveltekit/server` (see ./server.ts).
export type { ClientCmsConfig } from '@better-cms/sveltekit';
export {
	createCmsClient,
	type CmsClient,
	type ClientAuthApi,
	type CollectionApi,
	type SingletonApi,
	type CreateCmsClientOpts,
	type CmsMeta,
	type CmsMetaCollection,
	type CmsMetaField,
} from '@better-cms/sveltekit';
