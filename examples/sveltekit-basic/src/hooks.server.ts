import cms from '$lib/cms/server/cms';
import { cmsHandle } from 'better-cms/sveltekit/server';

export const handle = cmsHandle(cms);
