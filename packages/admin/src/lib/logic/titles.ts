import { formatDate } from './dates.js';
import { itemName, withArticle } from './text.js';
import type { CmsMetaCollection, CmsMetaField, Row } from './types.js';

const PLACEHOLDER = /\{(\w+)\}/g;
const FALLBACK_KEYS = ['title', 'name', 'label', 'headline', 'venue'];

/** A value as a person would read it: dates as dates, never an id. */
export function displayValue(f: CmsMetaField | undefined, v: unknown): string {
	if (v == null || v === '') return '';
	if (f?.kind === 'date') return formatDate(v, f.editor?.props?.dateOnly === true);
	if (f?.kind === 'boolean') return v ? 'Yes' : 'No';
	if (typeof v === 'string' || typeof v === 'number') return String(v);
	return '';
}

function fromTemplate(tpl: string, def: CmsMetaCollection, row: Row): string {
	return tpl
		.replace(PLACEHOLDER, (_, key: string) => displayValue(def.fields[key], row[key]))
		.replace(/\s+/g, ' ')
		.trim();
}

/** The human title of a record. Never the id. */
export function recordTitle(
	name: string,
	def: CmsMetaCollection,
	row: Row | null | undefined,
): string {
	const untitled = `Untitled ${itemName(name, def)}`;
	if (!row) return untitled;
	const configured = def.admin?.title;
	if (configured) {
		const text = configured.includes('{')
			? fromTemplate(configured, def, row)
			: displayValue(def.fields[configured], row[configured]);
		if (text) return text;
	}
	for (const key of FALLBACK_KEYS) {
		const text = displayValue(def.fields[key], row[key]);
		if (text) return text;
	}
	for (const [key, f] of Object.entries(def.fields)) {
		if (f.kind === 'text' || f.kind === 'slug') {
			const text = displayValue(f, row[key]);
			if (text) return text;
		}
	}
	return untitled;
}

/** "Add a show" */
export const addLabel = (name: string, def: CmsMetaCollection): string =>
	`Add ${withArticle(itemName(name, def))}`;

/** Fills `admin.previewUrl` from the row; null when a placeholder has no value yet. */
export function previewHref(def: CmsMetaCollection, row: Row | null | undefined): string | null {
	const tpl = def.admin?.previewUrl;
	if (!tpl) return null;
	let missing = false;
	const out = tpl.replace(PLACEHOLDER, (_, key: string) => {
		const v = row?.[key];
		if (v == null || v === '') missing = true;
		return encodeURIComponent(String(v ?? ''));
	});
	return missing ? null : out;
}
