// Browser-safe entry. Server-only helpers (createCms, cmsHandle, request
// context) live in `better-cms/sveltekit/server` so the universal import
// never drags Node-only modules into client bundles.
export { type ClientCmsConfig } from '@better-cms/core';
export {
	createCmsClient,
	type ClientAuthApi,
	type CmsClient,
	type CollectionApi,
	type SingletonApi,
	type CreateCmsClientOpts,
	type CmsMeta,
	type CmsMetaCollection,
	type CmsMetaField,
} from './api-client.js';
