import type { CmsMeta } from '@better-cms/sveltekit';
import { createContext } from 'svelte';
import type { AdminClient } from './logic/types.js';

export type ToastTone = 'ok' | 'bad';

/** The open form reports unsaved edits here; the shell asks before navigation drops them. */
export type LeaveGuard = { unsaved: () => boolean };

export type AdminContext = {
	client: AdminClient;
	meta: CmsMeta;
	notify(text: string, tone?: ToastTone): void;
	leave: LeaveGuard;
};

export const [getAdmin, setAdmin] = createContext<AdminContext>();
