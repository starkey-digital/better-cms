import { createCmsClient } from 'better-cms/sveltekit';
import type { Cms } from './server/cms.ts';

export const cmsClient = createCmsClient<Cms>({ basePath: '/api/cms' });
