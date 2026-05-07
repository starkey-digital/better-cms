// Browser-safe entry. Server-only helpers (cmsHandle, createCms,
// request context) live in `better-cms/sveltekit/server` so the universal
// import never drags Node-only modules into client bundles.
export { clientCmsConfig, type ClientCmsConfig } from '@better-cms/core';
export {
	createCmsClient,
	type ClientAuthApi,
	type CmsClient,
	type CollectionApi,
	type SingletonApi,
} from './api-client.js';
