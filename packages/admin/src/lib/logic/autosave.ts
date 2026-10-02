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

export type StripTone = 'idle' | 'saving' | 'saved' | 'error';

export function stripText(s: SaveState): { tone: StripTone; text: string } {
	if (s.pending > 0) return { tone: 'saving', text: 'Saving…' };
	const first = Object.values(s.errors)[0];
	if (first) return { tone: 'error', text: `That didn't save — ${first}` };
	if (s.savedAt != null) {
		return { tone: 'saved', text: `All changes saved · ${clockTime(new Date(s.savedAt))}` };
	}
	return { tone: 'idle', text: 'Changes save when you leave a field' };
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
