import { getContext, setContext } from 'svelte';

const KEY = Symbol('bcms-media');

/** What `<ImageField>` needs from the admin shell: where the CMS API lives. */
export interface MediaContext {
	readonly basePath: string;
}

export const setMediaContext = (ctx: MediaContext) => setContext(KEY, ctx);
export const getMediaContext = (): MediaContext =>
	getContext<MediaContext | undefined>(KEY) ?? { basePath: '/api/cms' };
