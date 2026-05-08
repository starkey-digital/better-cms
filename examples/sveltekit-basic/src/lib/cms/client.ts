import { clientCmsConfig, createCmsClient } from 'better-cms/sveltekit';
import { collections } from './schemas.js';

export const cmsConfig = clientCmsConfig({ collections, basePath: '/api/cms' });
export const cmsClient = createCmsClient(cmsConfig);
