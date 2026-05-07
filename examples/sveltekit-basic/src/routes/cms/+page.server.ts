import config from '$lib/server/cms';
import { clientCmsConfig } from 'better-cms/sveltekit';

export const load = () => ({ cms: clientCmsConfig(config) });
