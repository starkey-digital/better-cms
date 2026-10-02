import { describe, expect, test } from 'bun:test';
import {
	begin,
	fail,
	idleState,
	mergeSaved,
	sameValue,
	stripText,
	succeed,
} from '../src/lib/logic/autosave.ts';
import { formatDate, fromLocalInput, toDateInput, toLocalInput } from '../src/lib/logic/dates.ts';
import {
	NOT_AN_EMAIL,
	NOT_A_WEB_ADDRESS,
	errorFor,
	errorsWithin,
	parseServerError,
} from '../src/lib/logic/errors.ts';
import {
	addRow,
	markSaved,
	missingCells,
	moveRow,
	removeRow,
	savedRowIds,
	serverErrorFor,
	setRow,
	toRows,
	toValues,
} from '../src/lib/logic/repeater.ts';
import { depluralise, humanise, itemName } from '../src/lib/logic/text.ts';
import { addLabel, previewHref, recordTitle } from '../src/lib/logic/titles.ts';
import type { CmsMetaCollection, CmsMetaField } from '../src/lib/logic/types.ts';
import {
	checkValue,
	isSafeLink,
	isWebAddress,
	missingRequired,
	textFormat,
	toCreatePayload,
} from '../src/lib/logic/values.ts';

const text = (extra: Partial<CmsMetaField> = {}): CmsMetaField => ({
	kind: 'text',
	storage: 'column',
	...extra,
});
const shows: CmsMetaCollection = {
	kind: 'collection',
	slugField: null,
	label: 'Shows',
	admin: { title: '{date} {venue}', previewUrl: '/shows/{slug}' },
	fields: {
		date: {
			kind: 'date',
			storage: 'column',
			required: true,
			editor: { component: 'DateField', props: { dateOnly: true } },
		},
		venue: text({ required: true, label: 'Venue' }),
		ticketUrl: text(),
		slug: { kind: 'slug', storage: 'column' },
	},
};

describe('titles', () => {
	test('template with human date, no id', () => {
		const t = recordTitle('shows', shows, {
			id: 'abc123',
			date: '2026-07-12T00:00:00.000Z',
			venue: 'The Ritz',
		});
		expect(t).toBe('Sun 12 Jul 2026 The Ritz');
		expect(t).not.toContain('abc123');
	});
	test('falls back to untitled', () => {
		expect(recordTitle('shows', { ...shows, admin: undefined }, { id: 'x' })).toBe('Untitled show');
	});
	test('add label and singular', () => {
		expect(addLabel('shows', shows)).toBe('Add a show');
		expect(depluralise('Companies')).toBe('Company');
		expect(depluralise('Releases')).toBe('Release');
		expect(itemName('news', { kind: 'collection', slugField: null, fields: {} })).toBe('news');
	});
	test('admin.itemLabel wins over the derived singular', () => {
		const gigs = { ...shows, admin: { ...shows.admin, itemLabel: 'Gig' } };
		expect(itemName('shows', gigs)).toBe('gig');
		expect(addLabel('shows', gigs)).toBe('Add a gig');
		expect(addLabel('shows', { ...gigs, admin: { itemLabel: 'event' } })).toBe('Add an event');
	});
	test('preview url needs its fields', () => {
		expect(previewHref(shows, { slug: 'a b' })).toBe('/shows/a%20b');
		expect(previewHref(shows, {})).toBeNull();
	});
	test('humanise', () => expect(humanise('ticketUrl')).toBe('Ticket url'));
});

describe('dates', () => {
	test('dateOnly reads as the UTC calendar day', () => {
		expect(toDateInput('2026-07-12T00:00:00.000Z')).toBe('2026-07-12');
		expect(formatDate('2026-07-12T00:00:00.000Z', true)).toBe('Sun 12 Jul 2026');
	});
	test('datetime round-trips through local input', () => {
		const iso = '2026-07-12T19:30:00.000Z';
		expect(fromLocalInput(toLocalInput(iso))).toBe(iso);
		expect(toLocalInput(iso)).not.toBe('');
		expect(fromLocalInput('')).toBeNull();
	});
});

