import { clockTime } from './dates.js';

/**
 * What the status strip is saying. Failures are tracked per field key so one
 * bad field never hides another field's save, and a later good save of the
 * same field clears its own error.
 */
export type SaveState = {
	pending: number;
	savedAt: number | null;
	errors: Record<string, string>;
};

export const idleState = (): SaveState => ({ pending: 0, savedAt: null, errors: {} });

export const begin = (s: SaveState): SaveState => ({ ...s, pending: s.pending + 1 });

export function succeed(s: SaveState, key: string, at = Date.now()): SaveState {
	const { [key]: _gone, ...errors } = s.errors;
	return { pending: Math.max(0, s.pending - 1), savedAt: at, errors };
}

export function fail(s: SaveState, key: string, reason: string): SaveState {
	return { ...s, pending: Math.max(0, s.pending - 1), errors: { ...s.errors, [key]: reason } };
}

export function clearError(s: SaveState, key: string): SaveState {
	const { [key]: _gone, ...errors } = s.errors;
	return { ...s, errors };
}

export type StripTone = 'idle' | 'saving' | 'saved' | 'unsaved' | 'error';

/** `manual` is set when the form saves on a Save button (`admin.autosave: false`). */
export function stripText(
	s: SaveState,
	manual?: { unsaved: boolean },
): { tone: StripTone; text: string } {
	if (s.pending > 0) return { tone: 'saving', text: 'Saving…' };
	const first = Object.values(s.errors)[0];
	if (first) return { tone: 'error', text: `That didn't save — ${first}` };
	if (manual?.unsaved) return { tone: 'unsaved', text: 'You have changes that aren’t saved yet' };
	if (s.savedAt != null) {
		return { tone: 'saved', text: `All changes saved · ${clockTime(new Date(s.savedAt))}` };
	}
	return {
		tone: 'idle',
		text: manual ? 'Changes save when you press Save' : 'Changes save when you leave a field',
	};
}

/** Structural equality for values that came out of JSON. */
export function sameValue(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	const blank = (v: unknown) => v == null || v === '';
	if (blank(a) && blank(b)) return true;
	if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
	if (Array.isArray(a) !== Array.isArray(b)) return false;
	const ka = Object.keys(a);
	const kb = Object.keys(b);
	if (ka.length !== kb.length) return false;
	return ka.every((k) =>
		sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
	);
}

/**
 * Fold a save response into the form's values. Only the fields that save
 * wrote are taken, and only while it is still the newest save of that field
 * (`isLatest`): an older response arriving late must not undo a newer edit.
 * `passthrough` names server-owned fields (`updatedAt`) that always follow the response.
 */
export function mergeSaved(
	values: Record<string, unknown>,
	patch: Record<string, unknown>,
	row: Record<string, unknown>,
	isLatest: (key: string) => boolean,
	passthrough: ReadonlySet<string> = new Set(),
): Record<string, unknown> {
	const next = { ...values };
	for (const key of passthrough) if (key in row) next[key] = row[key];
	for (const key of Object.keys(patch)) {
		if (isLatest(key)) next[key] = key in row ? row[key] : patch[key];
	}
	return next;
}

/**
 * The edits still waiting for Save once `sent` has saved. A field edited again
 * while the save was in flight keeps its newer value.
 */
export function stillPending(
	pending: Record<string, unknown>,
	sent: Record<string, unknown>,
): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(pending).filter(([k, v]) => !(k in sent && sameValue(v, sent[k]))),
	);
}
