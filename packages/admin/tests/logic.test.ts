import { describe, expect, test } from 'bun:test';
import {
	begin,
	fail,
	idleState,
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
import { addRow, moveRow, removeRow, setRow, toRows, toValues } from '../src/lib/logic/repeater.ts';
import { depluralise, humanise, itemName } from '../src/lib/logic/text.ts';
import { addLabel, previewHref, recordTitle } from '../src/lib/logic/titles.ts';
import type { CmsMetaCollection, CmsMetaField } from '../src/lib/logic/types.ts';
import {
	checkValue,
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
