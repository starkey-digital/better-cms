import type { CmsMeta } from '@better-cms/sveltekit';
import { createContext } from 'svelte';
import type { AdminClient } from './logic/types.js';

export type ToastTone = 'ok' | 'bad';

export type AdminContext = {
	client: AdminClient;
	meta: CmsMeta;
	notify(text: string, tone?: ToastTone): void;
};

export const [getAdmin, setAdmin] = createContext<AdminContext>();