describe('errors', () => {
	test('maps a server path to the field in plain words', () => {
		const p = parseServerError(
			'shows.ticketUrl: Invalid URL; shows.venue: Invalid input: expected string, received undefined',
			'shows',
		);
		expect(p.fields.ticketUrl).toBe(NOT_A_WEB_ADDRESS);
		expect(p.fields.venue).toBe('This is needed');
		expect(p.general).toBeNull();
	});
	test('array paths and lookups', () => {
		const p = parseServerError('site.supportWays.1.url: Invalid URL', 'site');
		expect(errorFor(p.fields, 'supportWays')).toBe(NOT_A_WEB_ADDRESS);
		expect(errorsWithin(p.fields, 'supportWays')).toEqual({ '1.url': NOT_A_WEB_ADDRESS });
	});
	test('non-field failures become plain reasons, never raw', () => {
		const p = parseServerError('[better-cms] 403 Forbidden', 'shows');
		expect(p.general).toContain('permission');
		expect(parseServerError('Failed to fetch', 'shows').general).toContain('internet');
	});
});

describe('autosave state', () => {
	test('idle, saving, saved', () => {
		expect(stripText(idleState()).text).toBe('Changes save when you leave a field');
		const s = begin(idleState());
		expect(stripText(s).text).toBe('Saving…');
		const done = succeed(s, 'a', new Date(2026, 0, 1, 14, 14).getTime());
		expect(stripText(done).text).toBe('All changes saved · 2:14pm');
	});
	test('one bad field does not hide others, and clears on its own success', () => {
		let s = fail(begin(idleState()), 'url', 'that is not a web address');
		expect(stripText(s)).toEqual({
			tone: 'error',
			text: "That didn't save — that is not a web address",
		});
		s = succeed(begin(s), 'other');
		expect(stripText(s).tone).toBe('error');
		s = succeed(begin(s), 'url');
		expect(stripText(s).tone).toBe('saved');
	});
	test('sameValue ignores blank differences and compares deeply', () => {
		expect(sameValue('', null)).toBe(true);
		expect(sameValue(['a', { b: 1 }], ['a', { b: 1 }])).toBe(true);
		expect(sameValue(['a'], ['b'])).toBe(false);
	});
});

describe('values', () => {
	test('required fields gate creation', () => {
		expect(missingRequired(shows.fields, { venue: 'x' })).toEqual(['date']);
		expect(missingRequired(shows.fields, { venue: 'x', date: '2026-01-01' })).toEqual([]);
	});
	test('url check', () => {
		expect(isWebAddress('https://a.com')).toBe(true);
		expect(isWebAddress('a.com')).toBe(false);
		expect(checkValue('ticketUrl', shows.fields.ticketUrl!, 'nope')).toBe(NOT_A_WEB_ADDRESS);
		expect(checkValue('ticketUrl', shows.fields.ticketUrl!, '')).toBeNull();
	});
	test('declared format wins over the field name', () => {
		const url = text({ editor: { component: 'TextField', props: { format: 'url' } } });
		const email = text({ editor: { component: 'TextField', props: { format: 'email' } } });
		expect(textFormat('link', url)).toBe('url');
		expect(textFormat('contact', email)).toBe('email');
		expect(checkValue('contact', email, 'nope')).toBe(NOT_AN_EMAIL);
		expect(checkValue('contact', email, 'a@b.co')).toBeNull();
		expect(checkValue('homeUrl', email, 'https://x.com')).toBe(NOT_AN_EMAIL);
	});
	test('name guess is only a fallback for untagged text', () => {
		expect(textFormat('ticketUrl', text())).toBe('url');
		expect(textFormat('venue', text())).toBeUndefined();
		const plain = text({ editor: { component: 'TextField', props: { multiline: false } } });
		expect(textFormat('ticketUrl', plain)).toBe('url');
	});
	test('create payload omits empties', () => {
		expect(
			toCreatePayload(shows.fields, { venue: ' Ritz ', date: '2026-01-01', ticketUrl: '' }),
		).toEqual({ venue: 'Ritz', date: '2026-01-01' });
	});
});

describe('repeater', () => {
	const rows = toRows(['a', 'b', 'c']);
	const [a, b, c] = rows;
	test('move up/down keeps ids and stops at the ends', () => {
		expect(moveRow(rows, c!.id, -1).map((r) => r.value)).toEqual(['a', 'c', 'b']);
		expect(moveRow(rows, a!.id, -1)).toBe(rows);
		expect(moveRow(rows, c!.id, 1)).toBe(rows);
	});
	test('remove, add and edit by id', () => {
		expect(removeRow(rows, b!.id).map((r) => r.value)).toEqual(['a', 'c']);
		expect(addRow(rows, 'd').length).toBe(4);
		expect(setRow(rows, b!.id, 'z').map((r) => r.value)).toEqual(['a', 'z', 'c']);
	});
	test('blank rows and empty cells are not saved', () => {
		expect(toValues(toRows(['a', '  ', 'b']))).toEqual(['a', 'b']);
		expect(
			toValues(
				toRows([
					{ label: 'x', url: '' },
					{ label: '', url: '' },
				]),
			),
		).toEqual([{ label: 'x' }]);
	});
});

