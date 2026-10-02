import { NOT_A_WEB_ADDRESS } from './errors.js';
import type { CmsMetaField } from './types.js';

export const isUrlField = (name: string, f: CmsMetaField): boolean =>
	f.kind === 'text' &&
	(f.editor?.props?.format === 'url' || f.editor?.props?.url === true || /url$/i.test(name));

export function isWebAddress(s: string): boolean {
	try {
		const u = new URL(s);
		return u.protocol === 'http:' || u.protocol === 'https:';
	} catch {
		return false;
	}
}

export const isEmpty = (v: unknown): boolean =>
	v == null ||
	(typeof v === 'string' && v.trim() === '') ||
	(typeof v === 'number' && Number.isNaN(v));

/** Empty value for a field in a brand-new record. */
export function blankValue(f: CmsMetaField): unknown {
	if (f.kind === 'array') return [];
	if (f.kind === 'boolean') return false;
	if (f.kind === 'object') {
		return Object.fromEntries(
			Object.entries(f.object?.fields ?? {}).map(([k, sf]) => [k, blankValue(sf)]),
		);
	}
	return null;
}

/** Whether a required field has something in it. Booleans and arrays always do. */
export function isFilled(f: CmsMetaField, v: unknown): boolean {
	if (f.kind === 'boolean' || f.kind === 'array' || f.kind === 'object') return true;
	return !isEmpty(v);
}

/** Fields the editor must fill before a new record can be created. */
export function missingRequired(
	fields: Record<string, CmsMetaField>,
	values: Record<string, unknown>,
): string[] {
	return Object.entries(fields)
		.filter(([k, f]) => f.required && !f.hidden && !isFilled(f, values[k]))
		.map(([k]) => k);
}

/** Check a value in the browser before bothering the server. Returns plain words or null. */
export function checkValue(name: string, f: CmsMetaField, v: unknown): string | null {
	if (isEmpty(v)) return f.required && f.kind !== 'boolean' ? 'This is needed' : null;
	if (isUrlField(name, f) && typeof v === 'string' && !isWebAddress(v.trim()))
		return NOT_A_WEB_ADDRESS;
	return null;
}

/** What goes on the wire: trimmed strings; cleared optional values become null. */
export function toWire(name: string, f: CmsMetaField, v: unknown): unknown {
	if (typeof v === 'string') {
		const t = f.kind === 'text' || f.kind === 'slug' ? v.trim() : v;
		return t === '' ? null : t;
	}
	if (typeof v === 'number' && Number.isNaN(v)) return null;
	return v;
}

/** A whole new record for `create`: empty optional values are left out. */
export function toCreatePayload(
	fields: Record<string, CmsMetaField>,
	values: Record<string, unknown>,
): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [k, f] of Object.entries(fields)) {
		if (f.hidden) continue;
		const v = toWire(k, f, values[k]);
		if (v != null) out[k] = v;
	}
	return out;
}
