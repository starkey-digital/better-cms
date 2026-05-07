import { env } from '$env/dynamic/private';
import config from '$lib/cms.config';
import { cmsHandle } from 'better-cms/sveltekit';

export const handle = cmsHandle(config, { env });
