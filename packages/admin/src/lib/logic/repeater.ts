import type { CmsMetaField } from './types.js';
import { isEmpty, missingRequired } from './values.js';

/**
 * One repeater row. `id` is client-only and never saved, so edits never jump
 * rows. `saved` is set once the row has been part of a saved array.
 */
export type RepeaterRow<T = unknown> = { id: string; value: T; saved?: boolean };

let counter = 0;
export const newRowId = (): string => `r${Date.now().toString(36)}${(counter++).toString(36)}`;

export const toRows = <T>(values: readonly T[] | null | undefined): RepeaterRow<T>[] =>
	(values ?? []).map((value) => ({ id: newRowId(), value, saved: true }));

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

type Columns = Record<string, CmsMetaField>;

/** Names of the required cells a row has not filled yet. Plain-value rows have none. */
export function missingCells(row: RepeaterRow, columns: Columns): string[] {
	const v = row.value;
	if (v === null || typeof v !== 'object') return [];
	return missingRequired(columns, v as Record<string, unknown>);
}

/**
 * The rows that belong in the saved array: not blank, and either already saved
 * once or complete. A half-filled new row would only fail validation on the
 * first blur, so it waits until its required cells are filled.
 */
export const savedRows = (rows: RepeaterRow[], columns: Columns = {}): RepeaterRow[] =>
	rows.filter((r) => !isBlankRow(r.value) && (r.saved || missingCells(r, columns).length === 0));

/** Mark the rows that are about to be saved, so they keep autosaving even if a required cell is later cleared. */
export const markSaved = (rows: RepeaterRow[], columns: Columns = {}): RepeaterRow[] => {
	const ids = new Set(savedRows(rows, columns).map((r) => r.id));
	return rows.map((r) => (ids.has(r.id) && !r.saved ? { ...r, saved: true } : r));
};

/** Row ids in saved-array order: the server reports errors by saved index, not by position on screen. */
export const savedRowIds = (rows: RepeaterRow[], columns: Columns = {}): string[] =>
	savedRows(rows, columns).map((r) => r.id);

/** The server error for a row's cell (`col` null for a plain-value row), looked up through the saved index. */
export function serverErrorFor(
	errors: Record<string, string>,
	ids: readonly string[],
	rowId: string,
	col: string | null,
): string | undefined {
	const index = ids.indexOf(rowId);
	return index < 0 ? undefined : errors[col === null ? `${index}` : `${index}.${col}`];
}

/** The array to save: blank and not-yet-complete rows dropped, empty optional cells omitted, strings trimmed. */
export function toValues(rows: RepeaterRow[], columns: Columns = {}): unknown[] {
	return savedRows(rows, columns).map((r) => {
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
