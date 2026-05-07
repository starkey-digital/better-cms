import { cmsHandle } from 'better-cms/sveltekit';
import config from '$lib/cms.config';

export const handle = cmsHandle(config);
