import { cmsHandle } from 'better-cms/sveltekit/server';
import cms from '#lib/cms/server/cms.ts';

export const handle = cmsHandle(cms);
