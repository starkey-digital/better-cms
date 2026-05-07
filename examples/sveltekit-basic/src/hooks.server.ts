import cms from '$lib/server/cms';
import { cmsHandle } from 'better-cms/sveltekit';

export const handle = cmsHandle(cms);
