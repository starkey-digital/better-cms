import type { CmsMetaCollection, CmsMetaField } from './types.js';

/** `ticketUrl` -> `Ticket url`, `release_date` -> `Release date`. */
export function humanise(key: string): string {
	const spaced = key
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/[_-]+/g, ' ')
		.trim()
		.toLowerCase();
	return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export const fieldLabel = (name: string, f: CmsMetaField): string => f.label ?? humanise(name);

export const collectionLabel = (name: string, def: CmsMetaCollection): string =>
	def.label ?? humanise(name);

/** "Shows" -> "show", "Companies" -> "company", "News" stays. Lower-cased for mid-sentence use. */
export function depluralise(word: string): string {
	const w = word.trim();
	if (/ies$/i.test(w)) return `${w.slice(0, -3)}y`;
	if (/(ss|us|is|news)$/i.test(w)) return w;
	if (/(sses|xes|ches|shes)$/i.test(w)) return w.slice(0, -2);
	if (/s$/i.test(w)) return w.slice(0, -1);
	return w;
}

/** The name of one record, lower case: "show". `admin.itemLabel` wins when the schema sets it. */
export function itemName(name: string, def: CmsMetaCollection): string {
	const explicit = def.admin?.itemLabel?.trim();
	if (explicit) return explicit.toLowerCase();
	return depluralise(collectionLabel(name, def)).toLowerCase();
}

/** Name of one array row, "Track" -> "track". Falls back to "item". */
export function rowName(f: CmsMetaField): string {
	const label = f.editor?.props?.itemLabel;
	return typeof label === 'string' && label ? label : 'item';
}

export const withArticle = (noun: string): string =>
	`${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}`;

export const sentenceList = (items: string[]): string =>
	items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