describe('repeater: rows that are not ready to save', () => {
	const cols = { title: text({ required: true }), url: text({ required: true }), note: text() };
	const saved = toRows([{ title: 'A', url: 'https://a.test' }]);

	test('a new row with required cells empty is held back', () => {
		const rows = addRow(saved, { title: 'B', url: null, note: null });
		expect(toValues(rows, cols)).toEqual([{ title: 'A', url: 'https://a.test' }]);
		expect(missingCells(rows[1]!, cols)).toEqual(['url']);
	});

	test('it joins the saved array once complete, and then keeps autosaving', () => {
		let rows = addRow(saved, { title: 'B', url: 'https://b.test', note: null });
		expect(toValues(rows, cols)).toHaveLength(2);
		rows = markSaved(rows, cols);
		rows = setRow(rows, rows[1]!.id, { title: 'B', url: '', note: null });
		expect(toValues(rows, cols)).toHaveLength(2);
	});

	test('markSaved leaves held-back rows unsaved', () => {
		const rows = markSaved(addRow(saved, { title: 'B', url: null }), cols);
		expect(rows.map((r) => !!r.saved)).toEqual([true, false]);
	});
});

describe('repeater: server errors follow the saved index', () => {
	test('a blank row above does not shift the lookup', () => {
		let rows = toRows([{ label: 'x' }, { label: 'y' }]);
		rows = addRow(rows.slice(0, 1), { label: '' });
		rows = addRow(rows, { label: 'z' });
		const ids = savedRowIds(rows);
		expect(ids).toEqual([rows[0]!.id, rows[2]!.id]);
		const errors = { '1.label': 'bad' };
		expect(serverErrorFor(errors, ids, rows[2]!.id, 'label')).toBe('bad');
		expect(serverErrorFor(errors, ids, rows[1]!.id, 'label')).toBeUndefined();
		expect(serverErrorFor({ '0': 'bad' }, ids, rows[0]!.id, null)).toBe('bad');
	});
});

describe('mergeSaved', () => {
	const values = { id: '1', title: 'new', note: 'n', updatedAt: 1 };
	const server = { id: '1', title: 'old', note: 'zzz', updatedAt: 2 };
	test('takes only the saved fields from the response', () => {
		const merged = mergeSaved(values, { title: 'old' }, server, () => true, new Set(['updatedAt']));
		expect(merged).toEqual({ id: '1', title: 'old', note: 'n', updatedAt: 2 });
	});
	test('a stale response cannot overwrite a newer save of the same field', () => {
		const merged = mergeSaved(values, { title: 'old' }, server, () => false);
		expect(merged.title).toBe('new');
	});
	test('falls back to the patch when the response omits the field', () => {
		expect(mergeSaved(values, { note: 'q' }, {}, () => true).note).toBe('q');
	});
});

describe('parseServerError over HTTP', () => {
	const wrapped = (message: string) =>
		`[better-cms] 400 Bad Request: ${JSON.stringify({ error: { code: 'BAD_REQUEST', message } })}`;
	test('maps a singleton field error out of the JSON body', () => {
		expect(parseServerError(wrapped('settings.ticketUrl: Invalid URL'), 'settings')).toEqual({
			fields: { ticketUrl: NOT_A_WEB_ADDRESS },
			general: null,
		});
	});
	test('handles several fields', () => {
		const p = parseServerError(
			wrapped('settings.ticketUrl: Invalid URL; settings.email: Invalid email'),
			'settings',
		);
		expect(Object.keys(p.fields)).toEqual(['ticketUrl', 'email']);
	});
	test('a non-field HTTP failure keeps its status for the plain reason', () => {
		const raw = '[better-cms] 403 Forbidden: {"error":{"code":"FORBIDDEN","message":"nope"}}';
		expect(parseServerError(raw, 'settings').general).toContain('permission');
	});
});

describe('isSafeLink', () => {
	test('allows http, https and relative urls only', () => {
		expect(isSafeLink('https://cdn.test/a.pdf')).toBe(true);
		expect(isSafeLink('http://cdn.test/a.pdf')).toBe(true);
		expect(isSafeLink('/uploads/a.pdf')).toBe(true);
		expect(isSafeLink('javascript:alert(1)')).toBe(false);
		expect(isSafeLink('JaVaScRiPt:alert(1)')).toBe(false);
		expect(isSafeLink('data:text/html,<b>x</b>')).toBe(false);
	});
});
