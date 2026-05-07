import cms from '$lib/server/cms';
import { clientCMSConfig } from 'better-cms/sveltekit';

export const load = () => ({ cms: clientCMSConfig(cms) });
