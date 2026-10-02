import { isEmpty } from './values.js';

/** One repeater row. `id` is client-only and never saved, so edits never jump rows. */
export type RepeaterRow<T = unknown> = { id: string; value: T };

let counter = 0;
export const newRowId = (): string => `r${Date.now().toString(36)}${(counter++).toString(36)}`;

export const toRows = <T>(values: readonly T[] | null | undefined): RepeaterRow<T>[] =>
	(values ?? []).map((value) => ({ id: newRowId(), value }));

export const addRow = <T>(rows: RepeaterRow<T>[], value: T): RepeaterRow<T>[] => [
	...rows,
	{ id: newRowId(), value },
];

export const removeRow = <T>(rows: RepeaterRow<T>[], id: string): RepeaterRow<T>[] =>
	rows.filter((r) => r.id !== id);

export function moveRow<T>(rows: RepeaterRow<T>[], id: string, by: -1 | 1): RepeaterRow<T>[] {
	const from = rows.findIndex((r) => r.id === id);
	const to = from + by;
	if (from < 0 || to < 0 || to >= rows.length) return rows;
	const next = [...rows];
	[next[from], next[to]] = [next[to]!, next[from]!];
	return next;
}

export const setRow = <T>(rows: RepeaterRow<T>[], id: string, value: T): RepeaterRow<T>[] =>
	rows.map((r) => (r.id === id ? { ...r, value } : r));

/** A row with nothing in it yet is not part of the saved array. */
export function isBlankRow(value: unknown): boolean {
	if (value !== null && typeof value === 'object') {
		return Object.values(value).every((v) => isBlankRow(v));
	}
	if (typeof value === 'boolean') return false;
	return isEmpty(value);
}

/** The array to save: blank rows dropped, empty optional cells omitted, strings trimmed. */
export function toValues(rows: RepeaterRow[]): unknown[] {
	return rows
		.filter((r) => !isBlankRow(r.value))
		.map((r) => {
			const v = r.value;
			if (typeof v === 'string') return v.trim();
			if (v !== null && typeof v === 'object') {
				return Object.fromEntries(
					Object.entries(v)
						.filter(([, cell]) => !isEmpty(cell))
						.map(([k, cell]) => [k, typeof cell === 'string' ? cell.trim() : cell]),
				);
			}
			return v;
		});
}
